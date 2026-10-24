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
uvicorn main:app --reload
```

## Project stages

1. **Stage 1 (current):** Project foundation — `GET /api/health`, CORS for `http://localhost:3000`, frontend connection/status indicator with loading, success, and error states, `requirements.txt`, `.env.example`, README. No mock data.
2. Stage 2: Backend fetching of Elexon WINDFOR forecasts and FUELHH actual generation (national wind data, January 2026).
3. Stage 3: Forecast accuracy calculations.
4. Stage 4: Charts and dashboard UI.
5. Stage 5: Deployment.

Real Elexon data is used throughout; mock data is not used for results.
