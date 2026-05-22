# WT32 CT Control Prototype

WT32 is a CT scanner control-console prototype for product and UI validation. It is not clinical software and must not be used for diagnosis, treatment, real device control, dose commitment, or safety assurance.

The app simulates a 1024 x 768 touch-console workflow:

- Patient registration and lookup
- Protocol catalog and protocol parameter editing
- Scout, helical, axial, gated, and 4D scan flows
- Scan session snapshots cloned from protocol templates
- DICOM image viewing with Cornerstone3D
- Service-mode screens such as tube warmup, daily QA, disk management, battery management, performance evaluation, and QA reports

## Quick Start

### Requirements

- Python 3.13+ recommended
- Node.js 18+
- Windows PowerShell or Command Prompt

Python 3.14 works locally if Pydantic is installed with a Python 3.14 compatible version. The pinned project dependency is still documented in `backend/requirements.txt`.

### Install Backend

```powershell
cd C:\STN\projects\WT32
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

If Python 3.14 cannot build `pydantic-core`, use:

```powershell
.\.venv\Scripts\python.exe -m pip install fastapi==0.115.12 "pydantic>=2.12,<3" "uvicorn[standard]==0.34.0" sqlalchemy==2.0.39
```

### Install Frontend

```powershell
cd C:\STN\projects\WT32\ui-review
npm.cmd ci
```

Use `npm.cmd` on Windows when PowerShell blocks `npm.ps1`.

### Run

Open two terminals.

Backend:

```powershell
cd C:\STN\projects\WT32
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

Frontend:

```powershell
cd C:\STN\projects\WT32\ui-review
npm.cmd run dev
```

URLs:

- Frontend: <http://localhost:5175>
- Backend health check: <http://localhost:8000>
- API docs: <http://localhost:8000/docs>

## Tech Stack

| Layer | Stack |
| --- | --- |
| Backend | FastAPI 0.115.12, Uvicorn 0.34.0 |
| Database | SQLite, SQLAlchemy 2.0.39 |
| Schemas | Pydantic 2.11.2 |
| Frontend | React 19.2.0, TypeScript 5.9.3, Vite 7.3.1 |
| Styling | Tailwind CSS 3.4.17 |
| Routing | React Router DOM 7.13.2 |
| Icons | Lucide React |
| Local browser storage | Dexie / IndexedDB, localStorage |
| DICOM | Cornerstone3D, dicom-parser |

## Architecture

```text
ui-review (React)
  - Routes and 1024 x 768 console shell
  - localStorage scan workflow state
  - Dexie protocol snapshot cache
  - REST and WebSocket calls

backend (FastAPI)
  - REST APIs for patients, protocols, scan params, scan sessions, service data
  - WebSocket scan event simulation
  - SQLAlchemy models
  - SQLite database and seed protocols
```

The backend separates two domains:

- Protocol templates: reusable protocol definitions and scan parameters.
- Scan sessions: per-exam snapshots cloned from a protocol. Session edits do not modify the original template.

## Repository Layout

```text
backend/
  main.py                 FastAPI entrypoint, CORS, routes, static mounts
  database.py             SQLite engine, sessions, seed data
  models.py               SQLAlchemy models
  schemas.py              Pydantic schemas
  routers/                API route modules
  websocket/scan_ws.py    Simulated scan WebSocket
  data/                   Demo data and local service JSON

ui-review/
  package.json            Frontend scripts and dependencies
  vite.config.ts          Vite dev server and API proxy
  src/App.tsx             App routes and console shell
  src/screens/            Main workflow pages
  src/features/           Feature-specific complex modules
  src/lib/                Shared client state and API helpers
  public/                 Static demo image data

docs/
  README.md               Documentation index
  CT_DOMAIN_CONTEXT.md    CT terminology and safety boundaries for AI/copywriting
```

## Main Backend Endpoints

Base URL: `http://localhost:8000`

```text
GET    /                         Health check

GET    /api/patients/
POST   /api/patients/
GET    /api/patients/{id}
PUT    /api/patients/{id}
DELETE /api/patients/{id}

GET/POST/PUT/DELETE /api/protocols/...
GET/POST/PUT        /api/scan-params/...
GET/POST/PUT/DELETE /api/recon-series/...
GET/POST/PUT/DELETE /api/contrast-configs/...
GET/POST/PUT        /api/scan-sessions/...
GET/POST            /api/disk-manager/...
GET/POST/PUT        /api/corners/...

WS     /ws/scan-control
```

## Main Frontend Routes

```text
/                         Home
/patients                 Patient list
/protocol-select          Protocol selection
/protocol-detail          Protocol overview/editing
/protocol-detail/scout    Scout parameters
/protocol-detail/helical  Helical parameters
/protocol-detail/recon    Reconstruction parameters
/protocol-detail/dose     Dose notification
/scout-scan               Scout preparation
/scout-execute            Scout execution
/sequence-confirm         Sequence confirmation
/helical-confirm          Helical confirmation
/helical-execute          Helical execution
/gated-helical-confirm    Gated helical confirmation
/gated-axial-confirm      Gated axial confirmation
/image-viewer             DICOM/4D image viewer
/service/...              Service-mode modules
```

## Documentation

Use [docs/README.md](docs/README.md) as the documentation index. Keep new long-form plans and research notes under `docs/`, not in the repository root or `ui-review/`.

## Notes

- `backend/app.db` is local runtime data and is ignored by Git.
- `ui-review/node_modules/`, `.venv/`, build logs, and generated output should stay untracked.
- Raw external DICOM data should not be committed unless it is intentionally curated demo data.
