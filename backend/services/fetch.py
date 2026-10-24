"""Shared record collection: windows -> requests -> validation -> filtering.

Used by both dataset services so paging, validation, de-duplication and
rejection accounting behave identically for WINDFOR and FUELHH.

Rejection reasons (camelCase, stable contract in ``quality.rejectedReasons``):

* ``malformedRow`` — the row in ``data`` is not a JSON object.
* ``invalidTimestamp`` — a required timestamp is missing or unparseable.
* ``invalidGeneration`` — ``generation`` is present but not an integer/null.
* ``invalidRecord`` — any other field failed validation.
* ``outsideDeliveryWindow`` — row is valid but its delivery interval is not in
  January 2026 (fetched because of the wider publication window).
* ``nonWindFuelType`` — FUELHH row that is not ``fuelType = WIND``.

Null ``generation`` is **not** a rejection: the record is kept with ``None``
and counted in ``quality.nullGeneration`` (never zero-filled).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Sequence

from pydantic import BaseModel, ValidationError

from services.elexon_client import ElexonClient, extract_rows
from services.models import RequestWindow

MALFORMED_ROW = "malformedRow"
INVALID_TIMESTAMP = "invalidTimestamp"
INVALID_GENERATION = "invalidGeneration"
INVALID_RECORD = "invalidRecord"
OUTSIDE_DELIVERY_WINDOW = "outsideDeliveryWindow"
NON_WIND_FUEL_TYPE = "nonWindFuelType"

_ALL_REASONS = (
    MALFORMED_ROW,
    INVALID_TIMESTAMP,
    INVALID_GENERATION,
    INVALID_RECORD,
    OUTSIDE_DELIVERY_WINDOW,
    NON_WIND_FUEL_TYPE,
)


class DatasetFetch(BaseModel):
    """Result of paging one dataset and validating every returned row."""

    dataset: str
    path: str
    records: list[BaseModel]
    rows_fetched: int
    rejected: dict[str, int]
    duplicates_removed: int
    request_windows: list[RequestWindow]
    empty_windows: int

    @property
    def accepted(self) -> int:
        return len(self.records)

    @property
    def rejected_total(self) -> int:
        return sum(self.rejected.values())

    def integrity_ok(self) -> bool:
        """rows fetched == accepted + rejected + de-duplicated."""
        return (
            self.rows_fetched
            == self.accepted + self.rejected_total + self.duplicates_removed
        )


def _zero_reasons() -> dict[str, int]:
    return {reason: 0 for reason in _ALL_REASONS}


def _validation_reason(exc: ValidationError) -> str:
    for error in exc.errors():
        loc = error.get("loc") or ()
        field = loc[0] if loc else None
        if field in ("startTime", "publishTime"):
            return INVALID_TIMESTAMP
        if field == "generation":
            return INVALID_GENERATION
    return INVALID_RECORD


def _record_key(record: BaseModel) -> tuple:
    return tuple(sorted(record.__dict__.items()))


def _sort_key(record: BaseModel) -> tuple:
    utc_min = datetime.min.replace(tzinfo=timezone.utc)
    start = getattr(record, "startTime", None) or utc_min
    publish = getattr(record, "publishTime", None) or utc_min
    return (start, publish, getattr(record, "settlementPeriod", 0) or 0)


def collect_records(
    *,
    dataset: str,
    path: str,
    client: ElexonClient,
    windows: Sequence[Any],
    params_for_window: Callable[[Any], dict[str, Any]],
    record_model: type[BaseModel],
    scope_check: Callable[[BaseModel], str | None] | None = None,
) -> DatasetFetch:
    """Page ``windows`` through the API and return validated in-scope records.

    ``params_for_window`` turns one window (a ``(datetime, datetime)`` pair or
    a ``(date, date)`` pair) into query parameters. ``scope_check`` returns a
    rejection reason for otherwise-valid records that must not be delivered.
    """
    records: list[BaseModel] = []
    rejected = _zero_reasons()
    request_windows: list[RequestWindow] = []
    duplicates_removed = 0
    rows_fetched = 0
    empty_windows = 0
    seen: set[tuple] = set()

    for window in windows:
        payload = client.get_json(path, params_for_window(window))
        rows = extract_rows(payload, path=path)
        rows_fetched += len(rows)
        if not rows:
            empty_windows += 1
        start, end_inclusive = window
        request_windows.append(
            RequestWindow(
                dataset=dataset,
                start=start,
                end_inclusive=end_inclusive,
                rows=len(rows),
            )
        )

        for row in rows:
            if not isinstance(row, dict):
                rejected[MALFORMED_ROW] += 1
                continue
            try:
                record = record_model.model_validate(row)
            except ValidationError as exc:
                rejected[_validation_reason(exc)] += 1
                continue

            if scope_check is not None:
                reason = scope_check(record)
                if reason is not None:
                    rejected[reason] += 1
                    continue

            key = _record_key(record)
            if key in seen:
                duplicates_removed += 1
                continue
            seen.add(key)
            records.append(record)

    records.sort(key=_sort_key)

    return DatasetFetch(
        dataset=dataset,
        path=path,
        records=records,
        rows_fetched=rows_fetched,
        rejected=rejected,
        duplicates_removed=duplicates_removed,
        request_windows=request_windows,
        empty_windows=empty_windows,
    )