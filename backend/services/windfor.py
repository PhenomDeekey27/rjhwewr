"""WINDFOR — Elexon wind generation forecast (dataset service).

Retrieves raw forecast records via ``GET /datasets/WINDFOR`` filtered by
``publishDateTimeFrom``/``publishDateTimeTo`` (the only way to retrieve
historical publishes; see ``services.elexon_client`` for the verified
parameter list). Records are then scoped to delivery intervals inside the
analysis window, which keeps the wide publication window needed for
early-January deliveries without leaking out-of-scope deliveries into the
payload.

The service performs **no** forecast selection, alignment or scoring: every
eligible raw record is returned with its source ``publishTime`` and
``startTime`` untouched.
"""

from __future__ import annotations

from datetime import datetime

from services.elexon_client import ElexonClient, iso_z
from services.fetch import (
    OUTSIDE_DELIVERY_WINDOW,
    DatasetFetch,
    collect_records,
)
from services.models import WindForRecord

WINDFOR = "WINDFOR"
WINDFOR_PATH = "/datasets/WINDFOR"


def windfor_scope_check(
    delivery_start: datetime, delivery_end_exclusive: datetime
):
    """Keep only records whose delivery interval starts inside the window."""

    def check(record: WindForRecord) -> str | None:
        if delivery_start <= record.startTime < delivery_end_exclusive:
            return None
        return OUTSIDE_DELIVERY_WINDOW

    return check


def fetch_windfor(
    client: ElexonClient,
    *,
    publish_windows: list[tuple[datetime, datetime]],
    delivery_start: datetime,
    delivery_end_exclusive: datetime,
) -> DatasetFetch:
    """Page through the publication window and return validated records."""

    def params_for_window(
        window: tuple[datetime, datetime],
    ) -> dict[str, object]:
        start, end_inclusive = window
        return {
            "publishDateTimeFrom": iso_z(start),
            "publishDateTimeTo": iso_z(end_inclusive),
            "format": "json",
        }

    return collect_records(
        dataset=WINDFOR,
        path=WINDFOR_PATH,
        client=client,
        windows=publish_windows,
        params_for_window=params_for_window,
        record_model=WindForRecord,
        scope_check=windfor_scope_check(delivery_start, delivery_end_exclusive),
    )
