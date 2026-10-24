"""Typed models for Stage 3 (Elexon data integration).

Two groups:

* Raw record models — one per Elexon dataset. Field names mirror the Elexon
  JSON exactly, so validated records round-trip without renaming. Parsing is
  done by pydantic validation; anything that does not validate is rejected and
  counted by the fetch layer rather than crashing a request.
* Envelope models — every endpoint answers with the same
  ``{"data", "meta", "quality"}`` shape described in wind_forecast.md §16.

Notes on honesty of representation:

* Null ``generation`` values are preserved as ``None`` and counted; they are
  never coerced to zero.
* Timestamps are timezone-aware UTC datetimes and are serialised back as
  ``...Z`` (verified), so the source instant is preserved exactly.
* No forecast selection, alignment or error metric exists at this stage.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

ELEXON_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"

WINDFOR_DOCS_URL = (
    "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR"
)
FUELHH_DOCS_URL = (
    "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH"
)

# wind_forecast.md §3.5 — proposed day-ahead cutoff. It is NOT confirmed by the
# business and Stage 3 deliberately performs no forecast selection.
CUTOFF_STATUS = "unconfirmed"
CUTOFF_RULE = "D-1 09:00 Europe/London"
CUTOFF_NOTE = (
    "Proposed day-ahead decision cutoff only. Stage 3 performs no forecast "
    "selection and computes no accuracy metrics (MAE, RMSE, bias, coverage); "
    "those belong to Stage 4. The cutoff must be confirmed before it is used."
)


class ApiModel(BaseModel):
    """Base: camelCase JSON keys, snake_case Python names."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --------------------------------------------------------------------------- #
# Raw Elexon records
# --------------------------------------------------------------------------- #


class WindForRecord(ApiModel):
    """One WINDFOR forecast row.

    Elexon schema: ``dataset``, ``publishTime``, ``startTime``,
    ``generation`` (nullable integer, MW). No settlement fields are published
    for this dataset.
    """

    dataset: str | None = None
    publishTime: datetime
    startTime: datetime
    generation: int | None = None


class FuelHhRecord(ApiModel):
    """One FUELHH outturn row.

    Elexon schema: ``dataset``, ``publishTime`` (nullable), ``startTime``,
    ``settlementDate``, ``settlementPeriod``, ``fuelType``, ``generation``
    (nullable integer, MW average over the half-hour).
    """

    dataset: str | None = None
    publishTime: datetime | None = None
    startTime: datetime
    settlementDate: date | None = None
    settlementPeriod: int | None = None
    fuelType: str | None = None
    generation: int | None = None


# --------------------------------------------------------------------------- #
# Envelope pieces
# --------------------------------------------------------------------------- #


class Window(ApiModel):
    """A date/time window. ``end_exclusive`` follows half-open UTC semantics."""

    start: datetime | None = None
    end_exclusive: datetime | None = None
    label: str | None = None
    timezone: str = "UTC"


class RequestWindow(ApiModel):
    """One upstream request actually issued (the pagination unit).

    ``start``/``end_inclusive`` are datetimes for publish-time windows and
    dates for settlement-date windows.
    """

    dataset: str
    start: datetime | date | str
    end_inclusive: datetime | date | str
    rows: int = 0


class Pagination(ApiModel):
    strategy: str
    max_window_days: int
    windows_requested: int = 0
    windows_succeeded: int = 0
    empty_windows: int = 0


class DeltaCount(ApiModel):
    delta_minutes: int
    count: int


class ResolutionDetail(ApiModel):
    """Observed timestamp resolution — detected, never assumed."""

    minutes: int | None = None
    label: str | None = None
    distinct_timestamps: int = 0
    delta_histogram: list[DeltaCount] = []
    method: str = (
        "smallest gap between consecutive distinct UTC timestamps in the "
        "retrieved records"
    )
    unavailable_reason: str | None = None


class DatasetResolutions(ApiModel):
    """Observed resolution of one dataset for both of its timestamps."""

    delivery: ResolutionDetail
    publish: ResolutionDetail


class ObservedCoverage(ApiModel):
    first_delivery_time: datetime | None = None
    last_delivery_time: datetime | None = None
    first_publish_time: datetime | None = None
    last_publish_time: datetime | None = None


class CutoffNote(ApiModel):
    status: str = CUTOFF_STATUS
    rule: str = CUTOFF_RULE
    note: str = CUTOFF_NOTE


class ErrorDetail(ApiModel):
    type: str
    message: str
    status_code: int | None = None
    upstream_status: int | None = None
    retryable: bool = False


class Meta(ApiModel):
    """Request/retrieval metadata. Same shape on every endpoint."""

    source: str = "Elexon Insights API"
    base_url: str = ELEXON_BASE_URL
    datasets: list[str] = []
    retrieved_at: datetime | None = None
    delivery_window: Window | None = None
    publication_window: Window | None = None
    settlement_window: Window | None = None
    request_windows: list[RequestWindow] = []
    pagination: Pagination | None = None
    observed_resolutions: dict[str, DatasetResolutions] = {}
    observed_coverage: dict[str, ObservedCoverage] = {}
    record_counts: dict[str, int] = {}
    record_count: int = 0
    day_ahead_cutoff: CutoffNote = Field(default_factory=CutoffNote)
    documentation: dict[str, str] = {}
    error: ErrorDetail | None = None
    notes: list[str] = []


class QualityCheck(ApiModel):
    name: str
    passed: bool
    detail: str


class DatasetQuality(ApiModel):
    rows_fetched: int = 0
    accepted: int = 0
    rejected: int = 0
    rejected_reasons: dict[str, int] = {}
    duplicates_removed: int = 0
    null_generation: int = 0
    null_publish_time: int = 0


class Quality(ApiModel):
    """Validation summary. Rejected/null counts are always reported."""

    rows_fetched: int = 0
    accepted: int = 0
    rejected: int = 0
    rejected_reasons: dict[str, int] = {}
    duplicates_removed: int = 0
    null_generation: int = 0
    null_publish_time: int = 0
    per_dataset: dict[str, DatasetQuality] = {}
    checks: list[QualityCheck] = []
    notes: list[str] = []


class DatasetSummary(ApiModel):
    """Compact per-dataset summary returned by /api/elexon/january-2026."""

    dataset: str
    endpoint_path: str
    record_count: int
    rows_fetched: int
    rejected: int
    null_generation: int
    observed_resolution: DatasetResolutions
    observed_coverage: ObservedCoverage
    requested_delivery_window: Window | None = None
    requested_publication_window: Window | None = None
    requested_settlement_window: Window | None = None


T = TypeVar("T")


class Envelope(ApiModel, Generic[T]):
    """Consistent response structure: data + meta + quality."""

    data: list[T]
    meta: Meta
    quality: Quality