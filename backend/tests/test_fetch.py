"""Tests for shared record collection and January 2026 scoping."""

from datetime import datetime, timedelta, timezone

import pytest

from services.fetch import MALFORMED_ROW, OUTSIDE_DELIVERY_WINDOW
from services.january_2026 import DELIVERY_START, DELIVERY_END_EXCLUSIVE
from tests.conftest import rows_returning, windfor_row

UTC = timezone.utc


def test_windfor_records_are_scoped_to_january_delivery_window(service_client):
    rows = [
        windfor_row("2025-12-31T23:00:00Z", "2025-12-31T23:30:00Z"),  # outside
        windfor_row("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),  # inside
        windfor_row("2026-01-31T23:00:00Z", "2026-02-01T00:00:00Z"),  # outside (exclusive end)
    ]
    client, mock = service_client(
        {"/datasets/WINDFOR": rows_returning(rows, "startTime")}
    )

    from services.windfor import fetch_windfor
    from services.elexon_client import chunk_datetime_windows
    from services.january_2026 import PUBLICATION_START, PUBLICATION_END_EXCLUSIVE

    fetch = fetch_windfor(
        client,
        publish_windows=chunk_datetime_windows(PUBLICATION_START, PUBLICATION_END_EXCLUSIVE),
        delivery_start=DELIVERY_START,
        delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
    )

    assert fetch.accepted == 1
    assert fetch.rejected[OUTSIDE_DELIVERY_WINDOW] == 2
    assert fetch.records[0].startTime == datetime(2026, 1, 1, tzinfo=UTC)
    assert fetch.integrity_ok()


def test_null_generation_is_preserved_and_counted(service_client):
    rows = [windfor_row("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", generation=None)]
    client, mock = service_client(
        {"/datasets/WINDFOR": rows_returning(rows, "startTime")}
    )

    from services.windfor import fetch_windfor
    from services.elexon_client import chunk_datetime_windows
    from services.january_2026 import PUBLICATION_START, PUBLICATION_END_EXCLUSIVE

    fetch = fetch_windfor(
        client,
        publish_windows=chunk_datetime_windows(PUBLICATION_START, PUBLICATION_END_EXCLUSIVE),
        delivery_start=DELIVERY_START,
        delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
    )

    assert fetch.accepted == 1
    assert fetch.records[0].generation is None
    assert fetch.rejected_total == 0


def test_malformed_and_invalid_rows_are_rejected(service_client):
    rows = [
        "not a dict",
        windfor_row("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z").update({"generation": "bad"}) or None,
    ]
    # Build a malformed generation row manually.
    bad_rows = [
        "not a dict",
        {
            "dataset": "WINDFOR",
            "publishTime": "2026-01-01T00:00:00Z",
            "startTime": "2026-01-01T00:00:00Z",
            "generation": "not-an-int",
        },
    ]
    client, mock = service_client(
        {"/datasets/WINDFOR": {"data": bad_rows}}
    )

    from services.windfor import fetch_windfor
    from services.elexon_client import chunk_datetime_windows
    from services.january_2026 import PUBLICATION_START, PUBLICATION_END_EXCLUSIVE

    fetch = fetch_windfor(
        client,
        publish_windows=chunk_datetime_windows(PUBLICATION_START, PUBLICATION_END_EXCLUSIVE),
        delivery_start=DELIVERY_START,
        delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
    )

    assert fetch.accepted == 0
    # The same payload is served for each of the seven publish windows.
    assert fetch.rejected[MALFORMED_ROW] == 7
    assert fetch.rejected["invalidGeneration"] == 7
    assert fetch.rows_fetched == 14
    assert fetch.integrity_ok()


def test_duplicate_rows_are_removed(service_client):
    rows = [
        windfor_row("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
        windfor_row("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    ]
    client, mock = service_client(
        {"/datasets/WINDFOR": rows_returning(rows, "startTime")}
    )

    from services.windfor import fetch_windfor
    from services.elexon_client import chunk_datetime_windows
    from services.january_2026 import PUBLICATION_START, PUBLICATION_END_EXCLUSIVE

    fetch = fetch_windfor(
        client,
        publish_windows=chunk_datetime_windows(PUBLICATION_START, PUBLICATION_END_EXCLUSIVE),
        delivery_start=DELIVERY_START,
        delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
    )

    assert fetch.accepted == 1
    assert fetch.duplicates_removed == 1
    assert fetch.integrity_ok()


def test_fuelhh_rejects_non_wind_fuel_type(service_client):
    from tests.conftest import fuelhh_row

    rows = [
        fuelhh_row("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", fuel_type="WIND"),
        fuelhh_row("2026-01-01T00:30:00Z", "2026-01-01T00:30:00Z", fuel_type="GAS"),
    ]
    client, mock = service_client(
        {"/datasets/FUELHH": rows_returning(rows, "startTime")}
    )

    from services.fuelhh import fetch_fuelhh
    from services.elexon_client import chunk_date_windows
    from services.january_2026 import SETTLEMENT_START, SETTLEMENT_END_INCLUSIVE

    fetch = fetch_fuelhh(
        client,
        settlement_windows=chunk_date_windows(SETTLEMENT_START, SETTLEMENT_END_INCLUSIVE),
        delivery_start=DELIVERY_START,
        delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
    )

    assert fetch.accepted == 1
    assert fetch.rejected["nonWindFuelType"] == 1
    assert fetch.records[0].fuelType == "WIND"