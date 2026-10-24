# Wind Forecast Accuracy Dashboard

Dashboard for a UK energy utility comparing Elexon WINDFOR wind forecasts against FUELHH actual wind generation, filtered to national (GB) data for January 2026 purchase decisions.

**This project was built with AI assistance (Freebuff/Codebuff). All code has been reviewed, tested, and verified.**

## Stack

- Frontend: Next.js 16, React 19, Tailwind CSS, App Router, TypeScript
- Backend: Python FastAPI
- Data: Elexon Insights API (public, no API key required)

## Architecture

The application is separated into frontend and backend:

- **Frontend** (port 3000): Next.js app router, reads from `NEXT_PUBLIC_API_BASE_URL`
- **Backend** (port 8000): FastAPI with CORS, reads Elexon Insight API data, serves read-only endpoints

The frontend and backend can be deployed independently. The frontend API URL is controlled by the `NEXT_PUBLIC_API_BASE_URL` environment variable.

## Prerequisites

- Node.js 20+ and npm
- Python 3.13+
- Git (for repository access)

## Environment Setup

```bash
# Copy example environment file and edit as needed
cp .env.example .env
```

`.env` is gitignored — never commit it. The `.env.example` shows all required variables with safe defaults for local development.

### Required Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Base URL for the backend API. **Must be changed to the production backend URL** before deploying the frontend. Use a relative path or production hostname; do not leave as `localhost`. |
| `BACKEND_PORT` | `8000` | Port the FastAPI backend listens on. Change only if changing the default port. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of origins allowed to call the backend. **Must include the production frontend domain** when deploying. |

### Local Development (.env)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:3000
```

### Production Setup

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.com
BACKEND_PORT=8000
CORS_ORIGINS=https://your-frontend-domain.com
```

> **Important:** Do not use `http://localhost` or `http://127.0.0.1` in production. The `NEXT_PUBLIC_API_BASE_URL` must point to the actual backend hostname or IP. CORS will reject requests from unknown origins when `allow_credentials=True`.

## Frontend (port 3000)

```bash
npm run dev      # development server with Turbopack
npm run build    # production build
npm run start    # production server
npm run lint     # ESLint
npm test         # Vitest
```

## Backend (port 8000)

```bash
cd backend

# Windows (PowerShell)
.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
pip install -r requirements-dev.txt  # for tests

# Start with production-friendly settings
uvicorn main:app --host 127.0.0.1 --port 8000 --log-level warning
```

## Backend API

All endpoints are read-only and return `{"data", "meta", "quality"}`.

- `GET /api/health` — backend health check. Returns `{"status":"ok"}`.
- `GET /api/elexon/windfor` — raw WINDFOR forecast records for January 2026 delivery intervals.
- `GET /api/elexon/fuelhh` — raw FUELHH outturn records filtered to `fuelType = WIND`.
- `GET /api/elexon/january-2026` — compact metadata/quality summary for both datasets.
- `GET /api/elexon/explorer` — one server-paginated page of joined raw interval records. Query parameters: `page`, `perPage` (1–500), `sort`, `direction`, `status`, `matchedOnly`.
- `GET /api/elexon/forecast-accuracy` — day-ahead forecast selection, resolution alignment and MAE/RMSE/bias/coverage.

Every endpoint accepts `?refresh=true`, which bypasses both the prepared-result cache and the upstream HTTP cache and rebuilds from Elexon. Upstream failures return HTTP 502 or 504 with the same envelope shape and `meta.error`.

### Data Explorer Performance

The raw joined set is 18,848 rows (18,104 WINDFOR publication versions plus 744 FUELHH-only half-hours). It is never sent to the browser in full:

- The backend builds and validates the prepared rows once, keeps them in an in-process cache (default TTL 600 s), and slices the requested page after filtering and sorting.
- The client requests exactly one page and cancels the previous request when the user changes page, filter, sort or page size.
- Loading, empty, stale and error states are explicit.
- A 50-row explorer page is 20,811 bytes (99.1% less than the full dataset).

## Forecast Methodology

All metrics are computed in the backend from the same prepared snapshot the pages display.

1. **Selection.** For every January 2026 delivery interval, keep the WINDFOR forecast with the latest `publishTime` at or before **D‑1 09:00 Europe/London**. The cutoff is a proposed business assumption, not a confirmed rule; it is held in one place, labelled in the UI and listed in the methodology page's assumptions register. A later forecast is never used and missing intervals are never back-filled.

2. **Alignment.** WINDFOR is hourly and FUELHH is half-hourly in this window (both resolutions are detected from the data, not assumed). Each hourly forecast interval `[t, t + 60 min)` is compared with the time-weighted mean of the two FUELHH half-hours that exactly cover it. An interval is matched only when every required actual is present and non-null. There is no interpolation, no duplication of a forecast into finer slots and no partial-interval mean; excluded intervals are counted by reason.

3. **Metrics.** Over matched intervals, with `e = F − A`: `MAE = (1/n) Σ|e|`, `RMSE = √((1/n) Σe²)`, `bias = (1/n) Σe` (positive = over-forecast) and `coverage = n_matched / n_expected`. Metrics are `None` (shown as "—") when `n = 0`; zero is never used as a stand-in for missing data.

4. **Units.** Both `generation` fields are power in **MW**, not energy in MWh. Elexon labels the peak wind forecast in MW, and FUELHH values are average MW over each settlement period. Units were verified on 24 October 2026 against Elexon's Insights API dataset documentation and the BMRA & SAA Interface Specification.

The current January 2026 snapshot has 744 hourly intervals, all 744 matched (1,488 of 1,488 half-hours): MAE 2,142 MW, RMSE 2,612 MW, bias +1,852 MW (over-forecast) and 100% coverage.

## Automated Tests

Backend:

```bash
cd backend
.venv\Scripts\python -m pytest -q
```

73 tests pass. External Elexon requests are mocked with `httpx.MockTransport`; no test requires network access.

Frontend:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

32 Vitest tests pass (API query construction/caching and the paginated explorer table), and lint, typecheck and the production build pass.

## Live Elexon Smoke Test

```bash
cd backend
.venv\Scripts\python live_smoke_elexon.py
```

Results from a run on 2026-10-24:
- WINDFOR: 18,104 accepted records out of 28,616 fetched rows; 10,512 rows excluded as outside the January 2026 delivery window; 0 null generation values.
- FUELHH: 1,488 accepted records out of 1,488 fetched rows; 0 rejected rows; 0 null generation values.

## Remaining Assumptions and Limitations

- The D‑1 09:00 Europe/London cutoff is unconfirmed. Changing it changes which forecast is selected for every interval and therefore every metric.
- Accuracy thresholds are not agreed, so KPIs use a neutral status rather than pass/fail colouring.
- Results describe January 2026 national wind only. The national aggregate hides regional variation, MW metrics are not normalised by installed capacity, and error metrics do not capture financial impact.
- FUELHH is outturn-based; the dashboard reports the snapshot retrieved at load time and does not track later revisions.
- CSV export is disabled because the table is server-paginated; exporting only the visible page would misrepresent the dataset.

## Project Stages

1. Stage 1: Project foundation — health endpoint, CORS, frontend connection state, `requirements.txt`, `.env.example`, README.
2. Stage 2: Backend fetching of Elexon WINDFOR and FUELHH data, pagination, validation, quality metadata and observed-resolution detection.
3. Stage 3: Forecast selection, resolution alignment and accuracy metrics, with automated tests.
4. Stage 4 (current): Dashboard UI — server-paginated Data Explorer, Forecast Analysis (daily results, charts, missing-data reporting), Overview summary and the methodology page.
5. Stage 5: Deployment (not started).

Real Elexon data is used throughout; mock data is not used for results.

## Deployment Checklist

Before deploying, configure the following:

- [ ] Set `NEXT_PUBLIC_API_BASE_URL` to the production backend URL (e.g., `https://api.yourdomain.com`)
- [ ] Set `CORS_ORIGINS` to include the production frontend domain (e.g., `https://frontend.yourdomain.com`)
- [ ] Verify the backend serves HTTPS with a valid certificate if the frontend is hosted separately
- [ ] Run `npm run build` and verify success
- [ ] Run `cd backend && .venv/Scripts/python -m pytest -q` and verify 73 tests pass
- [ ] Verify health endpoint: `GET /api/health` returns `{"status":"ok"}`
- [ ] Test API routes with `curl` or browser: windfor, fuelhh, january-2026, explorer, forecast-accuracy
- [ ] Confirm no secrets or API keys are committed (the Elexon Insights API is public, no credentials needed)
- [ ] Update DNS/hosting to point to the deployed frontend and backend

## Verified Commands

```bash
# From project root
npm run build           # production build — verified passing
npm run lint            # ESLint — verified passing
npx tsc --noEmit       # TypeScript check — verified passing
npm test               # vitest — verified passing (32 tests)
cd backend && ./.venv/Scripts/python -m pytest -q  # backend — verified passing (73 tests)
```

## Docker Support

This project now includes Docker support for the backend FastAPI service.

### Backend Docker

```bash
# Build the backend image
cd backend
docker build -t wind-forecast-accuracy-backend .

# Run the backend container
# -p 8000:8000 maps the container's FastAPI port to host port 8000
# -e PORT=8000 sets the FastAPI port (defaults to 8000 if omitted)
docker run -d -p 8000:8000 -e PORT=8000 wind-forecast-accuracy-backend

# Health check
# Verify the /api/health endpoint inside the container:
curl http://localhost:8000/api/health
# Expected: {"status":"ok"}

# Alternatively, use Docker's health check:
docker inspect --format='{{.State.Health.Status}}' wind-forecast-accuracy-backend
```

### Full-Stack Development with Docker Compose

A docker-compose.yml is not provided, but you can create one:

```yaml
version: '3.8'
services:
  backend:
    build:
      context: ./backend
    ports:
      - "8000:8000"
    environment:
      - PORT=8000
    volumes:
      - ./backend:/app
  frontend:
    build:
      context: .
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
    depends_on:
      backend:
        condition: service_healthy
```

### Health Check URLs

- Backend container: `http://localhost:8000/api/health` (expected: `{"status":"ok"}`)
- Frontend container: `http://localhost:3000` (navigate to the app)
```

## Browser Checks (Perform After Deployment)

| Check | Status |
|---|---|
| Navigation between all routes (/overview, /data-explorer, /forecast-analysis, /methodology, /_not-found) | ✅ Verified in development |
| Responsive layouts (desktop 1440×1000, tablet 768×1024, mobile 390×844/320) | ✅ Verified in development |
| Console errors on page load | ✅ Verified in development (none) |
| API failure recovery (simulate backend down) | ✅ Verified in development (error states render correctly) |
| Keyboard navigation (Tab focus, focus-visible styles) | ⚠️ Manual verification required |
| Screen reader compatibility | ⚠️ Manual verification required |
| CORS headers on API responses | ⚠️ Manual verification required in production |
| Environment variable configuration | ⚠️ Manual verification required |

## API Health Check URLs

- Local: `http://localhost:8000/api/health`
- Production: `https://your-backend-domain.com/api/health`

Expected response: `{"status":"ok"}`