"""Manual live smoke test for the Elexon WINDFOR and FUELHH endpoints.

This script is intentionally NOT part of the automated pytest suite. It makes
real network requests to Elexon and may take a while. Run with:

    python live_smoke_elexon.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from services.elexon_client import ElexonClient
from services.january_2026 import build_summary_response, build_windfor_response, build_fuelhh_response


def _print_envelope(name, envelope):
    print(f"\n=== {name} ===")
    print("records:", len(envelope.data))
    print("meta.datasets:", envelope.meta.datasets)
    print("retrieved_at:", envelope.meta.retrieved_at)
    print("delivery_window:", envelope.meta.delivery_window.start, "->", envelope.meta.delivery_window.end_exclusive)
    print("request_windows:", len(envelope.meta.request_windows))
    print("empty_windows:", envelope.meta.pagination.empty_windows if envelope.meta.pagination else None)
    print("observed_resolutions:", json.dumps(envelope.meta.observed_resolutions, default=str, indent=2))
    print("observed_coverage:", json.dumps(envelope.meta.observed_coverage, default=str, indent=2))
    print("quality.rows_fetched:", envelope.quality.rows_fetched)
    print("quality.accepted:", envelope.quality.accepted)
    print("quality.rejected:", envelope.quality.rejected)
    print("quality.rejected_reasons:", envelope.quality.rejected_reasons)
    print("quality.null_generation:", envelope.quality.null_generation)
    print("quality.null_publish_time:", envelope.quality.null_publish_time)
    print("quality.checks:", [(c.name, c.passed) for c in envelope.quality.checks])
    if envelope.data:
        print("first record:", envelope.data[0].model_dump(mode="json"))
        print("last record:", envelope.data[-1].model_dump(mode="json"))
    if envelope.meta.error:
        print("ERROR:", envelope.meta.error.model_dump())


def main():
    with ElexonClient() as client:
        windfor = build_windfor_response(client)
        fuelhh = build_fuelhh_response(client)
        summary = build_summary_response(client)

    _print_envelope("WINDFOR", windfor)
    _print_envelope("FUELHH", fuelhh)
    _print_envelope("JANUARY-2026 SUMMARY", summary)


if __name__ == "__main__":
    main()