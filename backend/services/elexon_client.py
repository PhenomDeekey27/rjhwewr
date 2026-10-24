"""HTTP client for the Elexon Insights API and the window chunking it needs.

Everything that talks to Elexon lives under ``backend/services/`` (Stage 3
requirement); routes only call into the services.

Endpoint parameters were verified against the official Insights API
documentation (the OpenAPI definition served behind
https://bmrs.elexon.co.uk/api-documentation) and re-checked against the live
API on 2026-10-24 — nothing here is guessed:

* Base URL: ``https://data.elexon.co.uk/bmrs/api/v1`` — no API key, no auth.
* ``GET /datasets/WINDFOR`` — query params ``publishDateTimeFrom``,
  ``publishDateTimeTo`` (RFC 3339 / ``yyyy-MM-ddTHH:mm:ssZ``), ``format``.
  Without publish filters it returns only the latest published forecast, so a
  publish window is required to retrieve history.
* ``GET /datasets/FUELHH`` — query params ``settlementDateFrom`` /
  ``settlementDateTo`` (``yyyy-MM-dd``), ``publishDateTimeFrom`` /
  ``publishDateTimeTo`` (mutually exclusive with the settlement dates),
  ``settlementPeriod``, ``fuelType`` (repeated for multiple values),
  ``format``.
* **Range limit (both endpoints):** a single request must not span more than
  7 days inclusive; the API answers HTTP 400 otherwise. Retrieved live:
  ``The date range between SettlementDateFrom and SettlementDateTo inclusive
  must not exceed 7 days`` (and the same for the publish-time pair). The
  whole January window is therefore paged as a sequence of ≤7-day requests.
* Documented responses: HTTP 400 (bad query), 429 (rate limit), 500 (upstream
  error). Documented body shape is ``{"data": [...]}`` (``data`` may be null).

Both endpoints return JSON when ``format=json``; ``data`` is a list of row
objects. Errors come back as an RFC 7807 problem document.
"""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Sequence

import httpx

DEFAULT_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_RETRIES = 2
DEFAULT_BACKOFF_SECONDS = 0.5

#: Elexon documents 429 (rate limit) and 500 (server error); gateways are
#: included because they are transient by nature.
RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

#: Documented maximum inclusive span of a single date/publish-time request.
MAX_WINDOW_DAYS = 7

USER_AGENT = "wind-forecast-accuracy/0.1 (Stage 3 Elexon integration)"

# In-memory cache for upstream responses (path + params -> response)
# TTL: 5 minutes (300 seconds) - data is static for January 2026
_CACHE_TTL_SECONDS = 300
_cache: dict[str, tuple[float, Any]] = {}


class ElexonApiError(Exception):
    """Upstream API failure (HTTP error, bad payload, exhausted retries)."""

    def __init__(
        self,
        message: str,
        *,
        upstream_status: int | None = None,
        detail: str | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.upstream_status = upstream_status
        self.detail = detail
        self.retryable = retryable

    def __str__(self) -> str:  # pragma: no cover - cosmetic
        if self.detail:
            return f"{self.message}: {self.detail}"
        return self.message


class ElexonTimeoutError(ElexonApiError):
    """The upstream API did not answer within the configured timeout."""

    def __init__(self, message: str = "Elexon request timed out") -> None:
        super().__init__(message, retryable=True)


def iso_z(value: datetime) -> str:
    """Format an aware datetime the way the API documents: ``...Z``."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def chunk_datetime_windows(
    start: datetime,
    end_exclusive: datetime,
    max_span: timedelta = timedelta(days=MAX_WINDOW_DAYS),
) -> list[tuple[datetime, datetime]]:
    """Tile ``[start, end_exclusive)`` with inclusive windows of ``max_span``.

    The API treats both bounds as inclusive and rejects spans over 7 days, so
    each chunk ends one second before the next chunk starts: windows are
    contiguous, never overlapping (no duplicated rows) and never wider than
    the documented limit.
    """
    if end_exclusive < start:
        raise ValueError("end_exclusive must not be before start")
    windows: list[tuple[datetime, datetime]] = []
    cursor = start
    while cursor < end_exclusive:
        stop = min(cursor + max_span, end_exclusive)
        windows.append((cursor, stop - timedelta(seconds=1)))
        cursor = stop
    return windows


def chunk_date_windows(
    start: date,
    end_inclusive: date,
    max_days: int = MAX_WINDOW_DAYS,
) -> list[tuple[date, date]]:
    """Tile ``[start, end_inclusive]`` with inclusive windows of ``max_days``."""
    if end_inclusive < start:
        raise ValueError("end_inclusive must not be before start")
    windows: list[tuple[date, date]] = []
    cursor = start
    while cursor <= end_inclusive:
        stop = min(cursor + timedelta(days=max_days - 1), end_inclusive)
        windows.append((cursor, stop))
        cursor = stop + timedelta(days=1)
    return windows


def extract_rows(payload: Any, *, path: str) -> list[Any]:
    """Pull the ``data`` array out of an Elexon dataset response.

    ``data`` may be ``null`` (documented) which means "no rows". Anything else
    that is not the documented shape is an upstream error, not empty data.
    """
    if not isinstance(payload, dict):
        raise ElexonApiError(
            "Unexpected response shape from Elexon",
            detail=f"{path} did not return a JSON object",
        )
    if "data" not in payload:
        raise ElexonApiError(
            "Unexpected response shape from Elexon",
            detail=f"{path} response has no 'data' field",
        )
    rows = payload["data"]
    if rows is None:
        return []
    if not isinstance(rows, list):
        raise ElexonApiError(
            "Unexpected response shape from Elexon",
            detail=f"{path} 'data' is not a list",
        )
    return rows


class ElexonClient:
    """Small synchronous JSON client with bounded retries.

    ``sleep`` and ``transport`` are injectable so tests can run against
    ``httpx.MockTransport`` with no real delays and no network access.
    """

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_seconds: float = DEFAULT_BACKOFF_SECONDS,
        sleep: Callable[[float], None] = time.sleep,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self.backoff_seconds = backoff_seconds
        self._sleep = sleep
        # Creating an httpx.Client builds an SSL context (~0.1-0.2 s on
        # Windows). Most requests are answered from the prepared cache and
        # never touch the network, so the client is created on first use.
        self._client_options = {
            "timeout": timeout,
            "transport": transport,
            "headers": {
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
            },
            "follow_redirects": True,
        }
        self._client: httpx.Client | None = None

    @property
    def http(self) -> httpx.Client:
        """The underlying HTTP client, created lazily on first request."""
        if self._client is None:
            self._client = httpx.Client(
                base_url=self.base_url, **self._client_options
            )
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    def __enter__(self) -> "ElexonClient":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    @staticmethod
    def _cache_key(path: str, params: dict[str, Any] | None) -> str:
        """Generate a deterministic cache key from path and params."""
        if not params:
            return path
        # Sort params for consistent key
        sorted_params = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        return f"{path}?{sorted_params}"

    def _get_cached(self, path: str, params: dict[str, Any] | None) -> Any | None:
        """Get cached response if still valid."""
        key = self._cache_key(path, params)
        if key in _cache:
            timestamp, data = _cache[key]
            if time.time() - timestamp < _CACHE_TTL_SECONDS:
                print(f"CACHE HIT: {key}")
                return data
            else:
                # Expired
                print(f"CACHE EXPIRED: {key}")
                del _cache[key]
        print(f"CACHE MISS: {key}")
        return None

    def _set_cached(self, path: str, params: dict[str, Any] | None, data: Any) -> None:
        """Store response in cache."""
        key = self._cache_key(path, params)
        print(f"CACHE SET: {key}")
        _cache[key] = (time.time(), data)

    # -- core request ------------------------------------------------------ #

    def get_json(
        self, path: str, params: dict[str, Any] | None = None
    ) -> Any:
        """GET ``path`` and return the decoded JSON body.

        Raises :class:`ElexonTimeoutError` on timeout and
        :class:`ElexonApiError` on HTTP errors, malformed bodies or exhausted
        retries. Retries are bounded and the delay is injectable.
        """
        # Check cache first (only for GET requests, which this is)
        cached = self._get_cached(path, params)
        if cached is not None:
            return cached

        attempts = self.max_retries + 1
        last_error: ElexonApiError | None = None

        for attempt in range(attempts):
            retry_after: float | None = None
            try:
                response = self.http.get(path, params=params)
            except httpx.TimeoutException as exc:
                last_error = ElexonTimeoutError()
            except httpx.TransportError as exc:
                last_error = ElexonApiError(
                    "Elexon request failed before a response was received",
                    detail=str(exc) or exc.__class__.__name__,
                    retryable=True,
                )
            else:
                if response.status_code == 200:
                    try:
                        data = response.json()
                    except ValueError as exc:
                        raise ElexonApiError(
                            "Elexon returned a non-JSON body",
                            upstream_status=200,
                            detail=str(exc),
                        ) from exc
                    # Cache successful responses
                    self._set_cached(path, params, data)
                    return data

                detail = _problem_detail(response)
                error = ElexonApiError(
                    "Elexon request failed",
                    upstream_status=response.status_code,
                    detail=detail,
                    retryable=response.status_code in RETRYABLE_STATUS_CODES,
                )
                if response.status_code not in RETRYABLE_STATUS_CODES:
                    # 400 (bad query / range limit) and other 4xx are the
                    # caller's problem: retrying cannot fix them.
                    raise error
                last_error = error
                retry_after = _retry_after_seconds(response)

            if attempt < attempts - 1:
                delay = (
                    retry_after
                    if retry_after is not None
                    else self.backoff_seconds * (2**attempt)
                )
                self._sleep(delay)

        assert last_error is not None
        raise last_error


def _problem_detail(response: httpx.Response) -> str:
    """Extract a readable message from an RFC 7807 error document."""
    try:
        body = response.json()
    except ValueError:
        text = (response.text or "").strip()
        return text[:500] or f"HTTP {response.status_code}"
    if isinstance(body, dict):
        errors = body.get("errors")
        if isinstance(errors, dict):
            parts = [
                f"{'.'.join(k.split('.')) if k else 'request'}: {'; '.join(v)}"
                for k, v in errors.items()
                if isinstance(v, list)
            ]
            if parts:
                return "; ".join(parts)
        for key in ("detail", "title", "message"):
            if isinstance(body.get(key), str):
                return body[key]
    return f"HTTP {response.status_code}"


def _retry_after_seconds(response: httpx.Response) -> float | None:
    value = response.headers.get("Retry-After")
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        return None


def clear_cache() -> None:
    """Clear the upstream response cache (mainly for testing)."""
    _cache.clear()