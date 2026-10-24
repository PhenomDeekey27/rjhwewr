# Wind Forecast Accuracy Dashboard

Dashboard for a UK energy utility comparing Elexon WINDFOR wind forecasts against FUELHH actual wind generation, filtered to national (GB) data for January 2026 purchase decisions.

## Stack

- Frontend: Next.js 16, React 19, Tailwind CSS, App Router, TypeScript
- Backend: Python FastAPI

## Prerequisites

- Node.js 20+ and npm
- Python 3.13+

## Environment setup

```bash
cp .env.example .env
```

`.env` is gitignored — never commit it. Edit `.env` only if your backend runs on a different port.

## Frontend (http://localhost:3000)

```bash
npm run dev      # development server with Turbopack
npm run build    # production build
npm run start    # production server
npm run lint     # ESLint
npm test         # Vitest
```

## Backend (http://localhost:8000)

```bash
cd backend

# Windows (PowerShell)
.venv\Scripts\Activate.ps1

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
pip install -r requirements-dev.txt  # for tests
uvicorn main:app --reload
```

## Backend API

All endpoints are read-only and return `{"data", "meta", "quality"}`.

- `GET /api/health` — backend health check.
- `GET /api/elexon/windfor` — every raw WINDFOR forecast record whose delivery interval falls in January 2026, retrieved over the publication window that includes late-December 2025 publishes. Every publication version is preserved.
- `GET /api/elexon/fuelhh` — raw FUELHH outturn records filtered to `fuelType = WIND` for January 2026.
- `GET /api/elexon/january-2026` — compact metadata/quality summary for both datasets.
- `GET /api/elexon/explorer` — one server-paginated page of joined raw interval records. Query parameters: `page`, `perPage` (1–500; the UI offers 25/50/100), `sort` (`deliveryTime`, `forecastPublished`, `publicationLead`, `forecastMw`, `actualMw`, `errorMw`, `matchStatus`), `direction` (`asc`/`desc`), `status`, `matchedOnly`.
- `GET /api/elexon/forecast-accuracy` — day-ahead forecast selection, resolution alignment and MAE/RMSE/bias/coverage for January 2026.

Every endpoint accepts `?refresh=true`, which bypasses both the prepared-result cache and the upstream HTTP cache and rebuilds from Elexon. Upstream failures return HTTP 502 or 504 with the same envelope shape and `meta.error`.

### Data Explorer performance

The raw joined set is 18,848 rows (18,104 WINDFOR publication versions plus 744 FUELHH-only half-hours). It is never sent to the browser in full:

- The backend builds and validates the prepared rows once, keeps them in a lock-protected in-process cache (default TTL 600 s, `PREPARED_CACHE_TTL_SECONDS`), and slices the requested page after filtering and sorting. Concurrent cold requests share one build.
- The client requests exactly one page and cancels the previous request when the user changes page, filter, sort or page size. Loading, empty, stale and error states are explicit: a refresh shows a loading table, and a failed request keeps the last good page visible but marks it as not current rather than pretending it loaded.
- Measured on 24 October 2026 with the prepared cache warm: downloading both raw datasets costs 2,319,821 bytes, while a 50-row explorer page is 20,811 bytes (99.1% less) and a 100-row page is 32,559 bytes. Explorer responses took 14–27 ms; browser page changes took 61–77 ms with no long tasks. A forced rebuild from Elexon took 6.4 s and is shown as a loading state rather than freezing the page.
- The previous Data Explorer implementation downloaded both datasets, rebuilt and sorted ~19,000 rows with an O(n²) orphan scan on every page/filter change, and re-rendered the table; it was not re-benchmarked after replacement, so the speed figures above describe the current implementation, not a same-build before/after comparison.

## Forecast methodology

All metrics are computed in the backend from the same prepared snapshot the pages display.

1. **Selection.** For every January 2026 delivery interval, keep the WINDFOR forecast with the latest `publishTime` at or before **D‑1 09:00 Europe/London**. The cutoff is a proposed business assumption, not a confirmed rule; it is held in one place, labelled in the UI and listed in the methodology page's assumptions register. A later forecast is never used and missing intervals are never back-filled.
2. **Alignment.** WINDFOR is hourly and FUELHH is half-hourly in this window (both resolutions are detected from the data, not assumed). Each hourly forecast interval `[t, t + 60 min)` is compared with the time-weighted mean of the two FUELHH half-hours that exactly cover it. An interval is matched only when every required actual is present and non-null. There is no interpolation, no duplication of a forecast into finer slots and no partial-interval mean; excluded intervals are counted by reason.
3. **Metrics.** Over matched intervals, with `e = F − A`: `MAE = (1/n) Σ|e|`, `RMSE = √((1/n) Σe²)`, `bias = (1/n) Σe` (positive = over-forecast) and `coverage = n_matched / n_expected`. Metrics are `None` (shown as “—”) when `n = 0`; zero is never used as a stand-in for missing data.
4. **Units.** Both `generation` fields are power in **MW**, not energy in MWh. Elexon labels the peak wind forecast in MW, and FUELHH values are average MW over each settlement period. Units were verified on 24 October 2026 against Elexon's Insights API dataset documentation and the BMRA & SAA Interface Specification; see the methodology page for the full statement.

The current January 2026 snapshot has 744 hourly intervals, all 744 matched (1,488 of 1,488 half-hours): MAE 2,142 MW, RMSE 2,612 MW, bias +1,852 MW (over-forecast) and 100% coverage.

## Automated tests

Backend:

```bash
cd backend
.venv\Scripts\python -m pytest -q
```

73 tests pass. External Elexon requests are mocked with `httpx.MockTransport`; no test requires network access. Coverage includes fetching/pagination, validation and quality metadata, server-side explorer pagination and filters, forecast selection around the cutoff, half-hourly alignment, metric arithmetic, missing-data reasons and API error envelopes.

Frontend:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

32 Vitest tests pass (API query construction/caching and the paginated explorer table), and lint, typecheck and the production build pass.

## Live Elexon smoke test

A separate, non-automated smoke script is available:

```bash
cd backend
.venv\Scripts\python live_smoke_elexon.py
```

Results from a run on 2026-10-24:

- WINDFOR: 18,104 accepted records out of 28,616 fetched rows; 10,512 rows excluded as outside the January 2026 delivery window; 0 null generation values.
- WINDFOR observed delivery resolution: 60 minutes (744 distinct delivery timestamps).
- WINDFOR observed publication resolution: 120 minutes (272 distinct publish timestamps).
- WINDFOR delivery coverage: 2026-01-01 00:00 UTC to 2026-01-31 23:00 UTC.
- WINDFOR publication coverage: 2025-12-30 02:30 UTC to 2026-02-01 22:30 UTC.
- FUELHH: 1,488 accepted records out of 1,488 fetched rows; 0 rejected rows; 0 null generation values.
- FUELHH observed delivery resolution: 30 minutes (1,488 distinct delivery timestamps).
- FUELHH observed publication resolution: 1 minute (1,486 distinct publish timestamps).
- FUELHH delivery coverage: 2026-01-01 00:00 UTC to 2026-01-31 23:30 UTC.
- FUELHH records were restricted to `fuelType = WIND` and all accepted rows passed the fuel-type check.

## Remaining assumptions and limitations

- The D‑1 09:00 Europe/London cutoff is unconfirmed. Changing it changes which forecast is selected for every interval and therefore every metric.
- Accuracy thresholds are not agreed, so KPIs use a neutral status rather than pass/fail colouring.
- Results describe January 2026 national wind only. The national aggregate hides regional variation, MW metrics are not normalised by installed capacity, and error metrics do not capture financial impact.
- FUELHH is outturn-based; the dashboard reports the snapshot retrieved at load time and does not track later revisions.
- CSV export is disabled because the table is server-paginated; exporting only the visible page would misrepresent the dataset.

## Project stages

1. Stage 1: Project foundation — health endpoint, CORS, frontend connection state, `requirements.txt`, `.env.example`, README.
2. Stage 2: Backend fetching of Elexon WINDFOR and FUELHH data, pagination, validation, quality metadata and observed-resolution detection.
3. Stage 3: Forecast selection, resolution alignment and accuracy metrics, with automated tests.
4. **Stage 4 (current):** Dashboard UI — server-paginated Data Explorer, Forecast Analysis (daily results, charts, missing-data reporting), Overview summary and the methodology page.
5. Stage 5: Deployment (not started).

Real Elexon data is used throughout; mock data is not used for results.
