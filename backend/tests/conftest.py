"""Shared fixtures: a mock Elexon transport and payload builders.

Every test in this suite runs against ``httpx.MockTransport`` — no test opens
a socket or depends on Elexon's live service (Stage 3 requirement 7).

The mock routes requests by path (after the API base prefix) and records every
call, so tests can assert on the exact query parameters and pagination
windows the services issue.
"""

from __future__ import annotations

from typing import Any, Callable

import httpx
import pytest
from fastapi.testclient import TestClient

import main
from routes.elexon import get_elexon_client
from services.elexon_client import ElexonClient, clear_cache
from services.prepared import clear_prepared_cache

#: Path prefix of the real base URL; stripped so routes can be keyed by
#: "/datasets/WINDFOR" and so tests never touch the network.
API_PREFIX = "/bmrs/api/v1"

Payload = dict[str, Any]
Handler = Callable[[dict[str, str]], Any]


class MockElexon:
    """Routes by path to a payload, a handler, or an exception to raise."""

    def __init__(self, routes: dict[str, Any] | None = None) -> None:
        self.routes: dict[str, Any] = dict(routes or {})
        self.calls: list[dict[str, str]] = []

    @property
    def paths(self) -> list[str]:
        return [call["path"] for call in self.calls]

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.startswith(API_PREFIX):
            path = path[len(API_PREFIX) :]
        params = dict(request.url.params.multi_items())
        self.calls.append({"path": path, **params})

        if path not in self.routes:
            return httpx.Response(
                500,
                json={"title": f"unexpected request to {path}"},
            )

        route = self.routes[path]
        if isinstance(route, Exception):
            raise route
        if isinstance(route, type) and issubclass(route, Exception):
            raise route("simulated transport failure")

        result = route(params) if callable(route) else route
        if isinstance(result, Exception):
            raise result
        if isinstance(result, httpx.Response):
            return result
        return httpx.Response(200, json=result)


def rows_returning(rows: list[dict], key: str, extra: Handler | None = None) -> Handler:
    """Serve only the rows whose ``key`` field falls inside the request window.

    Timestamps/dates are compared as ISO strings, which is exactly how the
    API documents them, so the windows a service asks for determine the rows
    it receives — a real check that pagination covers the range.
    """

    def handler(params: dict[str, str]) -> Any:
        if extra is not None:
            result = extra(params)
            if result is not None:
                return result
        start = params.get("publishDateTimeFrom") or params.get(
            "settlementDateFrom"
        )
        end = params.get("publishDateTimeTo") or params.get(
            "settlementDateTo"
        )
        selected = [
            row
            for row in rows
            if (start is None or row[key] >= start)
            and (end is None or row[key] <= end)
        ]
        return {"data": selected}

    return handler


def windfor_row(
    publish_time: str,
    start_time: str,
    generation: int | None = 1000,
    *,
    omit: tuple[str, ...] = (),
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "dataset": "WINDFOR",
        "publishTime": publish_time,
        "startTime": start_time,
        "generation": generation,
    }
    return {k: v for k, v in row.items() if k not in omit}


def fuelhh_row(
    publish_time: str | None,
    start_time: str | None,
    settlement_date: str | None = "2026-01-01",
    settlement_period: int | None = 1,
    fuel_type: str | None = "WIND",
    generation: int | None = 1000,
    *,
    omit: tuple[str, ...] = (),
) -> dict[str, Any]:
    row = {
        "dataset": "FUELHH",
        "publishTime": publish_time,
        "startTime": start_time,
        "settlementDate": settlement_date,
        "settlementPeriod": settlement_period,
        "fuelType": fuel_type,
        "generation": generation,
    }
    return {k: v for k, v in row.items() if k not in omit}


@pytest.fixture(autouse=True)
def _clear_elexon_cache():
    """Clear the upstream and prepared caches before each test."""
    clear_cache()
    clear_prepared_cache()
    yield
    clear_cache()
    clear_prepared_cache()


def make_client(routes: dict[str, Any] | None = None) -> tuple[ElexonClient, MockElexon]:
    """Client wired to a mock transport; ``sleep`` never sleeps in tests."""
    mock = MockElexon(routes)
    client = ElexonClient(
        transport=httpx.MockTransport(mock),
        sleep=lambda seconds: None,
        max_retries=2,
        backoff_seconds=0.0,
    )
    return client, mock


@pytest.fixture
def service_client():
    """Factory: ``client, mock = service_client({path: payload_or_handler})``."""
    created: list[ElexonClient] = []

    def factory(routes: dict[str, Any] | None = None):
        client, mock = make_client(routes)
        created.append(client)
        return client, mock

    yield factory
    for client in created:
        client.close()


@pytest.fixture
def api():
    """Register a mock Elexon client as the FastAPI dependency."""

    def factory(routes: dict[str, Any] | None = None) -> MockElexon:
        client, mock = make_client(routes)
        main.app.dependency_overrides[get_elexon_client] = lambda: client
        return mock

    yield factory
    main.app.dependency_overrides.pop(get_elexon_client, None)


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)