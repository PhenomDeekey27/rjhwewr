"""In-process cache for prepared (validated) January 2026 data.

Why this exists
---------------
Every raw Elexon window request is already cached by :class:`ElexonClient` for
five minutes, but rebuilding a response still re-validates ~18,000 WINDFOR rows
and ~1,500 FUELHH rows through pydantic on every HTTP request. That made page
navigation, refreshes and the accuracy analysis repeat seconds of work for data
that is fixed historical outturn.

This module caches the *prepared* envelopes (validated, de-duplicated, scoped
and sorted records plus their quality metadata). A page request then only
slices/filters the prepared result; it never downloads, re-validates or
re-sorts the whole dataset.

Honesty rules
-------------
* ``refresh=True`` bypasses the cache and rebuilds from the upstream API. The
  caller also clears the lower-level HTTP cache so a refresh is a real refresh,
  not a replay of responses cached seconds earlier.
* A cached response keeps its original ``retrievedAt``; ``meta.prepared`` says
  whether it came from the cache, when it was prepared, its age and the TTL.
  Nothing claims to be fresher than it is.
* Failed builds are never cached: an upstream error is returned as an error on
  every attempt instead of silently serving stale data as success.

The cache is intentionally per-process and lock-protected. It is safe for the
sync FastAPI routes, which run in a thread pool. TTL is configurable with
``PREPARED_CACHE_TTL_SECONDS`` (default 600).
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Generic, TypeVar

from services.models import Meta, PreparedInfo

T = TypeVar("T")

DEFAULT_TTL_SECONDS = 600


def _configured_ttl() -> int:
    raw = os.getenv("PREPARED_CACHE_TTL_SECONDS", "").strip()
    if not raw:
        return DEFAULT_TTL_SECONDS
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_TTL_SECONDS
    return max(0, value)


@dataclass(frozen=True)
class PreparedResult(Generic[T]):
    """A prepared value plus provenance the response can report."""

    value: T
    cached: bool
    prepared_at: datetime
    age_seconds: float
    ttl_seconds: int

    def info(self) -> PreparedInfo:
        return PreparedInfo(
            cached=self.cached,
            prepared_at=self.prepared_at,
            age_seconds=round(self.age_seconds, 3),
            ttl_seconds=self.ttl_seconds,
        )


@dataclass
class _Entry:
    value: object
    prepared_at: datetime
    monotonic_at: float


_cache: dict[str, _Entry] = {}
_cache_lock = threading.Lock()
_build_lock = threading.Lock()


def _fresh(entry: _Entry, now_monotonic: float, ttl: int) -> bool:
    if ttl <= 0:
        return False
    return (now_monotonic - entry.monotonic_at) < ttl


def _result(entry: _Entry, *, cached: bool, ttl: int) -> PreparedResult:
    age = max(0.0, time.monotonic() - entry.monotonic_at)
    return PreparedResult(
        value=entry.value,
        cached=cached,
        prepared_at=entry.prepared_at,
        age_seconds=age,
        ttl_seconds=ttl,
    )


def get_prepared(
    key: str,
    builder: Callable[[], T],
    *,
    refresh: bool = False,
) -> PreparedResult[T]:
    """Return a cached prepared value, building it once when needed.

    Only one builder runs at a time, so concurrent page requests during a cold
    start cannot trigger duplicate full-dataset upstream fetches.
    """
    ttl = _configured_ttl()
    now = time.monotonic()
    with _cache_lock:
        entry = _cache.get(key)
        if entry is not None and not refresh and _fresh(entry, now, ttl):
            return _result(entry, cached=True, ttl=ttl)  # type: ignore[return-value]

    with _build_lock:
        # Another request may have built the value while this one waited.
        now = time.monotonic()
        with _cache_lock:
            entry = _cache.get(key)
            if entry is not None and not refresh and _fresh(entry, now, ttl):
                return _result(entry, cached=True, ttl=ttl)  # type: ignore[return-value]

        value = builder()  # upstream/validation errors propagate; nothing is cached
        entry = _Entry(
            value=value,
            prepared_at=datetime.now(timezone.utc),
            monotonic_at=time.monotonic(),
        )
        with _cache_lock:
            _cache[key] = entry
        return _result(entry, cached=False, ttl=ttl)  # type: ignore[return-value]


def clear_prepared_cache() -> None:
    """Drop every prepared value (tests and explicit refresh)."""
    with _cache_lock:
        _cache.clear()


def with_prepared_meta(meta: Meta, prepared: PreparedResult) -> Meta:
    """Copy ``meta`` and attach the cache provenance without mutating the cache."""
    return meta.model_copy(update={"prepared": prepared.info()})


__all__ = [
    "DEFAULT_TTL_SECONDS",
    "PreparedResult",
    "clear_prepared_cache",
    "get_prepared",
    "with_prepared_meta",
]
