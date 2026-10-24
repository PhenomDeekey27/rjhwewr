"""FUELHH — Elexon half-hourly generation outturn (dataset service).

Retrieves raw outturn records via ``GET /datasets/FUELHH`` with
``settlementDateFrom``/``settlementDateTo`` covering January 2026 and the
server-side ``fuelType=WIND`` filter, then re-checks ``fuelType == "WIND"``
client-side so a misbehaving upstream can never leak other fuels into the
national wind actuals.

Rows are also scoped to delivery intervals inside the analysis window.
Null ``generation`` values are preserved as ``None`` (never zero-filled) and
counted in the quality block.
"""

from __future__ import annotations

from datetime import date, datetime

from services.elexon_client import ElexonClient
from services.fetch import (
    NON_WIND_FUEL_TYPE,
    OUTSIDE_DELIVERY_WINDOW,
    DatasetFetch,
    collect_records,
)
from services.models import FuelHhRecord

FUELHH = "FUELHH"
FUELHH_PATH = "/datasets/FUELHH"
WIND_FUEL_TYPE = "WIND"


def fuelhh_scope_check(
    delivery_start: datetime,
    delivery_end_exclusive: datetime,
    fuel_type: str = WIND_FUEL_TYPE,
):
    """Reject out-of-window deliveries and anything that is not wind."""

    def check(record: FuelHhRecord) -> str | None:
        if not (delivery_start <= record.startTime < delivery_end_exclusive):
            return OUTSIDE_DELIVERY_WINDOW
        if (record.fuelType or "").upper() != fuel_type.upper():
            return NON_WIND_FUEL_TYPE
        return None

    return check


def fetch_fuelhh(
    client: ElexonClient,
    *,
    settlement_windows: list[tuple[date, date]],
    delivery_start: datetime,
    delivery_end_exclusive: datetime,
) -> DatasetFetch:
    """Page through the settlement-date windows and return wind records only."""

    def params_for_window(window: tuple[date, date]) -> dict[str, object]:
        start, end_inclusive = window
        return {
            "settlementDateFrom": start.isoformat(),
            "settlementDateTo": end_inclusive.isoformat(),
            "fuelType": WIND_FUEL_TYPE,
            "format": "json",
        }

    return collect_records(
        dataset=FUELHH,
        path=FUELHH_PATH,
        client=client,
        windows=settlement_windows,
        params_for_window=params_for_window,
        record_model=FuelHhRecord,
        scope_check=fuelhh_scope_check(delivery_start, delivery_end_exclusive),
    )