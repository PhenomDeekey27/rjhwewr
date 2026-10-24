"""Read-only endpoints exposing January 2026 Elexon records and accuracy.

Endpoints (all GET-only):

* ``GET /api/elexon/windfor`` — raw WINDFOR forecast records for delivery
  intervals in January 2026, retrieved over the publication window that
  covers early-January deliveries. Every publication version is returned.
* ``GET /api/elexon/fuelhh`` — raw FUELHH outturn records filtered to
  ``fuelType = WIND`` for January 2026.
* ``GET /api/elexon/january-2026`` — compact metadata/quality summary of
  both datasets (``data`` holds one summary per dataset).
* ``GET /api/elexon/explorer`` — one server-paginated page of raw interval
  records. It never downloads the full ~19,000-row set to the browser.
* ``GET /api/elexon/forecast-accuracy`` — day-ahead forecast selection,
  resolution alignment and MAE/RMSE/bias/coverage over matched intervals.

Every response — success or failure — uses the same envelope shape:
``{"data": ..., "meta": {...}, "quality": {...}}`` (``data`` is a list except
for the accuracy payload, which is one computed object).

The two raw dataset responses and the derived explorer/accuracy results are
prepared once and cached in-process; ``?refresh=true`` bypasses that cache and
the upstream HTTP cache and rebuilds from Elexon.

Upstream failures never surface as raw stack traces: they become 502 (HTTP
error / bad payload) or 504 (timeout) with the same envelope shape and an
``meta.error`` object, so the UI can render its "Elexon <dataset> data
unavailable" state without guessing the body format.

Nothing here writes data, and no credentials are involved.
"""

from __future__ import annotations

from typing import Annotated, Iterator, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from services.elexon_client import ElexonApiError, ElexonClient, ElexonTimeoutError
from services.january_2026 import (
    build_accuracy_response,
    build_explorer_response,
    build_prepared_fuelhh_response,
    build_prepared_windfor_response,
    build_summary_response,
)
from services.models import (
    AccuracyEnvelope,
    AccuracyPayload,
    AccuracySummary,
    DatasetSummary,
    Envelope,
    ErrorDetail,
    FuelHhRecord,
    IntervalRecord,
    Meta,
    Quality,
    WindForRecord,
)

router = APIRouter(prefix="/elexon", tags=["elexon"])

ExplorerSort = Literal[
    "deliveryTime",
    "forecastPublished",
    "publicationLead",
    "forecastMw",
    "actualMw",
    "errorMw",
    "matchStatus",
]


def get_elexon_client() -> Iterator[ElexonClient]:
    """One client per request; closed when the request finishes."""
    client = ElexonClient()
    try:
        yield client
    finally:
        client.close()


def _error_detail(exc: ElexonApiError, dataset: str) -> tuple[ErrorDetail, int]:
    timeout = isinstance(exc, ElexonTimeoutError)
    status_code = 504 if timeout else 502
    return (
        ErrorDetail(
            type="timeout" if timeout else "upstreamError",
            message=f"Elexon {dataset} data unavailable: {exc.message}",
            status_code=status_code,
            upstream_status=exc.upstream_status,
            retryable=exc.retryable,
        ),
        status_code,
    )


def _error_response(
    exc: ElexonApiError, dataset: str, *, data: object
) -> JSONResponse:
    error, status_code = _error_detail(exc, dataset)
    payload = {
        "data": data,
        "meta": Meta(error=error).model_dump(mode="json", by_alias=True),
        "quality": Quality(
            notes=[
                "Upstream request failed; no records were retrieved, so no "
                "counts are reported as zero-data."
            ]
        ).model_dump(mode="json", by_alias=True),
    }
    return JSONResponse(status_code=status_code, content=payload)


@router.get("/windfor", response_model=Envelope[WindForRecord])
def windfor_records(
    client: Annotated[ElexonClient, Depends(get_elexon_client)],
    refresh: bool = Query(
        False,
        description=(
            "Bypass the prepared and upstream caches and rebuild from Elexon."
        ),
    ),
):
    """Raw WINDFOR forecast records with January 2026 delivery intervals."""
    try:
        return build_prepared_windfor_response(client, refresh=refresh)
    except ElexonApiError as exc:
        return _error_response(exc, "WINDFOR", data=[])


@router.get("/fuelhh", response_model=Envelope[FuelHhRecord])
def fuelhh_records(
    client: Annotated[ElexonClient, Depends(get_elexon_client)],
    refresh: bool = Query(False),
):
    """Raw FUELHH outturn records, filtered to fuelType = WIND."""
    try:
        return build_prepared_fuelhh_response(client, refresh=refresh)
    except ElexonApiError as exc:
        return _error_response(exc, "FUELHH", data=[])


@router.get("/january-2026", response_model=Envelope[DatasetSummary])
def january_2026_summary(
    client: Annotated[ElexonClient, Depends(get_elexon_client)],
):
    """Compact metadata/quality summary for both January 2026 datasets."""
    try:
        return build_summary_response(client)
    except ElexonApiError as exc:
        return _error_response(exc, "January 2026", data=[])


@router.get("/explorer", response_model=Envelope[IntervalRecord])
def explorer_records(
    client: Annotated[ElexonClient, Depends(get_elexon_client)],
    page: int = Query(1, ge=1, description="1-based page number."),
    perPage: int = Query(
        50,
        ge=1,
        le=500,
        description="Rows per page. The UI offers 25, 50 and 100.",
    ),
    sort: ExplorerSort = Query("deliveryTime"),
    direction: Literal["asc", "desc"] = Query("asc"),
    status: str | None = Query(
        None,
        description=(
            "Exact raw match-status filter: Matched / Source data only / "
            "No eligible forecast / No actual / Invalid."
        ),
    ),
    matchedOnly: bool = Query(
        False,
        description="Keep only rows with both a forecast and an actual value.",
    ),
    refresh: bool = Query(False),
):
    """One page of raw interval records, joined and paginated server-side."""
    try:
        return build_explorer_response(
            client,
            page=page,
            per_page=perPage,
            sort=sort,
            direction=direction,
            status=status,
            matched_only=matchedOnly,
            refresh=refresh,
        )
    except ElexonApiError as exc:
        return _error_response(exc, "January 2026", data=[])


@router.get("/forecast-accuracy", response_model=AccuracyEnvelope)
def forecast_accuracy(
    client: Annotated[ElexonClient, Depends(get_elexon_client)],
    refresh: bool = Query(False),
):
    """Day-ahead forecast selection, alignment and accuracy metrics."""
    try:
        return build_accuracy_response(client, refresh=refresh)
    except ElexonApiError as exc:
        return _error_response(
            exc,
            "January 2026",
            data=AccuracyPayload(summary=AccuracySummary()).model_dump(
                mode="json", by_alias=True
            ),
        )
