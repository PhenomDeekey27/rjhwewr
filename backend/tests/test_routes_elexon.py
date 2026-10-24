"""Tests for the /api/elexon routes: envelopes and upstream failures."""

from math import sqrt

import pytest

from fastapi.testclient import TestClient

from main import app
from routes.elexon import get_elexon_client
from tests.conftest import fuelhh_row, rows_returning, windfor_row


def _january_rows():
    """Two hourly forecasts, two forecast versions and half-hourly actuals."""
    windfor = [
        windfor_row("2025-12-30T02:30:00Z", "2026-01-01T00:00:00Z", 100),
        windfor_row("2025-12-31T08:00:00Z", "2026-01-01T00:00:00Z", 110),
        windfor_row("2025-12-30T02:30:00Z", "2026-01-01T01:00:00Z", 200),
    ]
    fuelhh = [
        fuelhh_row("2026-01-01T00:15:00Z", "2026-01-01T00:00:00Z", generation=90, settlement_period=1),
        fuelhh_row("2026-01-01T00:45:00Z", "2026-01-01T00:30:00Z", generation=95, settlement_period=2),
        fuelhh_row("2026-01-01T01:15:00Z", "2026-01-01T01:00:00Z", generation=190, settlement_period=3),
        fuelhh_row("2026-01-01T01:45:00Z", "2026-01-01T01:30:00Z", generation=195, settlement_period=4),
    ]
    return windfor, fuelhh


def _mock_january(api):
    windfor, fuelhh = _january_rows()
    return api(
        {
            "/datasets/WINDFOR": rows_returning(windfor, "publishTime"),
            "/datasets/FUELHH": rows_returning(fuelhh, "startTime"),
        }
    )


def test_windfor_route_returns_envelope(api, client: TestClient):
    mock = api({"/datasets/WINDFOR": {"data": []}})

    response = client.get("/api/elexon/windfor")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"data", "meta", "quality"}
    assert body["data"] == []
    assert body["meta"]["datasets"] == ["WINDFOR"]
    assert "quality" in body


def test_fuelhh_route_upstream_timeout_returns_504_envelope(api, client: TestClient):
    from httpx import ReadTimeout

    api({"/datasets/FUELHH": ReadTimeout("simulated timeout")})

    response = client.get("/api/elexon/fuelhh")

    assert response.status_code == 504
    body = response.json()
    assert body["data"] == []
    assert body["meta"]["error"]["type"] == "timeout"
    assert body["quality"]["notes"]


def test_summary_route_upstream_http_error_returns_502_envelope(api, client: TestClient):
    import httpx

    api({"/datasets/WINDFOR": httpx.Response(500, json={"title": "boom"})})

    response = client.get("/api/elexon/january-2026")

    assert response.status_code == 502
    body = response.json()
    assert body["data"] == []
    assert body["meta"]["error"]["type"] == "upstreamError"
    assert body["meta"]["error"]["upstreamStatus"] == 500


def test_explorer_route_paginates_raw_records_server_side(api, client: TestClient):
    mock = _mock_january(api)

    response = client.get("/api/elexon/explorer?page=1&perPage=2")

    assert response.status_code == 200
    body = response.json()
    # 3 forecast versions + 2 FUELHH half-hours with no forecast row.
    assert body["meta"]["recordPage"] == {
        "page": 1,
        "perPage": 2,
        "totalRecords": 5,
        "totalPages": 3,
        "returned": 2,
        "sort": "deliveryTime",
        "direction": "asc",
        "filters": {},
    }
    assert len(body["data"]) == 2
    first = body["data"][0]
    assert first["deliveryTime"] == "2026-01-01T00:00:00Z"
    assert first["forecastPublished"] == "2025-12-30T02:30:00Z"
    assert first["forecastGeneration"] == 100
    assert first["actualGeneration"] == 90
    assert first["error"] == 10
    assert first["matchStatus"] == "Source data only"
    assert body["meta"]["recordCounts"] == {"WINDFOR": 3, "FUELHH": 4}
    assert body["meta"]["prepared"]["cached"] is False

    # Page navigation uses the prepared data: no further upstream requests.
    calls_after_first_page = len(mock.calls)
    second = client.get("/api/elexon/explorer?page=2&perPage=2")
    assert second.status_code == 200
    assert second.json()["meta"]["recordPage"]["page"] == 2
    assert len(mock.calls) == calls_after_first_page
    assert second.json()["meta"]["prepared"]["cached"] is True


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "perPage=0",
        "sort=nope",
        "direction=sideways",
    ],
)
def test_explorer_route_rejects_invalid_pagination_parameters(
    api, client: TestClient, query: str
):
    api({"/datasets/WINDFOR": {"data": []}, "/datasets/FUELHH": {"data": []}})

    response = client.get(f"/api/elexon/explorer?{query}")

    assert response.status_code == 422


def test_explorer_refresh_rebuilds_and_bypasses_the_prepared_cache(api, client: TestClient):
    mock = _mock_january(api)

    client.get("/api/elexon/explorer?page=1&perPage=2")
    calls_after_first_load = len(mock.calls)
    client.get("/api/elexon/explorer?page=1&perPage=2")
    assert len(mock.calls) == calls_after_first_load

    refreshed = client.get("/api/elexon/explorer?page=1&perPage=2&refresh=true")

    assert refreshed.status_code == 200
    assert refreshed.json()["meta"]["prepared"]["cached"] is False
    assert len(mock.calls) == calls_after_first_load * 2


def test_explorer_route_upstream_failure_returns_502_envelope(api, client: TestClient):
    import httpx

    api({"/datasets/WINDFOR": httpx.Response(500, json={"title": "boom"})})

    response = client.get("/api/elexon/explorer?page=1&perPage=25")

    assert response.status_code == 502
    body = response.json()
    assert body["data"] == []
    assert body["meta"]["error"]["type"] == "upstreamError"


def test_forecast_accuracy_route_returns_selected_and_scored_intervals(
    api, client: TestClient
):
    _mock_january(api)

    response = client.get("/api/elexon/forecast-accuracy")

    assert response.status_code == 200
    body = response.json()
    summary = body["data"]["summary"]
    assert summary["matchedIntervals"] == 2
    assert summary["expectedIntervals"] == 744
    assert summary["unit"] == "MW"
    # 00:00 forecast 110 vs mean(90, 95) = 92.5; 01:00 forecast 200 vs 192.5.
    assert summary["mae"] == pytest.approx(12.5)
    assert summary["bias"] == pytest.approx(12.5)
    assert summary["rmse"] == pytest.approx(sqrt(181.25), abs=1e-4)
    assert body["meta"]["selection"]["selectedRecords"] == 2
    assert body["meta"]["alignment"]["actualsPerForecastInterval"] == 2
    assert body["meta"]["alignment"]["affectedIntervals"] == 2
    assert body["meta"]["unit"] == "MW"
    assert body["meta"]["selection"]["status"] == "assumption"
    assert all(
        check["passed"] for check in body["quality"]["checks"]
    )
    assert len(body["data"]["daily"]) == 31
    assert body["data"]["daily"][0]["matchedIntervals"] == 2
    assert body["data"]["daily"][0]["expectedIntervals"] == 24
    assert len(body["data"]["intervals"]) == 744
    assert body["data"]["missing"]["byReason"] == {"noEligibleForecast": 742}


def test_forecast_accuracy_route_upstream_failure_returns_502_envelope(
    api, client: TestClient
):
    import httpx

    api({"/datasets/FUELHH": httpx.Response(500, json={"title": "boom"})})

    response = client.get("/api/elexon/forecast-accuracy")

    assert response.status_code == 502
    body = response.json()
    assert body["data"]["summary"]["matchedIntervals"] == 0
    assert body["data"]["summary"]["mae"] is None
    assert body["meta"]["error"]["type"] == "upstreamError"


def test_windfor_route_reports_prepared_cache_state(api, client: TestClient):
    mock = _mock_january(api)

    first = client.get("/api/elexon/windfor")
    calls_after_first = len(mock.calls)
    second = client.get("/api/elexon/windfor")

    assert first.json()["meta"]["prepared"]["cached"] is False
    assert second.json()["meta"]["prepared"]["cached"] is True
    assert len(mock.calls) == calls_after_first
    refreshed = client.get("/api/elexon/windfor?refresh=true")
    assert refreshed.json()["meta"]["prepared"]["cached"] is False
    assert len(mock.calls) > calls_after_first