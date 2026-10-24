"""Tests for record-level explorer rows and server-side pagination."""

from datetime import date, datetime, timedelta, timezone

import pytest

from services.explorer import (
    DEFAULT_DIRECTION,
    DEFAULT_SORT,
    build_explorer_rows,
    filter_rows,
    paginate,
    sort_rows,
)
from services.models import (
    STATUS_NO_ACTUAL,
    STATUS_NO_FORECAST,
    STATUS_SOURCE_ONLY,
    FuelHhRecord,
    WindForRecord,
)

UTC = timezone.utc


def forecast(
    start: datetime, publish: datetime, generation: int | None
) -> WindForRecord:
    return WindForRecord(
        dataset="WINDFOR",
        startTime=start,
        publishTime=publish,
        generation=generation,
    )


def actual(
    start: datetime,
    generation: int | None,
    *,
    settlement_period: int = 1,
    publish: datetime | None = None,
) -> FuelHhRecord:
    return FuelHhRecord(
        dataset="FUELHH",
        publishTime=publish,
        startTime=start,
        settlementDate=start.date(),
        settlementPeriod=settlement_period,
        fuelType="WIND",
        generation=generation,
    )


def test_every_forecast_version_is_preserved_and_joined_to_the_actual():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    rows = build_explorer_rows(
        [
            forecast(start, datetime(2025, 12, 30, 2, 30, tzinfo=UTC), 100),
            forecast(start, datetime(2025, 12, 31, 1, 30, tzinfo=UTC), 120),
        ],
        [actual(start, 90)],
    )

    # Both publication versions remain: nothing is collapsed or selected.
    assert len(rows) == 2
    assert [row.forecast_generation for row in rows] == [100, 120]
    assert [row.actual_generation for row in rows] == [90, 90]
    assert [row.error for row in rows] == [10, 30]
    assert {row.match_status for row in rows} == {STATUS_SOURCE_ONLY}
    assert rows[0].settlement_date == date(2026, 1, 1)
    assert rows[0].settlement_period == 1


def test_publication_lead_is_computed_in_minutes():
    start = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    rows = build_explorer_rows(
        [forecast(start, datetime(2025, 12, 31, 9, 0, tzinfo=UTC), 100)],
        [actual(start, 100)],
    )

    assert rows[0].publication_lead_minutes == 27 * 60


def test_missing_actual_is_not_zero_filled():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    rows = build_explorer_rows(
        [forecast(start, datetime(2025, 12, 30, tzinfo=UTC), 100)], []
    )

    assert rows[0].match_status == STATUS_NO_ACTUAL
    assert rows[0].actual_generation is None
    assert rows[0].error is None


def test_null_actual_value_is_kept_as_null_and_error_is_not_computed():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    rows = build_explorer_rows(
        [forecast(start, datetime(2025, 12, 30, tzinfo=UTC), 100)],
        [actual(start, None)],
    )

    assert rows[0].actual_generation is None
    assert rows[0].error is None


def test_null_forecast_value_is_preserved():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    rows = build_explorer_rows(
        [forecast(start, datetime(2025, 12, 30, tzinfo=UTC), None)],
        [actual(start, 90)],
    )

    assert rows[0].forecast_generation is None
    assert rows[0].error is None


def test_orphan_actuals_get_their_own_rows():
    start = datetime(2026, 1, 1, 0, 30, tzinfo=UTC)
    rows = build_explorer_rows([], [actual(start, 250)])

    assert len(rows) == 1
    assert rows[0].match_status == STATUS_NO_FORECAST
    assert rows[0].forecast_generation is None
    assert rows[0].actual_generation == 250


def test_rows_are_sorted_by_delivery_then_publication_time():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    rows = build_explorer_rows(
        [
            forecast(start, datetime(2025, 12, 31, tzinfo=UTC), 120),
            forecast(start, datetime(2025, 12, 30, tzinfo=UTC), 100),
        ],
        [],
    )

    assert [row.forecast_generation for row in rows] == [100, 120]


def test_filters_match_status_and_matched_only():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    rows = build_explorer_rows(
        [
            forecast(start, datetime(2025, 12, 30, tzinfo=UTC), 100),
            forecast(
                start + timedelta(hours=1),
                datetime(2025, 12, 30, tzinfo=UTC),
                None,
            ),
        ],
        [actual(start, 90), actual(start + timedelta(hours=1), 200)],
    )

    assert len(rows) == 2  # two forecast versions, no orphan actual
    assert [row.match_status for row in rows] == [
        STATUS_SOURCE_ONLY,
        STATUS_SOURCE_ONLY,
    ]

    only_matched = filter_rows(rows, status=STATUS_SOURCE_ONLY, matched_only=True)
    assert len(only_matched) == 1
    assert only_matched[0].error == 10

    unmatched = filter_rows(rows, status=STATUS_NO_FORECAST)
    assert unmatched == []

    assert filter_rows(rows, status="not-a-status") == []


def test_sort_rows_keeps_missing_values_last_in_both_directions():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    rows = build_explorer_rows(
        [
            forecast(start, datetime(2025, 12, 30, tzinfo=UTC), 100),
            forecast(
                start + timedelta(minutes=30),
                datetime(2025, 12, 30, tzinfo=UTC),
                100,
            ),
        ],
        [],
    )
    rows[1] = rows[1].model_copy(update={"actual_generation": 120, "error": -20})

    ascending = sort_rows(rows, sort="errorMw", direction="asc")
    descending = sort_rows(rows, sort="errorMw", direction="desc")

    assert [row.error for row in ascending] == [-20, None]
    assert [row.error for row in descending] == [-20, None]
    assert ascending[-1].error is None


def test_sort_rows_rejects_unknown_fields():
    with pytest.raises(ValueError):
        sort_rows([], sort="nope")
    with pytest.raises(ValueError):
        sort_rows([], sort=DEFAULT_SORT, direction="sideways")


def test_paginate_reports_honest_totals_and_slices():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    rows = build_explorer_rows(
        [
            forecast(
                start + timedelta(minutes=30 * index),
                datetime(2025, 12, 30, tzinfo=UTC),
                100 + index,
            )
            for index in range(101)
        ],
        [],
    )

    first, meta = paginate(
        rows,
        page=1,
        per_page=50,
        sort=DEFAULT_SORT,
        direction=DEFAULT_DIRECTION,
    )
    second, _ = paginate(
        rows,
        page=2,
        per_page=50,
        sort=DEFAULT_SORT,
        direction=DEFAULT_DIRECTION,
    )
    third, _ = paginate(
        rows,
        page=3,
        per_page=50,
        sort=DEFAULT_SORT,
        direction=DEFAULT_DIRECTION,
    )

    assert meta.total_records == 101
    assert meta.total_pages == 3
    assert meta.returned == 50
    assert len(first) == 50 and len(second) == 50 and len(third) == 1
    assert first[0].delivery_time != second[0].delivery_time
    # No record is repeated or dropped across pages.
    deliveries = [row.delivery_time for row in first + second + third]
    assert len(set(deliveries)) == 101


def test_paginate_handles_an_empty_result_and_page_beyond_the_end():
    rows: list = []

    empty, meta = paginate(
        rows,
        page=1,
        per_page=25,
        sort=DEFAULT_SORT,
        direction=DEFAULT_DIRECTION,
    )

    assert empty == []
    assert meta.total_records == 0
    assert meta.total_pages == 0
    assert meta.returned == 0

    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    one = build_explorer_rows(
        [forecast(start, datetime(2025, 12, 30, tzinfo=UTC), 100)], []
    )
    beyond, beyond_meta = paginate(
        one,
        page=5,
        per_page=25,
        sort=DEFAULT_SORT,
        direction=DEFAULT_DIRECTION,
    )

    assert beyond == []
    assert beyond_meta.total_records == 1
    assert beyond_meta.total_pages == 1
    assert beyond_meta.page == 5


def test_filters_are_reported_in_the_page_metadata():
    _, meta = paginate(
        [],
        page=2,
        per_page=100,
        sort="errorMw",
        direction="desc",
        filters={"status": STATUS_NO_ACTUAL, "matchedOnly": "true"},
    )

    assert meta.page == 2
    assert meta.per_page == 100
    assert meta.sort == "errorMw"
    assert meta.direction == "desc"
    assert meta.filters == {"status": STATUS_NO_ACTUAL, "matchedOnly": "true"}
