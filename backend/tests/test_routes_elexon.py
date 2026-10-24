"""Tests for the /api/elexon routes: envelopes and upstream failures."""

import pytest

from fastapi.testclient import TestClient

from main import app
from routes.elexon import get_elexon_client


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