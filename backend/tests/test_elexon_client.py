"""Tests for the Elexon HTTP client: errors, timeouts, retries, pagination.

All traffic is mocked with ``httpx.MockTransport``; nothing here reaches the
live API.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
import pytest

from services.elexon_client import (
    MAX_WINDOW_DAYS,
    ElexonApiError,
    ElexonClient,
    ElexonTimeoutError,
    chunk_date_windows,
    chunk_datetime_windows,
    extract_rows,
    iso_z,
)
from tests.conftest import MockElexon

UTC = timezone.utc


def make_client(
    routes: dict[str, Any], *, max_retries: int = 2
) -> tuple[ElexonClient, MockElexon, list[float]]:
    sleeps: list[float] = []
    mock = MockElexon(routes)
    client = ElexonClient(
        transport=httpx.MockTransport(mock),
        sleep=sleeps.append,
        max_retries=max_retries,
        backoff_seconds=0.25,
    )
    return client, mock, sleeps


def test_successful_request_returns_parsed_body_and_documented_params():
    body = {"data": [{"dataset": "WINDFOR", "generation": 1234}]}
    client, mock, sleeps = make_client({"/datasets/WINDFOR": body})

    result = client.get_json(
        "/datasets/WINDFOR",
        {
            "publishDateTimeFrom": "2025-12-15T00:00:00Z",
            "publishDateTimeTo": "2025-12-21T23:59:59Z",
            "format": "json",
        },
    )

    assert result == body
    assert sleeps == []
    assert len(mock.calls) == 1
    call = mock.calls[0]
    assert call["path"] == "/datasets/WINDFOR"
    assert call["publishDateTimeFrom"] == "2025-12-15T00:00:00Z"
    assert call["publishDateTimeTo"] == "2025-12-21T23:59:59Z"
    assert call["format"] == "json"


def test_array_query_parameters_are_sent_as_repeated_values():
    client, mock, _ = make_client({"/datasets/FUELHH": {"data": []}})

    client.get_json("/datasets/FUELHH", {"fuelType": ["WIND"]})

    assert mock.calls[0]["fuelType"] == "WIND"


def test_http_400_raises_immediately_without_retry():
    """A 400 (e.g. the documented 7-day range limit) is not transient."""
    problem = {
        "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
        "title": "One or more validation errors occurred.",
        "status": 400,
        "errors": {
            "": [
                "The date range between SettlementDateFrom and "
                "SettlementDateTo inclusive must not exceed 7 days"
            ]
        },
    }
    client, mock, sleeps = make_client(
        {"/datasets/FUELHH": httpx.Response(400, json=problem)}
    )

    with pytest.raises(ElexonApiError) as excinfo:
        client.get_json("/datasets/FUELHH", {})

    error = excinfo.value
    assert error.upstream_status == 400
    assert "must not exceed 7 days" in (error.detail or "")
    assert len(mock.calls) == 1
    assert sleeps == []


def test_http_500_is_retried_then_raises():
    client, mock, sleeps = make_client(
        {"/datasets/WINDFOR": httpx.Response(500, json={"title": "boom"})}
    )

    with pytest.raises(ElexonApiError) as excinfo:
        client.get_json("/datasets/WINDFOR", {})

    assert excinfo.value.upstream_status == 500
    assert excinfo.value.retryable is True
    assert len(mock.calls) == 3  # 1 attempt + 2 retries
    assert len(sleeps) == 2  # bounded backoff, no unbounded loop


def test_rate_limit_honours_retry_after_then_succeeds():
    responses = [
        httpx.Response(
            429,
            headers={"Retry-After": "1"},
            json={"title": "Too many requests"},
        ),
        httpx.Response(200, json={"data": [{"generation": 1}]}),
    ]

    def handler(params: dict[str, str]):
        return responses.pop(0)

    client, mock, sleeps = make_client({"/datasets/WINDFOR": handler})

    assert client.get_json("/datasets/WINDFOR", {}) == {
        "data": [{"generation": 1}]
    }
    assert len(mock.calls) == 2
    assert sleeps == [1.0]


def test_timeout_raises_typed_error_after_bounded_attempts():
    client, mock, sleeps = make_client(
        {"/datasets/WINDFOR": httpx.ReadTimeout("simulated timeout")}
    )

    with pytest.raises(ElexonTimeoutError):
        client.get_json("/datasets/WINDFOR", {})

    assert len(mock.calls) == 3
    assert len(sleeps) == 2


def test_non_json_success_body_is_an_error():
    client, _, _ = make_client(
        {"/datasets/WINDFOR": httpx.Response(200, text="<html>nope</html>")}
    )

    with pytest.raises(ElexonApiError) as excinfo:
        client.get_json("/datasets/WINDFOR", {})

    assert "non-JSON" in str(excinfo.value)


def test_client_close_is_safe_to_call_twice():
    client, _, _ = make_client({})
    client.close()
    client.close()


# --------------------------------------------------------------------------- #
# Pagination windows
# --------------------------------------------------------------------------- #


def test_datetime_windows_respect_the_seven_day_inclusive_limit():
    start = datetime(2025, 12, 15, tzinfo=UTC)
    end = datetime(2026, 2, 2, tzinfo=UTC)

    windows = chunk_datetime_windows(start, end)

    assert windows[0][0] == start
    assert windows[-1][1] == end - timedelta(seconds=1)
    for from_, to in windows:
        span = to - from_ + timedelta(seconds=1)
        assert span <= timedelta(days=MAX_WINDOW_DAYS)
        assert span.total_seconds() > 0
    # Contiguous and non-overlapping: no gaps and no duplicated boundary rows.
    for (_, previous_to), (next_from, _) in zip(windows, windows[1:]):
        assert next_from - previous_to == timedelta(seconds=1)


def test_datetime_windows_reject_inverted_range():
    with pytest.raises(ValueError):
        chunk_datetime_windows(
            datetime(2026, 2, 1, tzinfo=UTC),
            datetime(2026, 1, 1, tzinfo=UTC),
        )


def test_january_settlement_windows_tile_the_month():
    windows = chunk_date_windows(date(2026, 1, 1), date(2026, 1, 31))

    assert windows == [
        (date(2026, 1, 1), date(2026, 1, 7)),
        (date(2026, 1, 8), date(2026, 1, 14)),
        (date(2026, 1, 15), date(2026, 1, 21)),
        (date(2026, 1, 22), date(2026, 1, 28)),
        (date(2026, 1, 29), date(2026, 1, 31)),
    ]
    for from_, to in windows:
        assert (to - from_).days + 1 <= MAX_WINDOW_DAYS


def test_windows_cover_every_day_without_overlap():
    windows = chunk_date_windows(date(2026, 1, 1), date(2026, 1, 31))
    days: list[date] = []
    for from_, to in windows:
        day = from_
        while day <= to:
            days.append(day)
            day = date.fromordinal(day.toordinal() + 1)
    assert days == [
        date(2026, 1, day) for day in range(1, 32)
    ]


# --------------------------------------------------------------------------- #
# Response-body handling
# --------------------------------------------------------------------------- #


def test_extract_rows_accepts_null_data_as_empty():
    assert extract_rows({"data": None}, path="/datasets/X") == []


def test_extract_rows_rejects_unexpected_shapes():
    with pytest.raises(ElexonApiError):
        extract_rows({"payload": []}, path="/datasets/X")
    with pytest.raises(ElexonApiError):
        extract_rows({"data": {"not": "a list"}}, path="/datasets/X")
    with pytest.raises(ElexonApiError):
        extract_rows(["not", "an", "object"], path="/datasets/X")


def test_iso_z_formats_utc_like_the_documented_examples():
    assert (
        iso_z(datetime(2025, 12, 15, tzinfo=UTC)) == "2025-12-15T00:00:00Z"
    )
    # Naive input is treated as UTC rather than silently shifted.
    assert iso_z(datetime(2025, 12, 15)) == "2025-12-15T00:00:00Z"