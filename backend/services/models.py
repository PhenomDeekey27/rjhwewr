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
    "Proposed day-ahead decision cutoff. Forecast selection uses it, but it "
    "remains an unconfirmed business assumption: a different gate changes "
    "which forecast is selected and therefore every accuracy metric."
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


class RecordPage(ApiModel):
    """Server-side page metadata for record-level endpoints.

    This is deliberately separate from :class:`Pagination`, which describes the
    upstream Elexon request windows. ``total_records`` is the number of rows in
    the prepared result *after* filters and *before* slicing, so the UI can
    compute an honest page count without downloading the full dataset.
    """

    page: int = 1
    per_page: int = 0
    total_records: int = 0
    total_pages: int = 0
    returned: int = 0
    sort: str | None = None
    direction: str | None = None
    filters: dict[str, str] = {}


class PreparedInfo(ApiModel):
    """How a response relates to the prepared (server-side) cache."""

    cached: bool = False
    prepared_at: datetime | None = None
    age_seconds: float | None = None
    ttl_seconds: int | None = None


class ForecastSelection(ApiModel):
    """The forecast-selection rule actually applied to the payload."""

    rule: str = CUTOFF_RULE
    cutoff_local_time: str = "09:00"
    cutoff_timezone: str = "Europe/London"
    status: str = CUTOFF_STATUS
    policy: str = (
        "latest publishTime at or before the cutoff, per delivery interval"
    )
    selected_records: int = 0
    unmatched_intervals: int = 0


class AlignmentInfo(ApiModel):
    """The resolution-alignment method actually applied to the payload."""

    method: str
    description: str
    forecast_resolution_minutes: int | None = None
    actual_resolution_minutes: int | None = None
    actuals_per_forecast_interval: int | None = None
    affected_intervals: int = 0
    interpolation: str = "none"


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
    record_page: RecordPage | None = None
    prepared: PreparedInfo | None = None
    selection: ForecastSelection | None = None
    alignment: AlignmentInfo | None = None
    unit: str | None = None
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


# --------------------------------------------------------------------------- #
# Data Explorer (record-level, server-paginated)
# --------------------------------------------------------------------------- #

#: Forecast and actual both present. No day-ahead selection is applied here.
STATUS_SOURCE_ONLY = "Source data only"
STATUS_NO_ACTUAL = "No actual"
STATUS_NO_FORECAST = "No eligible forecast"


class IntervalRecord(ApiModel):
    """One raw explorer row.

    A row is one WINDFOR publication version joined on ``startTime`` to the
    FUELHH outturn for the same delivery interval, or a FUELHH record that has
    no WINDFOR row at that ``startTime``. All raw forecasts are preserved:
    rows are never collapsed to a single forecast per interval.
    """

    delivery_time: datetime
    forecast_published: datetime | None = None
    publication_lead_minutes: int | None = None
    forecast_generation: int | None = None
    actual_generation: int | None = None
    error: int | None = None
    match_status: str
    settlement_date: date | None = None
    settlement_period: int | None = None


# --------------------------------------------------------------------------- #
# Forecast accuracy (selection + alignment + metrics)
# --------------------------------------------------------------------------- #

STATUS_MATCHED = "matched"
STATUS_NO_ELIGIBLE_FORECAST = "noEligibleForecast"
STATUS_MISSING_ACTUAL = "missingActual"
STATUS_NULL_FORECAST_VALUE = "nullForecastValue"
STATUS_NULL_ACTUAL_VALUE = "nullActualValue"
STATUS_ALIGNMENT_UNAVAILABLE = "alignmentUnavailable"


class AccuracySummary(ApiModel):
    """Whole-period metrics over matched hourly forecast intervals only."""

    unit: str = "MW"
    mae: float | None = None
    rmse: float | None = None
    bias: float | None = None
    matched_intervals: int = 0
    expected_intervals: int = 0
    coverage_percent: float | None = None
    matched_actual_half_hours: int = 0
    expected_actual_half_hours: int = 0


class DailyAccuracy(ApiModel):
    """Metrics for one Europe/London delivery day."""

    delivery_date: date
    expected_intervals: int = 0
    matched_intervals: int = 0
    coverage_percent: float | None = None
    mae: float | None = None
    rmse: float | None = None
    bias: float | None = None
    missing_by_reason: dict[str, int] = {}


class IntervalAccuracy(ApiModel):
    """One delivery interval at the forecast's native resolution."""

    delivery_time: datetime
    delivery_date: date
    forecast_published: datetime | None = None
    forecast_generation: int | None = None
    actual_generation: float | None = None
    error: float | None = None
    status: str
    actual_observations: int = 0


class MissingInterval(ApiModel):
    delivery_time: datetime
    delivery_date: date
    reason: str


class MissingData(ApiModel):
    by_reason: dict[str, int] = {}
    intervals: list[MissingInterval] = []


class AccuracyPayload(ApiModel):
    summary: AccuracySummary
    daily: list[DailyAccuracy] = []
    intervals: list[IntervalAccuracy] = []
    missing: MissingData = Field(default_factory=MissingData)


T = TypeVar("T")


class Envelope(ApiModel, Generic[T]):
    """Consistent response structure: data + meta + quality."""

    data: list[T]
    meta: Meta
    quality: Quality


class AccuracyEnvelope(ApiModel):
    """Accuracy response: ``data`` is one computed payload, not a row list."""

    data: AccuracyPayload
    meta: Meta
    quality: Quality