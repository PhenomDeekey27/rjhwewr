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

## Backend API (Stage 2)

All endpoints are read-only and return `{"data", "meta", "quality"}`.

- `GET /api/health` — backend health check.
- `GET /api/elexon/windfor` — raw WINDFOR forecast records for January 2026 delivery intervals, retrieved over the publication window that includes late-December 2025 publishes.
- `GET /api/elexon/fuelhh` — raw FUELHH outturn records filtered to `fuelType = WIND` for January 2026.
- `GET /api/elexon/january-2026` — compact metadata/quality summary for both datasets.

Upstream failures return HTTP 502 or 504 with the same envelope shape and `meta.error`.

## Automated tests

Backend:

```bash
cd backend
.venv\Scripts\python -m pytest -q
```

The suite currently contains 30 tests and passes. External Elexon requests are mocked with `httpx.MockTransport`; no test requires network access.

Frontend:

```bash
npm run lint
npm run build
```

Both pass at the time of this update.

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
- No null or invalid generation values were observed in either dataset during this run.

Units are documented by Elexon as MW for both datasets. This smoke test observed integer generation values but did not independently verify units against the live OpenAPI specification; that remains open. No forecast selection, alignment, or accuracy metrics are implemented yet.

## Project stages

1. Stage 1: Project foundation — `GET /api/health`, CORS for `http://localhost:3000`, frontend connection/status indicator with loading, success, and error states, `requirements.txt`, `.env.example`, README.
2. **Stage 2 (current):** Backend fetching of Elexon WINDFOR forecasts and FUELHH actual generation (national wind data, January 2026), including pagination, validation, quality metadata, and observed resolution detection.
3. Stage 3: Forecast accuracy calculations.
4. Stage 4: Charts and dashboard UI.
5. Stage 5: Deployment.

Real Elexon data is used throughout; mock data is not used for results.