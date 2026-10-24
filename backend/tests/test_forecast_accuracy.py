"""Tests for day-ahead forecast selection, alignment and accuracy metrics."""

from datetime import datetime, timedelta, timezone
from math import sqrt

import pytest

from services.forecast_accuracy import (
    build_accuracy_result,
    cutoff_for_delivery,
    expected_delivery_grid,
    select_latest_eligible,
)
from services.models import (
    STATUS_ALIGNMENT_UNAVAILABLE,
    STATUS_MATCHED,
    STATUS_MISSING_ACTUAL,
    STATUS_NO_ELIGIBLE_FORECAST,
    STATUS_NULL_ACTUAL_VALUE,
    STATUS_NULL_FORECAST_VALUE,
    FuelHhRecord,
    WindForRecord,
)

UTC = timezone.utc
T0 = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
CUTOFF = datetime(2025, 12, 31, 9, 0, tzinfo=UTC)


def forecast(start: datetime, publish: datetime, generation: int | None):
    return WindForRecord(
        dataset="WINDFOR",
        startTime=start,
        publishTime=publish,
        generation=generation,
    )


def outturn(start: datetime, generation: int | None):
    return FuelHhRecord(
        dataset="FUELHH",
        startTime=start,
        settlementDate=start.date(),
        settlementPeriod=1,
        fuelType="WIND",
        generation=generation,
    )


def actual_pair(start: datetime, first: int, second: int):
    return [
        outturn(start, first),
        outturn(start + timedelta(minutes=30), second),
    ]


# --------------------------------------------------------------------------- #
# Cutoff
# --------------------------------------------------------------------------- #


def test_cutoff_is_d_minus_one_0900_london_in_winter():
    assert cutoff_for_delivery(T0) == CUTOFF
    assert cutoff_for_delivery(datetime(2026, 1, 31, 23, 0, tzinfo=UTC)) == (
        datetime(2026, 1, 30, 9, 0, tzinfo=UTC)
    )


def test_cutoff_uses_london_dst_rather_than_utc():
    # 1 July 2026 is BST (UTC+1): 09:00 London is 08:00 UTC.
    delivery = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    assert cutoff_for_delivery(delivery) == datetime(
        2026, 6, 30, 8, 0, tzinfo=UTC
    )


# --------------------------------------------------------------------------- #
# Selection
# --------------------------------------------------------------------------- #


def test_latest_forecast_at_or_before_cutoff_is_selected():
    selection = select_latest_eligible(
        [
            forecast(T0, datetime(2025, 12, 29, 2, 30, tzinfo=UTC), 90),
            forecast(T0, datetime(2025, 12, 31, 8, 59, tzinfo=UTC), 100),
            forecast(T0, CUTOFF, 110),
            forecast(T0, datetime(2025, 12, 31, 9, 1, tzinfo=UTC), 999),
        ]
    )

    assert len(selection.selected) == 1
    assert selection.selected[T0].generation == 110
    assert selection.candidate_records == 4
    assert selection.eligible_records == 3


def test_forecasts_published_after_the_cutoff_are_never_selected():
    selection = select_latest_eligible(
        [forecast(T0, datetime(2025, 12, 31, 12, 0, tzinfo=UTC), 500)]
    )

    assert selection.selected == {}
    assert selection.eligible_records == 0


def test_late_december_publications_are_eligible_for_january_delivery():
    selection = select_latest_eligible(
        [forecast(T0, datetime(2025, 12, 20, 12, 0, tzinfo=UTC), 80)]
    )

    assert selection.selected[T0].generation == 80


def test_each_delivery_gets_its_own_latest_forecast():
    later = T0 + timedelta(hours=1)
    selection = select_latest_eligible(
        [
            forecast(T0, CUTOFF, 100),
            forecast(later, CUTOFF, 200),
            forecast(later, CUTOFF + timedelta(hours=1), 300),
        ]
    )

    # 09:00 cutoff on 31 Dec for both deliveries; the 10:00 publish is too late.
    assert selection.selected[T0].generation == 100
    assert selection.selected[later].generation == 200


def test_null_latest_value_is_selected_and_not_backfilled():
    selection = select_latest_eligible(
        [
            forecast(T0, datetime(2025, 12, 30, tzinfo=UTC), 120),
            forecast(T0, CUTOFF, None),
        ]
    )

    # The selection rule is "latest eligible", not "latest eligible with a value".
    assert selection.selected[T0].generation is None


# --------------------------------------------------------------------------- #
# Expected intervals
# --------------------------------------------------------------------------- #


def test_expected_intervals_are_computed_from_window_and_resolution():
    january = expected_delivery_grid(T0, datetime(2026, 2, 1, tzinfo=UTC), 60)
    assert len(january.intervals) == 744
    assert january.complete_window is True
    assert january.intervals[1] == T0 + timedelta(hours=1)

    half_hourly = expected_delivery_grid(
        T0, datetime(2026, 2, 1, tzinfo=UTC), 30
    )
    assert len(half_hourly.intervals) == 1488


def test_expected_intervals_report_unavailable_resolution():
    grid = expected_delivery_grid(T0, T0 + timedelta(hours=1), None)
    assert grid.intervals == []
    assert grid.unavailable_reason is not None


def test_expected_intervals_report_a_non_whole_window():
    grid = expected_delivery_grid(T0, T0 + timedelta(minutes=100), 60)
    assert len(grid.intervals) == 1
    assert grid.complete_window is False
    assert grid.unavailable_reason is not None


# --------------------------------------------------------------------------- #
# Alignment
# --------------------------------------------------------------------------- #


def test_hourly_forecast_is_aligned_to_the_mean_of_two_half_hours():
    result = build_accuracy_result(
        forecasts=[
            forecast(T0, datetime(2025, 12, 30, tzinfo=UTC), 100),
            forecast(T0 + timedelta(hours=1), datetime(2025, 12, 30, tzinfo=UTC), 80),
        ],
        fuelhh=actual_pair(T0, 90, 110) + actual_pair(T0 + timedelta(hours=1), 120, 140),
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(hours=2),
        forecast_resolution_minutes=60,
        actual_resolution_minutes=30,
    )

    intervals = result.payload.intervals
    assert [interval.status for interval in intervals] == [STATUS_MATCHED, STATUS_MATCHED]
    assert intervals[0].actual_generation == 100
    assert intervals[0].error == 0
    assert intervals[0].actual_observations == 2
    assert intervals[1].actual_generation == 130
    assert intervals[1].error == -50
    assert result.alignment.actuals_per_forecast_interval == 2
    assert result.alignment.affected_intervals == 2
    assert result.alignment.interpolation == "none"


def test_a_missing_half_hour_excludes_the_interval_instead_of_a_partial_mean():
    result = build_accuracy_result(
        forecasts=[forecast(T0, datetime(2025, 12, 30, tzinfo=UTC), 100)],
        fuelhh=[outturn(T0, 90)],  # 00:30 is missing
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(hours=1),
        forecast_resolution_minutes=60,
        actual_resolution_minutes=30,
    )

    interval = result.payload.intervals[0]
    assert interval.status == STATUS_MISSING_ACTUAL
    assert interval.actual_generation is None
    assert interval.error is None
    assert interval.actual_observations == 0
    assert result.payload.summary.matched_intervals == 0
    assert result.payload.summary.mae is None
    assert result.payload.missing.by_reason == {STATUS_MISSING_ACTUAL: 1}


def test_a_null_half_hour_is_not_treated_as_zero():
    result = build_accuracy_result(
        forecasts=[forecast(T0, datetime(2025, 12, 30, tzinfo=UTC), 100)],
        fuelhh=[outturn(T0, 90), outturn(T0 + timedelta(minutes=30), None)],
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(hours=1),
        forecast_resolution_minutes=60,
        actual_resolution_minutes=30,
    )

    interval = result.payload.intervals[0]
    assert interval.status == STATUS_NULL_ACTUAL_VALUE
    assert interval.actual_generation is None
    assert interval.error is None
    assert result.payload.summary.mae is None


def test_a_null_forecast_value_is_reported_not_scored():
    result = build_accuracy_result(
        forecasts=[forecast(T0, datetime(2025, 12, 30, tzinfo=UTC), None)],
        fuelhh=actual_pair(T0, 90, 110),
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(hours=1),
        forecast_resolution_minutes=60,
        actual_resolution_minutes=30,
    )

    assert result.payload.intervals[0].status == STATUS_NULL_FORECAST_VALUE
    assert result.payload.summary.matched_intervals == 0


def test_an_interval_with_no_eligible_forecast_is_never_backfilled():
    result = build_accuracy_result(
        forecasts=[
            forecast(T0, datetime(2026, 1, 2, tzinfo=UTC), 100)  # too late
        ],
        fuelhh=actual_pair(T0, 90, 110),
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(hours=1),
        forecast_resolution_minutes=60,
        actual_resolution_minutes=30,
    )

    assert result.payload.intervals[0].status == STATUS_NO_ELIGIBLE_FORECAST
    assert result.payload.intervals[0].forecast_generation is None
    assert result.payload.missing.by_reason == {STATUS_NO_ELIGIBLE_FORECAST: 1}


def test_a_half_hourly_forecast_matches_one_actual_per_interval():
    result = build_accuracy_result(
        forecasts=[
            forecast(T0, datetime(2025, 12, 30, tzinfo=UTC), 100),
            forecast(T0 + timedelta(minutes=30), datetime(2025, 12, 30, tzinfo=UTC), 120),
        ],
        fuelhh=actual_pair(T0, 90, 130),
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(hours=1),
        forecast_resolution_minutes=30,
        actual_resolution_minutes=30,
    )

    assert result.payload.summary.matched_intervals == 2
    assert result.payload.summary.expected_intervals == 2
    assert result.payload.summary.coverage_percent == 100
    assert result.alignment.actuals_per_forecast_interval == 1
    assert result.alignment.affected_intervals == 0
    assert [i.error for i in result.payload.intervals] == [10, -10]


def test_incompatible_resolutions_are_reported_not_approximated():
    result = build_accuracy_result(
        forecasts=[forecast(T0, datetime(2025, 12, 30, tzinfo=UTC), 100)],
        fuelhh=actual_pair(T0, 90, 110),
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(hours=2),
        forecast_resolution_minutes=45,
        actual_resolution_minutes=30,
    )

    assert result.alignment.actuals_per_forecast_interval is None
    assert all(
        interval.status == STATUS_ALIGNMENT_UNAVAILABLE
        for interval in result.payload.intervals
    )
    assert result.payload.summary.mae is None
    assert any(
        check.name == "alignmentCoverage" and not check.passed
        for check in result.checks
    )


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #


def test_mae_rmse_bias_coverage_and_daily_results():
    day_two = T0 + timedelta(days=1)
    result = build_accuracy_result(
        forecasts=[
            forecast(T0, datetime(2025, 12, 30, tzinfo=UTC), 110),
            forecast(T0 + timedelta(hours=1), datetime(2025, 12, 30, tzinfo=UTC), 80),
            forecast(T0 + timedelta(hours=2), datetime(2025, 12, 30, tzinfo=UTC), 130),
            # Ineligible later publication must not change any metric.
            forecast(T0, datetime(2025, 12, 31, 12, 0, tzinfo=UTC), 900),
        ],
        fuelhh=(
            actual_pair(T0, 90, 110)
            + actual_pair(T0 + timedelta(hours=1), 100, 100)
            + actual_pair(T0 + timedelta(hours=2), 100, 100)
        ),
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(days=2),
        forecast_resolution_minutes=60,
        actual_resolution_minutes=30,
    )

    summary = result.payload.summary
    assert summary.matched_intervals == 3
    assert summary.expected_intervals == 48
    assert summary.coverage_percent == pytest.approx(6.25)
    assert summary.mae == pytest.approx(20)
    assert summary.rmse == pytest.approx(sqrt((100 + 400 + 900) / 3), abs=1e-4)
    assert summary.bias == pytest.approx(20 / 3, abs=1e-4)
    assert summary.matched_actual_half_hours == 6
    assert summary.expected_actual_half_hours == 96
    assert summary.unit == "MW"

    assert [day.delivery_date.isoformat() for day in result.payload.daily] == [
        "2026-01-01",
        "2026-01-02",
    ]
    first, second = result.payload.daily
    assert first.matched_intervals == 3
    assert first.expected_intervals == 24
    assert [i.delivery_time.hour for i in result.payload.intervals[:3]] == [0, 1, 2]
    assert first.mae == pytest.approx(20)
    # No data is not zero: the second day's metrics stay unavailable.
    assert second.matched_intervals == 0
    assert second.coverage_percent == 0
    assert second.mae is None
    assert second.rmse is None
    assert second.bias is None
    assert second.missing_by_reason == {STATUS_NO_ELIGIBLE_FORECAST: 24}

    assert result.payload.missing.by_reason == {STATUS_NO_ELIGIBLE_FORECAST: 45}
    assert len(result.payload.missing.intervals) == 45
    assert result.selection.unmatched_intervals == 45
    assert all(check.passed for check in result.checks)


def test_all_missing_data_yields_unavailable_metrics_not_zero():
    result = build_accuracy_result(
        forecasts=[],
        fuelhh=[],
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(days=1),
        forecast_resolution_minutes=60,
        actual_resolution_minutes=30,
    )

    # With a known hourly resolution the expected intervals exist but nothing
    # is matched; metrics stay unavailable rather than becoming zero.
    assert result.payload.summary.expected_intervals == 24
    assert result.payload.summary.matched_intervals == 0
    assert result.payload.summary.mae is None
    assert result.payload.summary.rmse is None
    assert result.payload.summary.bias is None
    assert result.payload.summary.coverage_percent == 0
    assert result.payload.missing.by_reason == {STATUS_NO_ELIGIBLE_FORECAST: 24}
    assert result.payload.daily[0].mae is None
    assert all(check.passed for check in result.checks)


def test_unknown_forecast_resolution_yields_no_expected_intervals():
    result = build_accuracy_result(
        forecasts=[],
        fuelhh=[outturn(T0, 90), outturn(T0 + timedelta(minutes=30), 95)],
        delivery_start=T0,
        delivery_end_exclusive=T0 + timedelta(days=1),
        forecast_resolution_minutes=None,
        actual_resolution_minutes=30,
    )

    assert result.payload.summary.expected_intervals == 0
    assert result.payload.summary.coverage_percent is None
    assert result.payload.daily == []
    assert any(
        check.name == "alignmentCoverage" and not check.passed
        for check in result.checks
    )
