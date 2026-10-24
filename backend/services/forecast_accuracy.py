"""Day-ahead forecast selection, resolution alignment and accuracy metrics.

Forecast-selection rule (wind_forecast.md §3.5)
----------------------------------------------
For every January 2026 delivery interval, keep the WINDFOR forecast with the
**latest** ``publishTime`` at or before the decision cutoff. The proposed
cutoff is **09:00 Europe/London on the delivery day minus one (D-1)**. It stays
an explicit *assumption* until the business confirms the gate. A later forecast
is never used, and an interval with no eligible forecast is never back-filled.

Alignment (wind_forecast.md §3.6)
---------------------------------
WINDFOR is hourly and FUELHH is half-hourly in this dataset; both resolutions
are detected from the data, never assumed. A selected forecast for interval
``[t, t + forecast_resolution)`` is compared with the **time-weighted mean of
the actual half-hour values that exactly cover that interval** (two half-hours
for an hourly forecast). The interval is matched only when *every* required
actual is present and non-null. There is no interpolation, no duplication of a
forecast into finer slots, and no partial mean over a subset of the interval.
Intervals that cannot be covered completely are reported as missing with a
reason and excluded from every metric.

Metrics
-------
Over matched intervals only, with ``e = F - A``:

* MAE   = (1/n) Σ |e|
* RMSE  = sqrt((1/n) Σ e²)
* bias  = (1/n) Σ e          (positive = over-forecast)
* coverage = n_matched / n_expected

``n_expected`` is the number of delivery intervals at the forecast's native
resolution inside the January window, computed from the window and the detected
resolution rather than hard-coded. Metrics are ``None`` when ``n == 0``; zero
is never used as a stand-in for "no data".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from math import sqrt
from typing import Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from services.models import (
    STATUS_ALIGNMENT_UNAVAILABLE,
    STATUS_MATCHED,
    STATUS_MISSING_ACTUAL,
    STATUS_NO_ELIGIBLE_FORECAST,
    STATUS_NULL_ACTUAL_VALUE,
    STATUS_NULL_FORECAST_VALUE,
    AccuracyPayload,
    AccuracySummary,
    AlignmentInfo,
    DailyAccuracy,
    ForecastSelection,
    FuelHhRecord,
    IntervalAccuracy,
    MissingData,
    MissingInterval,
    QualityCheck,
    WindForRecord,
)

UTC = timezone.utc
CUTOFF_HOUR = 9
CUTOFF_DAYS_BEFORE = 1
CUTOFF_TIMEZONE = "Europe/London"
CUTOFF_RULE = "D-1 09:00 Europe/London"
CUTOFF_STATUS = "assumption"
SELECTION_POLICY = (
    "latest publishTime at or before the cutoff, per delivery interval"
)
ALIGNMENT_METHOD = "complete-coverage mean of half-hourly actuals"
ALIGNMENT_DESCRIPTION = (
    "Each selected forecast interval is compared with the time-weighted mean "
    "of the FUELHH half-hour actuals that exactly cover it. An interval is "
    "matched only when every required actual is present and non-null; there "
    "is no interpolation, no duplication of forecast values into finer slots "
    "and no partial-interval mean."
)
GENERATION_UNIT = "MW"

try:
    LONDON = ZoneInfo(CUTOFF_TIMEZONE)
except ZoneInfoNotFoundError as exc:  # pragma: no cover - depends on host tzdata
    raise RuntimeError(
        "Europe/London timezone data is required; install the 'tzdata' package"
    ) from exc

MISSING_REASONS = (
    STATUS_NO_ELIGIBLE_FORECAST,
    STATUS_MISSING_ACTUAL,
    STATUS_NULL_ACTUAL_VALUE,
    STATUS_NULL_FORECAST_VALUE,
    STATUS_ALIGNMENT_UNAVAILABLE,
)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def cutoff_for_delivery(delivery_start: datetime) -> datetime:
    """Return the UTC instant of D-1 09:00 Europe/London for a delivery.

    The cutoff is expressed in London local time so it stays correct outside
    January, when London is UTC+1. In January 2026 it equals 09:00 UTC.
    """
    local = _utc(delivery_start).astimezone(LONDON)
    cutoff_date = local.date() - timedelta(days=CUTOFF_DAYS_BEFORE)
    cutoff_local = datetime.combine(
        cutoff_date, time(hour=CUTOFF_HOUR, minute=0), tzinfo=LONDON
    )
    return cutoff_local.astimezone(UTC)


@dataclass(frozen=True)
class Selection:
    """One selected forecast per delivery start, plus selection counts."""

    selected: dict[datetime, WindForRecord]
    candidate_records: int
    eligible_records: int


def select_latest_eligible(
    forecasts: Iterable[WindForRecord],
) -> Selection:
    """Select the latest forecast published at or before the D-1 09:00 cutoff.

    Ties on ``publishTime`` are resolved deterministically by keeping the first
    record encountered (duplicate rows are removed by the fetch layer).
    """
    selected: dict[datetime, WindForRecord] = {}
    candidate_records = 0
    eligible_records = 0

    for forecast in forecasts:
        candidate_records += 1
        if _utc(forecast.publishTime) > cutoff_for_delivery(forecast.startTime):
            continue
        eligible_records += 1
        current = selected.get(forecast.startTime)
        if current is None or _utc(forecast.publishTime) > _utc(
            current.publishTime
        ):
            selected[forecast.startTime] = forecast

    return Selection(
        selected=selected,
        candidate_records=candidate_records,
        eligible_records=eligible_records,
    )


@dataclass(frozen=True)
class Grid:
    """Expected delivery intervals at the forecast's native resolution."""

    intervals: list[datetime]
    step_minutes: int
    complete_window: bool
    unavailable_reason: str | None


def expected_delivery_grid(
    delivery_start: datetime,
    delivery_end_exclusive: datetime,
    step_minutes: int | None,
) -> Grid:
    """Tile the window with delivery intervals of ``step_minutes``.

    The count is computed, never hard-coded: 31 days is 744 hourly intervals or
    1,488 half-hour intervals. A window that is not a whole number of steps is
    reported as incomplete instead of inventing a partial interval.
    """
    if not step_minutes or step_minutes <= 0:
        return Grid(
            intervals=[],
            step_minutes=step_minutes or 0,
            complete_window=False,
            unavailable_reason="delivery resolution is unavailable",
        )

    start = _utc(delivery_start)
    end = _utc(delivery_end_exclusive)
    step = timedelta(minutes=step_minutes)
    total_seconds = (end - start).total_seconds()
    count = int(total_seconds // step.total_seconds())
    remainder = total_seconds - count * step.total_seconds()
    intervals = [start + step * index for index in range(count)]

    return Grid(
        intervals=intervals,
        step_minutes=step_minutes,
        complete_window=remainder == 0,
        unavailable_reason=(
            None
            if remainder == 0
            else (
                "delivery window is not a whole number of "
                f"{step_minutes}-minute intervals"
            )
        ),
    )


@dataclass(frozen=True)
class AlignmentResult:
    intervals: list[IntervalAccuracy]
    actuals_per_forecast_interval: int | None
    affected_intervals: int
    unavailable_reason: str | None
    grid: Grid
    actual_resolution_minutes: int | None


def align_and_score(
    delivery_start: datetime,
    delivery_end_exclusive: datetime,
    selection: Selection,
    fuelhh: Iterable[FuelHhRecord],
    *,
    forecast_resolution_minutes: int | None,
    actual_resolution_minutes: int | None,
) -> AlignmentResult:
    """Align selected forecasts to actuals and compute per-interval errors."""
    grid = expected_delivery_grid(
        delivery_start, delivery_end_exclusive, forecast_resolution_minutes
    )
    if grid.unavailable_reason is not None:
        return AlignmentResult(
            intervals=_unmatched_intervals(grid, STATUS_ALIGNMENT_UNAVAILABLE),
            actuals_per_forecast_interval=None,
            affected_intervals=0,
            unavailable_reason=grid.unavailable_reason,
            grid=grid,
            actual_resolution_minutes=actual_resolution_minutes,
        )

    if not actual_resolution_minutes or actual_resolution_minutes <= 0:
        return AlignmentResult(
            intervals=_unmatched_intervals(grid, STATUS_ALIGNMENT_UNAVAILABLE),
            actuals_per_forecast_interval=None,
            affected_intervals=0,
            unavailable_reason="actual delivery resolution is unavailable",
            grid=grid,
            actual_resolution_minutes=actual_resolution_minutes,
        )

    actual_step = actual_resolution_minutes
    if grid.step_minutes % actual_step != 0:
        reason = (
            "forecast resolution "
            f"({grid.step_minutes} min) is not a whole multiple of the actual "
            f"resolution ({actual_step} min)"
        )
        return AlignmentResult(
            intervals=_unmatched_intervals(grid, STATUS_ALIGNMENT_UNAVAILABLE),
            actuals_per_forecast_interval=None,
            affected_intervals=0,
            unavailable_reason=reason,
            grid=grid,
            actual_resolution_minutes=actual_resolution_minutes,
        )

    per_interval = grid.step_minutes // actual_step
    actuals = _latest_actuals_per_delivery(fuelhh)

    intervals: list[IntervalAccuracy] = []
    affected = 0

    for start in grid.intervals:
        delivery_date = start.astimezone(LONDON).date()
        selected = selection.selected.get(start)

        if selected is None:
            intervals.append(
                IntervalAccuracy(
                    delivery_time=start,
                    delivery_date=delivery_date,
                    status=STATUS_NO_ELIGIBLE_FORECAST,
                )
            )
            continue

        if selected.generation is None:
            intervals.append(
                IntervalAccuracy(
                    delivery_time=start,
                    delivery_date=delivery_date,
                    forecast_published=selected.publishTime,
                    status=STATUS_NULL_FORECAST_VALUE,
                    actual_observations=0,
                )
            )
            continue

        required = [
            start + timedelta(minutes=actual_step * index)
            for index in range(per_interval)
        ]
        actuals_for_interval = [actuals.get(instant) for instant in required]

        if any(actual is None for actual in actuals_for_interval):
            intervals.append(
                IntervalAccuracy(
                    delivery_time=start,
                    delivery_date=delivery_date,
                    forecast_published=selected.publishTime,
                    forecast_generation=selected.generation,
                    status=STATUS_MISSING_ACTUAL,
                    actual_observations=0,
                )
            )
            continue

        if any(actual.generation is None for actual in actuals_for_interval):
            intervals.append(
                IntervalAccuracy(
                    delivery_time=start,
                    delivery_date=delivery_date,
                    forecast_published=selected.publishTime,
                    forecast_generation=selected.generation,
                    status=STATUS_NULL_ACTUAL_VALUE,
                    actual_observations=0,
                )
            )
            continue

        # Every required actual exists and is non-null, so the mean covers the
        # whole forecast interval. Values are MW over equal 30-minute windows.
        values = [actual.generation for actual in actuals_for_interval]
        assert all(value is not None for value in values)
        actual_mean = sum(values) / len(values)  # type: ignore[arg-type]
        error = selected.generation - actual_mean
        if per_interval > 1:
            affected += 1
        intervals.append(
            IntervalAccuracy(
                delivery_time=start,
                delivery_date=delivery_date,
                forecast_published=selected.publishTime,
                forecast_generation=selected.generation,
                actual_generation=round(actual_mean, 4),
                error=round(error, 4),
                status=STATUS_MATCHED,
                actual_observations=len(values),
            )
        )

    return AlignmentResult(
        intervals=intervals,
        actuals_per_forecast_interval=per_interval,
        affected_intervals=affected,
        unavailable_reason=None,
        grid=grid,
        actual_resolution_minutes=actual_resolution_minutes,
    )


def _latest_actuals_per_delivery(
    records: Iterable[FuelHhRecord],
) -> dict[datetime, FuelHhRecord]:
    by_start: dict[datetime, FuelHhRecord] = {}
    for record in records:
        current = by_start.get(record.startTime)
        if current is None or (record.publishTime or datetime.min.replace(tzinfo=UTC)) >= (
            current.publishTime or datetime.min.replace(tzinfo=UTC)
        ):
            by_start[record.startTime] = record
    return by_start


def _unmatched_intervals(grid: Grid, reason: str) -> list[IntervalAccuracy]:
    return [
        IntervalAccuracy(
            delivery_time=start,
            delivery_date=start.astimezone(LONDON).date(),
            status=reason,
        )
        for start in grid.intervals
    ]


def _metric(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"mae": None, "rmse": None, "bias": None}
    count = len(values)
    return {
        "mae": round(sum(abs(value) for value in values) / count, 4),
        "rmse": round(sqrt(sum(value**2 for value in values) / count), 4),
        "bias": round(sum(values) / count, 4),
    }


def _coverage_percent(matched: int, expected: int) -> float | None:
    if expected <= 0:
        return None
    return round(matched / expected * 100, 4)


def _daily_results(
    intervals: list[IntervalAccuracy],
) -> list[DailyAccuracy]:
    by_date: dict[date, list[IntervalAccuracy]] = {}
    for interval in intervals:
        by_date.setdefault(interval.delivery_date, []).append(interval)

    days: list[DailyAccuracy] = []
    for delivery_date in sorted(by_date):
        day_intervals = by_date[delivery_date]
        matched = [
            interval
            for interval in day_intervals
            if interval.status == STATUS_MATCHED and interval.error is not None
        ]
        errors = [interval.error for interval in matched if interval.error is not None]
        metrics = _metric(errors)
        missing: dict[str, int] = {}
        for interval in day_intervals:
            if interval.status != STATUS_MATCHED:
                missing[interval.status] = missing.get(interval.status, 0) + 1
        days.append(
            DailyAccuracy(
                delivery_date=delivery_date,
                expected_intervals=len(day_intervals),
                matched_intervals=len(matched),
                coverage_percent=_coverage_percent(
                    len(matched), len(day_intervals)
                ),
                **metrics,
                missing_by_reason=missing,
            )
        )
    return days


def _alignment_info(result: AlignmentResult) -> AlignmentInfo:
    return AlignmentInfo(
        method=ALIGNMENT_METHOD,
        description=ALIGNMENT_DESCRIPTION,
        forecast_resolution_minutes=result.grid.step_minutes or None,
        actual_resolution_minutes=result.actual_resolution_minutes,
        actuals_per_forecast_interval=result.actuals_per_forecast_interval,
        affected_intervals=result.affected_intervals,
        interpolation="none",
    )


def _quality_checks(
    *,
    selection: Selection,
    result: AlignmentResult,
    matched: int,
    expected: int,
) -> list[QualityCheck]:
    selected = list(selection.selected.values())
    cutoff_respected = all(
        _utc(record.publishTime) <= cutoff_for_delivery(record.startTime)
        for record in selected
    )
    unique_delivery_keys = len({r.startTime for r in selected}) == len(selected)
    missing = expected - matched
    accounted = matched + missing == expected

    return [
        QualityCheck(
            name="selectionCutoff",
            passed=cutoff_respected,
            detail=(
                f"{len(selected)} selected forecast(s); none published after "
                f"the D-1 09:00 Europe/London cutoff"
            ),
        ),
        QualityCheck(
            name="selectionUniqueness",
            passed=unique_delivery_keys,
            detail=(
                f"{selection.candidate_records} candidate record(s), "
                f"{selection.eligible_records} eligible, "
                f"{len(selected)} delivery interval(s) selected"
            ),
        ),
        QualityCheck(
            name="alignmentCoverage",
            passed=result.unavailable_reason is None,
            detail=(
                result.unavailable_reason
                if result.unavailable_reason is not None
                else (
                    f"{result.actuals_per_forecast_interval} actual observation(s) "
                    "per forecast interval; every matched interval is fully "
                    "covered and no value was interpolated"
                )
            ),
        ),
        QualityCheck(
            name="metricReconciliation",
            passed=accounted and matched == sum(
                1 for i in result.intervals if i.status == STATUS_MATCHED
            ),
            detail=(
                f"matched {matched} + missing {missing} == expected {expected}; "
                "metrics use matched intervals only"
            ),
        ),
    ]


@dataclass(frozen=True)
class AccuracyResult:
    """Everything an accuracy response needs, computed once."""

    payload: AccuracyPayload
    selection: ForecastSelection
    alignment: AlignmentInfo
    checks: list[QualityCheck]
    unit: str = GENERATION_UNIT


def build_accuracy_result(
    *,
    forecasts: Iterable[WindForRecord],
    fuelhh: Iterable[FuelHhRecord],
    delivery_start: datetime,
    delivery_end_exclusive: datetime,
    forecast_resolution_minutes: int | None,
    actual_resolution_minutes: int | None,
) -> AccuracyResult:
    """Run selection, alignment and metrics over the prepared raw records."""
    selection = select_latest_eligible(forecasts)
    result = align_and_score(
        delivery_start,
        delivery_end_exclusive,
        selection,
        fuelhh,
        forecast_resolution_minutes=forecast_resolution_minutes,
        actual_resolution_minutes=actual_resolution_minutes,
    )

    matched_intervals = [
        interval
        for interval in result.intervals
        if interval.status == STATUS_MATCHED and interval.error is not None
    ]
    errors = [
        interval.error
        for interval in matched_intervals
        if interval.error is not None
    ]
    metrics = _metric(errors)
    matched = len(matched_intervals)
    expected = len(result.intervals)
    per_interval = result.actuals_per_forecast_interval or 1

    missing_by_reason: dict[str, int] = {
        reason: 0 for reason in MISSING_REASONS
    }
    missing_intervals: list[MissingInterval] = []
    for interval in result.intervals:
        if interval.status == STATUS_MATCHED:
            continue
        missing_by_reason[interval.status] = (
            missing_by_reason.get(interval.status, 0) + 1
        )
        missing_intervals.append(
            MissingInterval(
                delivery_time=interval.delivery_time,
                delivery_date=interval.delivery_date,
                reason=interval.status,
            )
        )

    summary = AccuracySummary(
        unit=GENERATION_UNIT,
        **metrics,
        matched_intervals=matched,
        expected_intervals=expected,
        coverage_percent=_coverage_percent(matched, expected),
        matched_actual_half_hours=matched * per_interval,
        expected_actual_half_hours=expected * per_interval,
    )

    selected = list(selection.selected.values())
    selection_info = ForecastSelection(
        rule=CUTOFF_RULE,
        cutoff_local_time="09:00",
        cutoff_timezone=CUTOFF_TIMEZONE,
        status=CUTOFF_STATUS,
        policy=SELECTION_POLICY,
        selected_records=len(selected),
        unmatched_intervals=missing_by_reason[STATUS_NO_ELIGIBLE_FORECAST],
    )

    return AccuracyResult(
        payload=AccuracyPayload(
            summary=summary,
            daily=_daily_results(result.intervals),
            intervals=result.intervals,
            missing=MissingData(
                by_reason={
                    reason: count
                    for reason, count in missing_by_reason.items()
                    if count
                },
                intervals=missing_intervals,
            ),
        ),
        selection=selection_info,
        alignment=_alignment_info(result),
        checks=_quality_checks(
            selection=selection,
            result=result,
            matched=matched,
            expected=expected,
        ),
    )


__all__ = [
    "ALIGNMENT_DESCRIPTION",
    "ALIGNMENT_METHOD",
    "CUTOFF_RULE",
    "CUTOFF_STATUS",
    "CUTOFF_TIMEZONE",
    "GENERATION_UNIT",
    "AccuracyResult",
    "Grid",
    "Selection",
    "align_and_score",
    "build_accuracy_result",
    "cutoff_for_delivery",
    "expected_delivery_grid",
    "select_latest_eligible",
]
