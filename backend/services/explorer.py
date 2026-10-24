"""Record-level Data Explorer rows and server-side pagination.

The explorer shows *raw* January 2026 records: every WINDFOR publication
version is kept (there are many forecasts per delivery interval), joined on
``startTime`` to the FUELHH outturn for the same interval, plus FUELHH rows
that have no WINDFOR row at that ``startTime``. Nothing is collapsed, selected
by the day-ahead cutoff, interpolated or zero-filled here.

Because the raw set is ~19,000 rows, the page is built and paginated on the
server. The client receives at most ``per_page`` rows plus an honest count of
the full filtered set, instead of downloading and rendering everything.

``matchedOnly`` means "has both a forecast value and an actual value"; it is a
raw-data filter, not the day-ahead eligibility rule.
"""

from __future__ import annotations

from datetime import datetime, timezone
from math import ceil
from typing import Iterable

from services.models import (
    STATUS_NO_ACTUAL,
    STATUS_NO_FORECAST,
    STATUS_SOURCE_ONLY,
    FuelHhRecord,
    IntervalRecord,
    RecordPage,
    WindForRecord,
)

UTC_MIN = datetime.min.replace(tzinfo=timezone.utc)

#: Accepted ``sort`` values and the model field they map to.
SORT_FIELDS: dict[str, str] = {
    "deliveryTime": "delivery_time",
    "forecastPublished": "forecast_published",
    "publicationLead": "publication_lead_minutes",
    "forecastMw": "forecast_generation",
    "actualMw": "actual_generation",
    "errorMw": "error",
    "matchStatus": "match_status",
}
DEFAULT_SORT = "deliveryTime"
DEFAULT_DIRECTION = "asc"
PAGE_SIZES = (25, 50, 100)
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500


def _latest_actual_per_delivery(
    records: Iterable[FuelHhRecord],
) -> dict[datetime, FuelHhRecord]:
    """Index FUELHH by ``startTime``, keeping the latest published row.

    Duplicates are already removed by the fetch layer; this is a deterministic
    guard so a duplicated upstream publication can never fan out the join.
    """
    by_start: dict[datetime, FuelHhRecord] = {}
    for record in records:
        current = by_start.get(record.startTime)
        if current is None:
            by_start[record.startTime] = record
            continue
        new_publish = record.publishTime or UTC_MIN
        old_publish = current.publishTime or UTC_MIN
        if new_publish >= old_publish:
            by_start[record.startTime] = record
    return by_start


def build_explorer_rows(
    windfor: Iterable[WindForRecord],
    fuelhh: Iterable[FuelHhRecord],
) -> list[IntervalRecord]:
    """Join every raw forecast record to its actual and add orphan actuals.

    Rows are returned sorted by delivery time, then publication time. No row is
    dropped: the count is ``len(WINDFOR) + orphan FUELHH records``.
    """
    actuals = _latest_actual_per_delivery(fuelhh)
    forecast_starts: set[datetime] = set()
    rows: list[IntervalRecord] = []

    for forecast in windfor:
        forecast_starts.add(forecast.startTime)
        actual = actuals.get(forecast.startTime)
        error = None
        if (
            actual is not None
            and forecast.generation is not None
            and actual.generation is not None
        ):
            error = forecast.generation - actual.generation
        rows.append(
            IntervalRecord(
                delivery_time=forecast.startTime,
                forecast_published=forecast.publishTime,
                publication_lead_minutes=(
                    int(
                        (
                            forecast.startTime - forecast.publishTime
                        ).total_seconds()
                        // 60
                    )
                    if forecast.publishTime is not None
                    else None
                ),
                forecast_generation=forecast.generation,
                actual_generation=(
                    actual.generation if actual is not None else None
                ),
                error=error,
                match_status=(
                    STATUS_SOURCE_ONLY if actual is not None else STATUS_NO_ACTUAL
                ),
                settlement_date=(
                    actual.settlementDate if actual is not None else None
                ),
                settlement_period=(
                    actual.settlementPeriod if actual is not None else None
                ),
            )
        )

    for actual in actuals.values():
        if actual.startTime in forecast_starts:
            continue
        rows.append(
            IntervalRecord(
                delivery_time=actual.startTime,
                forecast_published=None,
                publication_lead_minutes=None,
                forecast_generation=None,
                actual_generation=actual.generation,
                error=None,
                match_status=STATUS_NO_FORECAST,
                settlement_date=actual.settlementDate,
                settlement_period=actual.settlementPeriod,
            )
        )

    rows.sort(key=lambda row: (row.delivery_time, row.forecast_published or UTC_MIN))
    return rows


def filter_rows(
    rows: Iterable[IntervalRecord],
    *,
    status: str | None = None,
    matched_only: bool = False,
) -> list[IntervalRecord]:
    """Apply the explorer's raw-data filters. An unknown status matches nothing."""
    selected = list(rows)
    if status:
        selected = [row for row in selected if row.match_status == status]
    if matched_only:
        selected = [
            row
            for row in selected
            if row.forecast_generation is not None
            and row.actual_generation is not None
        ]
    return selected


def sort_rows(
    rows: list[IntervalRecord],
    *,
    sort: str = DEFAULT_SORT,
    direction: str = DEFAULT_DIRECTION,
) -> list[IntervalRecord]:
    """Sort a copy; missing values stay last in both directions."""
    field = SORT_FIELDS.get(sort)
    if field is None:
        raise ValueError(f"unsupported sort field: {sort}")
    if direction not in ("asc", "desc"):
        raise ValueError(f"unsupported direction: {direction}")

    present = [row for row in rows if getattr(row, field) is not None]
    missing = [row for row in rows if getattr(row, field) is None]
    present.sort(
        key=lambda row: getattr(row, field),
        reverse=direction == "desc",
    )
    return present + missing


def paginate(
    rows: list[IntervalRecord],
    *,
    page: int,
    per_page: int,
    sort: str,
    direction: str,
    filters: dict[str, str] | None = None,
) -> tuple[list[IntervalRecord], RecordPage]:
    """Slice one page and report totals for the whole filtered prepared set."""
    total = len(rows)
    total_pages = max(1, ceil(total / per_page)) if total else 0
    start = (page - 1) * per_page
    end = start + per_page
    page_rows = rows[start:end] if total else []
    meta = RecordPage(
        page=page,
        per_page=per_page,
        total_records=total,
        total_pages=total_pages,
        returned=len(page_rows),
        sort=sort,
        direction=direction,
        filters=filters or {},
    )
    return page_rows, meta


__all__ = [
    "DEFAULT_DIRECTION",
    "DEFAULT_PAGE_SIZE",
    "DEFAULT_SORT",
    "MAX_PAGE_SIZE",
    "PAGE_SIZES",
    "SORT_FIELDS",
    "build_explorer_rows",
    "filter_rows",
    "paginate",
    "sort_rows",
]
