"""Detection of the observed timestamp resolution of a dataset.

wind_forecast.md §3.4 / Stage 3 requirement 5: resolution is *observed from the
data, never assumed*. WINDFOR must not be treated as half-hourly just because
FUELHH is, and coarse forecasts must never be duplicated into finer slots.

Method: take the distinct timestamps of one field (delivery ``startTime`` or
``publishTime``), sort them, measure every consecutive gap in whole minutes,
and report the **smallest** gap as the observed resolution together with the
full gap histogram. The smallest gap is the native spacing of the series; a
larger modal gap would only mean some intervals are missing from the payload.

If fewer than two distinct timestamps exist the resolution is reported as
unavailable with a reason — never a guessed value.
"""

from __future__ import annotations

from datetime import datetime, timezone

from services.models import DeltaCount, ResolutionDetail

_MINUTE = 60


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def detect_resolution(values: list[datetime]) -> ResolutionDetail:
    """Return the observed resolution of ``values`` (UTC timestamps)."""
    distinct = sorted({_as_utc(v) for v in values})
    if len(distinct) < 2:
        return ResolutionDetail(
            minutes=None,
            label=None,
            distinct_timestamps=len(distinct),
            delta_histogram=[],
            unavailable_reason=(
                "fewer than two distinct timestamps in the retrieved records"
            ),
        )

    gaps: dict[int, int] = {}
    for previous, current in zip(distinct, distinct[1:]):
        delta_minutes = int(
            (current - previous).total_seconds() // _MINUTE
        )
        if delta_minutes <= 0:
            continue
        gaps[delta_minutes] = gaps.get(delta_minutes, 0) + 1

    if not gaps:
        return ResolutionDetail(
            minutes=None,
            label=None,
            distinct_timestamps=len(distinct),
            delta_histogram=[],
            unavailable_reason="timestamps are not spaced apart",
        )

    histogram = [
        DeltaCount(delta_minutes=delta, count=count)
        for delta, count in sorted(gaps.items())
    ]
    observed = min(gaps)
    return ResolutionDetail(
        minutes=observed,
        label=resolution_label(observed),
        distinct_timestamps=len(distinct),
        delta_histogram=histogram,
        unavailable_reason=None,
    )


def resolution_label(minutes: int) -> str:
    """Human-readable label: 30 -> '30 minutes', 60 -> '1 hour', 120 -> '2 hours'."""
    if minutes % _MINUTE == 0:
        hours = minutes // _MINUTE
        if hours == 1:
            return "1 hour"
        return f"{hours} hours"
    if minutes == 1:
        return "1 minute"
    return f"{minutes} minutes"