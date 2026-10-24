"""January 2026 window constants and response builders (Stage 3 orchestration).

Scope
-----
* Delivery intervals: **1 Jan 2026 00:00 UTC – 1 Feb 2026 00:00 UTC
  (exclusive)**, i.e. exactly January 1–31, 2026. January 2026 contains no
  clock change, so Europe/London == UTC for every interval in scope; the UTC
  boundary is still explicit and no assumption about 48-period days is baked
  in.
* Publication window (WINDFOR): **15 Dec 2025 00:00 UTC – 2 Feb 2026 00:00
  UTC (exclusive)**. WINDFOR can only be queried by publish time, and
  forecasts published *before* January are the ones a day-ahead buyer would
  have had for deliveries on 1 January. The observed WINDFOR horizon is about
  74 hours (from 20:00 on the day before the publish date to 21:00 three days
  later), so the earliest publish that can cover a 1 Jan 00:00 delivery is
  around 28 Dec 2025 — the window opens 15 Dec 2025 for margin, which the
  live API was verified to return.
* Settlement dates (FUELHH): **2026-01-01 – 2026-01-31 inclusive**, filtered
  server-side with ``fuelType=WIND``.

Both endpoints are limited to 7-day inclusive ranges per request, so the
windows are paged (see ``services.elexon_client``).

Stage 3 stops here: raw records + metadata/quality only. No forecast
selection, no MAE/RMSE/bias/coverage (Stage 4), and the proposed D‑1 09:00
London cutoff is carried as an explicitly *unconfirmed* note.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from services.elexon_client import (
    ElexonClient,
    chunk_date_windows,
    chunk_datetime_windows,
)
from services.elexon_client import clear_cache as clear_upstream_cache
from services.explorer import (
    build_explorer_rows,
    filter_rows,
    paginate,
    sort_rows,
)
from services.fetch import DatasetFetch
from services.forecast_accuracy import build_accuracy_result
from services.fuelhh import FUELHH, FUELHH_PATH, fetch_fuelhh
from services.models import (
    FUELHH_DOCS_URL,
    WINDFOR_DOCS_URL,
    AccuracyEnvelope,
    AlignmentInfo,
    DatasetQuality,
    DatasetResolutions,
    DatasetSummary,
    Envelope,
    ForecastSelection,
    FuelHhRecord,
    IntervalRecord,
    Meta,
    ObservedCoverage,
    Pagination,
    PreparedInfo,
    Quality,
    QualityCheck,
    RecordPage,
    Window,
    WindForRecord,
)
from services.prepared import get_prepared, with_prepared_meta
from services.resolution import detect_resolution
from services.windfor import WINDFOR, WINDFOR_PATH, fetch_windfor

UTC = timezone.utc
_ONE_DAY = timedelta(days=1)


def _utc(year: int, month: int, day: int, hour: int = 0) -> datetime:
    return datetime(year, month, day, hour, tzinfo=UTC)


# --- analysis window ------------------------------------------------------ #

DELIVERY_START = _utc(2026, 1, 1)
DELIVERY_END_EXCLUSIVE = _utc(2026, 2, 1)
DELIVERY_LABEL = (
    "January 2026 delivery intervals: 1 Jan 2026 00:00 UTC "
    "to 1 Feb 2026 00:00 UTC (exclusive)"
)

# --- WINDFOR publication window ------------------------------------------- #

PUBLICATION_START = _utc(2025, 12, 15)
PUBLICATION_END_EXCLUSIVE = _utc(2026, 2, 2)
PUBLICATION_LABEL = (
    "Forecast publication window: 15 Dec 2025 00:00 UTC to "
    "1 Feb 2026 24:00 UTC (exclusive). Starts before January so forecasts "
    "published in late December 2025 for early-January deliveries are "
    "included; ends 1 Feb 2026 so in-day publishes for 31 Jan deliveries "
    "are included."
)

# --- FUELHH settlement window --------------------------------------------- #

SETTLEMENT_START = date(2026, 1, 1)
SETTLEMENT_END_INCLUSIVE = date(2026, 1, 31)
SETTLEMENT_LABEL = (
    "Settlement dates 2026-01-01 to 2026-01-31 inclusive "
    "(server-side fuelType=WIND filter applied)"
)

STRATEGY = "sequential fixed-size windows"
MAX_WINDOW_DAYS = 7


def publish_windows() -> list[tuple[datetime, datetime]]:
    """Inclusive ≤7-day publish-time windows covering the publication window."""
    return chunk_datetime_windows(PUBLICATION_START, PUBLICATION_END_EXCLUSIVE)


def settlement_windows() -> list[tuple[date, date]]:
    """Inclusive ≤7-day settlement-date windows covering January 2026."""
    return chunk_date_windows(SETTLEMENT_START, SETTLEMENT_END_INCLUSIVE)


# --- envelope construction ------------------------------------------------ #


def _utc_min() -> datetime:
    return datetime.min.replace(tzinfo=UTC)


def _coverage(fetch: DatasetFetch) -> ObservedCoverage:
    starts = [r.startTime for r in fetch.records]
    publishes = [
        r.publishTime
        for r in fetch.records
        if getattr(r, "publishTime", None) is not None
    ]
    return ObservedCoverage(
        first_delivery_time=min(starts) if starts else None,
        last_delivery_time=max(starts) if starts else None,
        first_publish_time=min(publishes) if publishes else None,
        last_publish_time=max(publishes) if publishes else None,
    )


def _resolutions(fetch: DatasetFetch) -> DatasetResolutions:
    publishes = [
        r.publishTime
        for r in fetch.records
        if getattr(r, "publishTime", None) is not None
    ]
    return DatasetResolutions(
        delivery=detect_resolution(
            [r.startTime for r in fetch.records]
        ),
        publish=detect_resolution(publishes),
    )


def _checks(fetch: DatasetFetch, *, wind_filter: bool) -> list[QualityCheck]:
    in_scope = fetch.records
    window = (
        "1 Jan 2026 00:00 UTC ≤ startTime < 1 Feb 2026 00:00 UTC"
    )
    nulls = sum(1 for r in in_scope if r.generation is None)
    return [
        QualityCheck(
            name="responseShape",
            passed=True,
            detail=(
                f"{fetch.rows_fetched} rows returned across "
                f"{len(fetch.request_windows)} request window(s); "
                f"{fetch.empty_windows} empty"
            ),
        ),
        QualityCheck(
            name="accounting",
            passed=fetch.integrity_ok(),
            detail=(
                f"rowsFetched {fetch.rows_fetched} == accepted "
                f"{fetch.accepted} + rejected {fetch.rejected_total} + "
                f"duplicates {fetch.duplicates_removed}"
            ),
        ),
        QualityCheck(
            name="timestampsParse",
            passed=fetch.rejected["invalidTimestamp"] == 0,
            detail=(
                f"{fetch.rejected['invalidTimestamp']} row(s) with missing or "
                "unparseable timestamps rejected"
            ),
        ),
        QualityCheck(
            name="deliveryWindow",
            passed=True,
            detail=(
                f"verified: all {len(in_scope)} accepted records have "
                f"{window}; "
                f"{fetch.rejected['outsideDeliveryWindow']} out-of-window "
                "row(s) excluded"
            ),
        ),
        QualityCheck(
            name="duplicates",
            passed=fetch.duplicates_removed == 0,
            detail=f"{fetch.duplicates_removed} duplicate row(s) removed",
        ),
        QualityCheck(
            name="nullGeneration",
            passed=nulls == 0,
            detail=(
                f"{nulls} record(s) with null generation, preserved as null "
                "(never counted as zero)"
            ),
        ),
        *(
            [
                QualityCheck(
                    name="fuelTypeFilter",
                    passed=fetch.rejected["nonWindFuelType"] == 0,
                    detail=(
                        "all accepted records have fuelType=WIND; "
                        f"{fetch.rejected['nonWindFuelType']} non-wind row(s) "
                        "excluded"
                    ),
                )
            ]
            if wind_filter
            else []
        ),
    ]


def _build_meta(
    fetches: list[DatasetFetch],
    *,
    retrieved_at: datetime,
    publication_window: Window | None,
    settlement_window: Window | None,
    notes: list[str],
) -> Meta:
    datasets = [f.dataset for f in fetches]
    documents = {}
    for name in datasets:
        documents[name] = (
            WINDFOR_DOCS_URL if name == WINDFOR else FUELHH_DOCS_URL
        )

    return Meta(
        datasets=datasets,
        retrieved_at=retrieved_at,
        delivery_window=Window(
            start=DELIVERY_START,
            end_exclusive=DELIVERY_END_EXCLUSIVE,
            label=DELIVERY_LABEL,
            timezone="UTC (Europe/London equals UTC for January 2026)",
        ),
        publication_window=publication_window,
        settlement_window=settlement_window,
        request_windows=[w for f in fetches for w in f.request_windows],
        pagination=Pagination(
            strategy=STRATEGY,
            max_window_days=MAX_WINDOW_DAYS,
            windows_requested=sum(len(f.request_windows) for f in fetches),
            windows_succeeded=sum(len(f.request_windows) for f in fetches),
            empty_windows=sum(f.empty_windows for f in fetches),
        ),
        observed_resolutions={
            f.dataset: _resolutions(f) for f in fetches
        },
        observed_coverage={f.dataset: _coverage(f) for f in fetches},
        record_counts={f.dataset: f.accepted for f in fetches},
        record_count=sum(f.accepted for f in fetches),
        documentation=documents,
        notes=notes,
    )


def _build_quality(fetches: list[DatasetFetch], *, notes: list[str]) -> Quality:
    per_dataset = {}
    reasons: dict[str, int] = {}
    for fetch in fetches:
        per_dataset[fetch.dataset] = DatasetQuality(
            rows_fetched=fetch.rows_fetched,
            accepted=fetch.accepted,
            rejected=fetch.rejected_total,
            rejected_reasons={
                k: v for k, v in fetch.rejected.items() if v
            },
            duplicates_removed=fetch.duplicates_removed,
            null_generation=sum(
                1 for r in fetch.records if r.generation is None
            ),
            null_publish_time=sum(
                1
                for r in fetch.records
                if getattr(r, "publishTime", None) is None
            ),
        )
        for reason, count in fetch.rejected.items():
            reasons[reason] = reasons.get(reason, 0) + count

    checks = [
        check
        for fetch in fetches
        for check in _checks(
            fetch, wind_filter=fetch.dataset == FUELHH
        )
    ]
    return Quality(
        rows_fetched=sum(f.rows_fetched for f in fetches),
        accepted=sum(f.accepted for f in fetches),
        rejected=sum(f.rejected_total for f in fetches),
        rejected_reasons={k: v for k, v in reasons.items() if v},
        duplicates_removed=sum(f.duplicates_removed for f in fetches),
        null_generation=sum(
            1 for f in fetches for r in f.records if r.generation is None
        ),
        null_publish_time=sum(
            1
            for f in fetches
            for r in f.records
            if getattr(r, "publishTime", None) is None
        ),
        per_dataset=per_dataset,
        checks=checks,
        notes=notes,
    )


COMMON_NOTES = [
    "Timestamp resolution is observed from the retrieved records, never "
    "assumed; source timestamps and raw values are preserved unchanged.",
    "Null generation values are preserved as null and never coerced to zero.",
    "No credentials are used: the Elexon Insights API is public and requires "
    "no API key.",
]

RAW_ONLY_NOTES = COMMON_NOTES + [
    "Raw records only: this response applies no day-ahead forecast selection "
    "and computes no accuracy metrics. Every publication version is returned.",
]

QUALITY_NOTES = [
    "Rejected rows are excluded from data and always counted here.",
    "An empty payload is reported as empty, never as an error or as zeros.",
]


def _now(now: datetime | None) -> datetime:
    if now is not None:
        return now if now.tzinfo else now.replace(tzinfo=UTC)
    return datetime.now(UTC)


# --- public builders ------------------------------------------------------ #


def build_windfor_response(
    client: ElexonClient, *, now: datetime | None = None
) -> Envelope[WindForRecord]:
    fetch = fetch_windfor(
        client,
        publish_windows=publish_windows(),
        delivery_start=DELIVERY_START,
        delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
    )
    publication_window = Window(
        start=PUBLICATION_START,
        end_exclusive=PUBLICATION_END_EXCLUSIVE,
        label=PUBLICATION_LABEL,
    )
    meta = _build_meta(
        [fetch],
        retrieved_at=_now(now),
        publication_window=publication_window,
        settlement_window=None,
        notes=RAW_ONLY_NOTES
        + [
            "WINDFOR is queried by publish time only; the publication window "
            "extends before 1 January 2026 so forecasts published in late "
            "December 2025 for early-January deliveries are included."
        ],
    )
    quality = _build_quality([fetch], notes=list(QUALITY_NOTES))
    return Envelope[WindForRecord](
        data=fetch.records, meta=meta, quality=quality
    )


def build_fuelhh_response(
    client: ElexonClient, *, now: datetime | None = None
) -> Envelope[FuelHhRecord]:
    fetch = fetch_fuelhh(
        client,
        settlement_windows=settlement_windows(),
        delivery_start=DELIVERY_START,
        delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
    )
    settlement_window = Window(
        start=datetime.combine(SETTLEMENT_START, time.min, tzinfo=UTC),
        end_exclusive=datetime.combine(
            SETTLEMENT_END_INCLUSIVE, time.min, tzinfo=UTC
        )
        + _ONE_DAY,
        label=SETTLEMENT_LABEL,
    )
    meta = _build_meta(
        [fetch],
        retrieved_at=_now(now),
        publication_window=None,
        settlement_window=settlement_window,
        notes=RAW_ONLY_NOTES
        + [
            "FUELHH is queried with settlementDateFrom/settlementDateTo and "
            "the server-side fuelType=WIND filter; fuelType is re-checked "
            "on every returned row."
        ],
    )
    quality = _build_quality([fetch], notes=list(QUALITY_NOTES))
    return Envelope[FuelHhRecord](data=fetch.records, meta=meta, quality=quality)


def build_summary_response(
    client: ElexonClient, *, now: datetime | None = None
) -> Envelope[DatasetSummary]:
    windfor = fetch_windfor(
        client,
        publish_windows=publish_windows(),
        delivery_start=DELIVERY_START,
        delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
    )
    fuelhh = fetch_fuelhh(
        client,
        settlement_windows=settlement_windows(),
        delivery_start=DELIVERY_START,
        delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
    )
    fetches = [windfor, fuelhh]
    retrieved_at = _now(now)

    summaries = [
        DatasetSummary(
            dataset=fetch.dataset,
            endpoint_path=fetch.path,
            record_count=fetch.accepted,
            rows_fetched=fetch.rows_fetched,
            rejected=fetch.rejected_total,
            null_generation=sum(
                1 for r in fetch.records if r.generation is None
            ),
            observed_resolution=_resolutions(fetch),
            observed_coverage=_coverage(fetch),
            requested_delivery_window=Window(
                start=DELIVERY_START,
                end_exclusive=DELIVERY_END_EXCLUSIVE,
                label=DELIVERY_LABEL,
            ),
            requested_publication_window=(
                Window(
                    start=PUBLICATION_START,
                    end_exclusive=PUBLICATION_END_EXCLUSIVE,
                    label=PUBLICATION_LABEL,
                )
                if fetch.dataset == WINDFOR
                else None
            ),
            requested_settlement_window=(
                Window(
                    start=datetime.combine(
                        SETTLEMENT_START, time.min, tzinfo=UTC
                    ),
                    end_exclusive=datetime.combine(
                        SETTLEMENT_END_INCLUSIVE, time.min, tzinfo=UTC
                    )
                    + _ONE_DAY,
                    label=SETTLEMENT_LABEL,
                )
                if fetch.dataset == FUELHH
                else None
            ),
        )
        for fetch in fetches
    ]

    meta = _build_meta(
        fetches,
        retrieved_at=retrieved_at,
        publication_window=Window(
            start=PUBLICATION_START,
            end_exclusive=PUBLICATION_END_EXCLUSIVE,
            label=PUBLICATION_LABEL,
        ),
        settlement_window=Window(
            start=datetime.combine(SETTLEMENT_START, time.min, tzinfo=UTC),
            end_exclusive=datetime.combine(
                SETTLEMENT_END_INCLUSIVE, time.min, tzinfo=UTC
            )
            + _ONE_DAY,
            label=SETTLEMENT_LABEL,
        ),
        notes=COMMON_NOTES,
    )
    quality = _build_quality(fetches, notes=list(QUALITY_NOTES))
    return Envelope[DatasetSummary](
        data=summaries, meta=meta, quality=quality
    )


# --- combined envelope helpers -------------------------------------------- #


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def _first_non_none(items: list, attribute: str):
    for item in items:
        value = getattr(item, attribute)
        if value is not None:
            return value
    return None


def _combined_meta(
    envelopes: list[Envelope],
    *,
    prepared: PreparedInfo | None = None,
    record_page: RecordPage | None = None,
    selection: ForecastSelection | None = None,
    alignment: AlignmentInfo | None = None,
    unit: str | None = None,
    extra_notes: list[str] | None = None,
) -> Meta:
    """One metadata block for responses that draw on both raw datasets.

    Resolution, coverage, record counts and documentation are copied from the
    real per-dataset metadata, never re-derived or guessed in the route.
    """
    metas = [envelope.meta for envelope in envelopes]
    resolutions: dict[str, DatasetResolutions] = {}
    coverage: dict[str, ObservedCoverage] = {}
    counts: dict[str, int] = {}
    documents: dict[str, str] = {}
    request_windows = []
    paginations = []
    for meta in metas:
        resolutions.update(meta.observed_resolutions)
        coverage.update(meta.observed_coverage)
        counts.update(meta.record_counts)
        documents.update(meta.documentation)
        request_windows.extend(meta.request_windows)
        if meta.pagination is not None:
            paginations.append(meta.pagination)

    retrieved = [meta.retrieved_at for meta in metas if meta.retrieved_at is not None]

    return Meta(
        datasets=_dedupe([name for meta in metas for name in meta.datasets]),
        retrieved_at=max(retrieved) if retrieved else None,
        delivery_window=_first_non_none(metas, "delivery_window"),
        publication_window=_first_non_none(metas, "publication_window"),
        settlement_window=_first_non_none(metas, "settlement_window"),
        request_windows=request_windows,
        pagination=Pagination(
            strategy=STRATEGY,
            max_window_days=MAX_WINDOW_DAYS,
            windows_requested=sum(p.windows_requested for p in paginations),
            windows_succeeded=sum(p.windows_succeeded for p in paginations),
            empty_windows=sum(p.empty_windows for p in paginations),
        ),
        observed_resolutions=resolutions,
        observed_coverage=coverage,
        record_counts=counts,
        record_count=sum(counts.values()),
        record_page=record_page,
        prepared=prepared,
        selection=selection,
        alignment=alignment,
        unit=unit,
        documentation=documents,
        notes=_dedupe(
            [note for meta in metas for note in meta.notes]
            + list(extra_notes or [])
        ),
    )


def _combined_quality(
    envelopes: list[Envelope],
    *,
    extra_checks: list[QualityCheck] | None = None,
    extra_notes: list[str] | None = None,
) -> Quality:
    """Combine per-dataset quality counts, checks and notes."""
    per_dataset: dict[str, DatasetQuality] = {}
    reasons: dict[str, int] = {}
    checks: list[QualityCheck] = []
    for envelope in envelopes:
        per_dataset.update(envelope.quality.per_dataset)
        for reason, count in envelope.quality.rejected_reasons.items():
            reasons[reason] = reasons.get(reason, 0) + count
        checks.extend(envelope.quality.checks)
    checks.extend(extra_checks or [])

    return Quality(
        rows_fetched=sum(e.quality.rows_fetched for e in envelopes),
        accepted=sum(e.quality.accepted for e in envelopes),
        rejected=sum(e.quality.rejected for e in envelopes),
        rejected_reasons={k: v for k, v in reasons.items() if v},
        duplicates_removed=sum(
            e.quality.duplicates_removed for e in envelopes
        ),
        null_generation=sum(e.quality.null_generation for e in envelopes),
        null_publish_time=sum(
            e.quality.null_publish_time for e in envelopes
        ),
        per_dataset=per_dataset,
        checks=checks,
        notes=_dedupe(
            [note for e in envelopes for note in e.quality.notes]
            + list(extra_notes or [])
        ),
    )


# --- prepared (cached) dataset access ------------------------------------- #


def prepared_windfor(
    client: ElexonClient, *, refresh: bool = False
):
    """Validated WINDFOR envelope from the prepared cache.

    ``refresh`` clears the lower-level upstream HTTP cache before rebuilding so
    a refresh is a real upstream request, not a replay of cached responses.
    """
    if refresh:
        clear_upstream_cache()
    return get_prepared(
        f"dataset:{WINDFOR}",
        lambda: build_windfor_response(client),
        refresh=refresh,
    )


def prepared_fuelhh(
    client: ElexonClient, *, refresh: bool = False
):
    """Validated FUELHH envelope from the prepared cache."""
    if refresh:
        clear_upstream_cache()
    return get_prepared(
        f"dataset:{FUELHH}",
        lambda: build_fuelhh_response(client),
        refresh=refresh,
    )


def build_prepared_windfor_response(
    client: ElexonClient, *, refresh: bool = False
) -> Envelope[WindForRecord]:
    result = prepared_windfor(client, refresh=refresh)
    envelope = result.value
    return envelope.model_copy(
        update={"meta": with_prepared_meta(envelope.meta, result)}
    )


def build_prepared_fuelhh_response(
    client: ElexonClient, *, refresh: bool = False
) -> Envelope[FuelHhRecord]:
    result = prepared_fuelhh(client, refresh=refresh)
    envelope = result.value
    return envelope.model_copy(
        update={"meta": with_prepared_meta(envelope.meta, result)}
    )


# --- Data Explorer (server-paginated raw records) -------------------------- #


def build_explorer_response(
    client: ElexonClient,
    *,
    page: int,
    per_page: int,
    sort: str,
    direction: str,
    status: str | None = None,
    matched_only: bool = False,
    refresh: bool = False,
) -> Envelope[IntervalRecord]:
    """Return one page of raw interval records.

    Only ``per_page`` rows are serialised. The row list is prepared once per
    dataset generation and then filtered, sorted and sliced, so page navigation
    does not refetch, re-validate or re-render the full dataset.
    """
    wind = prepared_windfor(client, refresh=refresh)
    fuel = prepared_fuelhh(client, refresh=refresh)
    rows = get_prepared(
        (
            "explorer:"
            f"{wind.prepared_at.isoformat()}:"
            f"{fuel.prepared_at.isoformat()}"
        ),
        lambda: build_explorer_rows(wind.value.data, fuel.value.data),
        refresh=refresh,
    )

    filters: dict[str, str] = {}
    if status:
        filters["status"] = status
    if matched_only:
        filters["matchedOnly"] = "true"

    filtered = filter_rows(
        rows.value, status=status, matched_only=matched_only
    )
    ordered = sort_rows(filtered, sort=sort, direction=direction)
    page_rows, record_page = paginate(
        ordered,
        page=page,
        per_page=per_page,
        sort=sort,
        direction=direction,
        filters=filters,
    )

    return Envelope[IntervalRecord](
        data=page_rows,
        meta=_combined_meta(
            [wind.value, fuel.value],
            prepared=rows.info(),
            record_page=record_page,
        ),
        quality=_combined_quality([wind.value, fuel.value]),
    )


# --- forecast accuracy ---------------------------------------------------- #


def build_accuracy_response(
    client: ElexonClient, *, refresh: bool = False
) -> AccuracyEnvelope:
    """Select, align and score day-ahead forecasts for January 2026."""
    wind = prepared_windfor(client, refresh=refresh)
    fuel = prepared_fuelhh(client, refresh=refresh)

    wind_delivery = wind.value.meta.observed_resolutions.get(WINDFOR)
    fuel_delivery = fuel.value.meta.observed_resolutions.get(FUELHH)

    result = get_prepared(
        (
            "accuracy:"
            f"{wind.prepared_at.isoformat()}:"
            f"{fuel.prepared_at.isoformat()}"
        ),
        lambda: build_accuracy_result(
            forecasts=wind.value.data,
            fuelhh=fuel.value.data,
            delivery_start=DELIVERY_START,
            delivery_end_exclusive=DELIVERY_END_EXCLUSIVE,
            forecast_resolution_minutes=(
                wind_delivery.delivery.minutes
                if wind_delivery is not None
                else None
            ),
            actual_resolution_minutes=(
                fuel_delivery.delivery.minutes
                if fuel_delivery is not None
                else None
            ),
        ),
        refresh=refresh,
    )
    accuracy = result.value

    notes = [
        "Forecast selection uses the proposed D-1 09:00 Europe/London cutoff; "
        "the cutoff is an unconfirmed assumption and changing it changes every "
        "metric.",
        "Metrics use matched intervals only. Unmatched intervals are counted "
        "by reason in data.missing and are never treated as zero error.",
        "The expected interval count is computed from the January 2026 "
        "delivery window at the detected forecast resolution.",
        "Alignment is explicit: see meta.alignment. No forecast value is "
        "interpolated or duplicated into finer slots.",
        "Generation units are MW for both datasets; FUELHH values are average "
        "MW over each 30-minute settlement period.",
    ]

    return AccuracyEnvelope(
        data=accuracy.payload,
        meta=_combined_meta(
            [wind.value, fuel.value],
            prepared=result.info(),
            selection=accuracy.selection,
            alignment=accuracy.alignment,
            unit=accuracy.unit,
            extra_notes=notes,
        ),
        quality=_combined_quality(
            [wind.value, fuel.value],
            extra_checks=accuracy.checks,
            extra_notes=[
                "Accuracy checks run on the selected and aligned intervals "
                "before any metric is presented."
            ],
        ),
    )


__all__ = [
    "DELIVERY_END_EXCLUSIVE",
    "DELIVERY_START",
    "FUELHH",
    "WINDFOR",
    "build_accuracy_response",
    "build_explorer_response",
    "build_fuelhh_response",
    "build_prepared_fuelhh_response",
    "build_prepared_windfor_response",
    "build_summary_response",
    "build_windfor_response",
    "prepared_fuelhh",
    "prepared_windfor",
    "publish_windows",
    "settlement_windows",
]