"""Tests for January 2026 response builders."""

import pytest

from services.january_2026 import build_summary_response, build_windfor_response
from tests.conftest import rows_returning, windfor_row


def test_windfor_response_contains_resolution_and_quality(service_client):
    rows = [windfor_row("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")]
    client, mock = service_client(
        {"/datasets/WINDFOR": rows_returning(rows, "startTime")}
    )

    envelope = build_windfor_response(client)

    assert len(envelope.data) == 1
    assert envelope.meta.observed_resolutions["WINDFOR"].delivery is not None
    assert envelope.quality.rows_fetched == 1
    assert envelope.quality.accepted == 1
    assert any(c.name == "accounting" and c.passed for c in envelope.quality.checks)


def test_summary_response_contains_both_datasets(service_client):
    windfor_rows = [windfor_row("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")]
    fuelhh_rows = [
        {
            "dataset": "FUELHH",
            "publishTime": "2026-01-01T00:00:00Z",
            "startTime": "2026-01-01T00:00:00Z",
            "settlementDate": "2026-01-01",
            "settlementPeriod": 1,
            "fuelType": "WIND",
            "generation": 1000,
        }
    ]
    client, mock = service_client(
        {
            "/datasets/WINDFOR": rows_returning(windfor_rows, "startTime"),
            "/datasets/FUELHH": rows_returning(fuelhh_rows, "startTime"),
        }
    )

    envelope = build_summary_response(client)

    assert [s.dataset for s in envelope.data] == ["WINDFOR", "FUELHH"]
    assert set(envelope.meta.observed_resolutions) == {"WINDFOR", "FUELHH"}
    assert envelope.meta.record_counts == {"WINDFOR": 1, "FUELHH": 1}