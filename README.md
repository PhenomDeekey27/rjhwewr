# Wind Forecast Accuracy Dashboard

A full-stack dashboard for comparing Great Britain (GB) wind generation forecasts from Elexon WINDFOR with actual wind generation reported through FUELHH for **January 2026**.

The dashboard provides an overview of forecast accuracy, daily analysis, a paginated raw-data explorer, and a methodology page describing the assumptions behind the calculations.

**Live app:** https://rjhwewr.vercel.app/  
**Backend API:** https://wind-forecast-accuracy-api.onrender.com  
**API health check:** https://wind-forecast-accuracy-api.onrender.com/api/health

> The frontend and backend are deployed separately. If the dashboard reports that the API is unavailable, check the production environment variables and CORS configuration described below.

## Features

- Overview of January 2026 forecast accuracy.
- Forecast analysis with MAE, RMSE, bias, and matched coverage.
- Paginated data explorer for WINDFOR forecast records and FUELHH actuals.
- Data-quality metadata and explicit handling of missing intervals.
- Methodology and assumptions documented in the application.
- FastAPI backend with read-only API endpoints.
- Docker support for running the backend.

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Python, FastAPI, Uvicorn
- **Data source:** Elexon Insights API
- **Testing:** Vitest, pytest
- **Deployment:** Vercel (frontend), Render (backend), Docker (backend container)

## Data and methodology

The application uses national GB data for January 2026:

- **WINDFOR:** wind generation forecasts.
- **FUELHH:** actual wind generation outturn, filtered to `fuelType = WIND`.

### Forecast selection

For each January 2026 delivery interval, the application selects the latest WINDFOR publication with a `publishTime` at or before **D-1 09:00 Europe/London**. This cutoff is a proposed business assumption, not a confirmed market rule. The dashboard identifies it as an assumption.

### Time alignment

WINDFOR records are hourly in this dataset, while FUELHH records are half-hourly. Each hourly forecast is compared with the time-weighted mean of the two half-hourly actuals covering that hour. An interval is matched only when all required actual values are present and non-null. Missing values are not interpolated or silently filled.

### Metrics

For each matched interval, error is defined as:

`e = forecast − actual`

- **MAE:** mean absolute error.
- **RMSE:** root mean squared error.
- **Bias:** mean signed error; positive values indicate over-forecasting.
- **Matched coverage:** matched intervals divided by expected intervals.

Generation is reported in **MW**. These metrics describe forecast error; they do not directly quantify financial impact.

The January 2026 snapshot recorded in the project documentation contains 744 matched hourly intervals, with MAE of approximately 2,142 MW, RMSE of approximately 2,612 MW, bias of approximately +1,852 MW, and 100% matched coverage. Results may change if the upstream data or selection assumptions change.

## Project structure

```text
.
├── app/                 # Next.js frontend
├── backend/             # FastAPI backend
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── main.py
│   └── requirements.txt
├── .env.example
├── package.json
└── README.md
```

## Requirements

- Node.js 20 or later and npm
- Python 3.13 or a compatible version supported by `backend/requirements.txt`
- Docker Desktop (optional, for containerized backend use)

## Local development

### 1. Configure environment variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

On Windows, you can copy the file in File Explorer or run:

```powershell
Copy-Item .env.example .env
```

Use these values for local development:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:3000
```

Keep `.env` local and do not commit secrets. The Elexon Insights API used by this project is public and does not require an API key.

### 2. Start the backend

In a terminal:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

For macOS/Linux, activate the environment with:

```bash
source .venv/bin/activate
```

The backend health endpoint should respond at http://localhost:8000/api/health.

### 3. Start the frontend

In a second terminal, from the repository root:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## API endpoints

The backend exposes read-only endpoints:

| Method and route | Purpose |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/elexon/windfor` | WINDFOR forecast records |
| `GET /api/elexon/fuelhh` | FUELHH actual wind generation |
| `GET /api/elexon/january-2026` | Dataset metadata and quality summary |
| `GET /api/elexon/explorer` | Paginated joined raw records |
| `GET /api/elexon/forecast-accuracy` | Forecast selection, alignment, and accuracy metrics |

The explorer supports pagination and filtering through query parameters such as `page`, `perPage`, `sort`, `direction`, `status`, and `matchedOnly`. The backend returns data with metadata and data-quality information. Upstream failures are reported as API errors rather than replaced with fabricated results.

## Run with Docker

The backend includes a Dockerfile.

From the repository root:

```bash
docker build -t wind-forecast-accuracy-backend ./backend
docker run --rm -p 8000:8000 -e PORT=8000 wind-forecast-accuracy-backend
```

Then verify the container:

```bash
curl http://localhost:8000/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Deployment configuration

The frontend is deployed on Vercel and the backend on Render.

### Vercel frontend

Set this environment variable in the Vercel project settings, then redeploy the frontend:

```env
NEXT_PUBLIC_API_BASE_URL=https://wind-forecast-accuracy-api.onrender.com
```

### Render backend

Set `CORS_ORIGINS` to the exact production frontend origin, for example:

```env
CORS_ORIGINS=https://rjhwewr.vercel.app
```

If you use a different Vercel production domain or custom domain, use that origin instead. Preserve any other required origins as comma-separated values. Render supplies the runtime `PORT`; the backend must listen on `0.0.0.0` and that port in production.

Do not set the frontend API URL to `localhost` in production. `localhost` refers to the visitor's own device, not the deployed backend.

## Tests and quality checks

Run frontend checks from the repository root:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Run backend tests:

```bash
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

The project documentation records 32 frontend tests and 73 backend tests passing at the time of the last verification. Run the commands above against the current checkout to confirm its state.

## Assumptions and limitations

- The D-1 09:00 Europe/London forecast publication cutoff is an unconfirmed business assumption.
- The analysis covers national GB wind generation for January 2026 only; it does not show regional differences.
- MAE, RMSE, and bias are expressed in MW and are not normalized by installed capacity.
- Forecast error metrics do not directly measure financial impact.
- FUELHH outturn data represents the retrieved snapshot and may be revised upstream.
- Accuracy thresholds have not been agreed, so the dashboard avoids pass/fail KPI status labels.
- CSV export is not provided; exporting only the currently visible page would misrepresent the full paginated dataset.

## AI assistance

AI tools (Freebuff/Codebuff) were used during development. The implementation, tests, and outputs were reviewed as part of the development process.
