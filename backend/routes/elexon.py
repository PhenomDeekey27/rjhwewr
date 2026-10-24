"""Read-only endpoints exposing raw January 2026 Elexon records (Stage 3).

Endpoints (all GET-only):

* ``GET /api/elexon/windfor`` — raw WINDFOR forecast records for delivery
  intervals in January 2026, retrieved over the publication window that
  covers early-January deliveries.
* ``GET /api/elexon/fuelhh`` — raw FUELHH outturn records filtered to
  ``fuelType = WIND`` for January 2026.
* ``GET /api/elexon/january-2026`` — compact metadata/quality summary of
  both datasets (``data`` holds one summary per dataset).

Every response — success or failure — uses the same envelope:
``{"data": [...], "meta": {...}, "quality": {...}}``.

Upstream failures never surface as raw stack traces: they become 502 (HTTP
error / bad payload) or 504 (timeout) with the same envelope shape and an
``meta.error`` object, so the UI can render its "Elexon <dataset> data
unavailable" state without guessing the body format.

Nothing here writes data, and no credentials are involved.
"""

from __future__ import annotations

from typing import Annotated, Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from services.elexon_client import ElexonApiError, ElexonClient, ElexonTimeoutError
from services.january_2026 import (
    build_fuelhh_response,
    build_summary_response,
    build_windfor_response,
)
from services.models import (
    DatasetSummary,
    Envelope,
    ErrorDetail,
    FuelHhRecord,
    Meta,
    Quality,
    WindForRecord,
)

router = APIRouter(prefix="/elexon", tags=["elexon"])


def get_elexon_client() -> Iterator[ElexonClient]:
    """One client per request; closed when the request finishes."""
    client = ElexonClient()
    try:
        yield client
    finally:
        client.close()


def _error_response(exc: ElexonApiError, dataset: str) -> JSONResponse:
    timeout = isinstance(exc, ElexonTimeoutError)
    status_code = 504 if timeout else 502
    error = ErrorDetail(
        type="timeout" if timeout else "upstreamError",
        message=f"Elexon {dataset} data unavailable: {exc.message}",
        status_code=status_code,
        upstream_status=exc.upstream_status,
        retryable=exc.retryable,
    )
    payload = Envelope[WindForRecord](
        data=[],
        meta=Meta(error=error),
        quality=Quality(
            notes=[
                "Upstream request failed; no records were retrieved, so no "
                "counts are reported as zero-data."
            ],
        ),
    ).model_dump(mode="json", by_alias=True)
    return JSONResponse(status_code=status_code, content=payload)


@router.get("/windfor", response_model=Envelope[WindForRecord])
def windfor_records(
    client: Annotated[ElexonClient, Depends(get_elexon_client)],
):
    """Raw WINDFOR forecast records with January 2026 delivery intervals."""
    try:
        return build_windfor_response(client)
    except ElexonApiError as exc:
        return _error_response(exc, "WINDFOR")


@router.get("/fuelhh", response_model=Envelope[FuelHhRecord])
def fuelhh_records(
    client: Annotated[ElexonClient, Depends(get_elexon_client)],
):
    """Raw FUELHH outturn records, filtered to fuelType = WIND."""
    try:
        return build_fuelhh_response(client)
    except ElexonApiError as exc:
        return _error_response(exc, "FUELHH")


@router.get("/january-2026", response_model=Envelope[DatasetSummary])
def january_2026_summary(
    client: Annotated[ElexonClient, Depends(get_elexon_client)],
):
    """Compact metadata/quality summary for both January 2026 datasets."""
    try:
        return build_summary_response(client)
    except ElexonApiError as exc:
        return _error_response(exc, "January 2026")