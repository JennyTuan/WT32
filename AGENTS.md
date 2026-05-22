# AGENTS.md - WT32 Collaboration Guide

This file is the lightweight entry point for AI coding assistants working in this repository.

## Read First

- Project overview, setup, architecture, routes: [README.md](README.md)
- Documentation map: [docs/README.md](docs/README.md)
- CT terminology, safety language, and domain constraints: [docs/CT_DOMAIN_CONTEXT.md](docs/CT_DOMAIN_CONTEXT.md)

## Project Boundary

WT32 is a CT scanner control-console prototype for product and UI validation. It is not clinical software.

Do not generate text or behavior that implies:

- Real device control
- Diagnostic conclusions
- Treatment advice
- Guaranteed safety
- Final dose calculation or dose approval

Use wording such as "estimated", "reference", "simulation", and "requires confirmation" for scan parameters, dose, contrast, and safety-related UI copy.

## Local Development

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

Use `npm.cmd` on Windows if PowerShell blocks `npm.ps1`.

## Code Navigation

Backend reading order:

1. `backend/models.py`
2. `backend/schemas.py`
3. `backend/routers/*.py`
4. `backend/websocket/scan_ws.py`

Frontend reading order:

1. `ui-review/src/App.tsx`
2. `ui-review/src/lib/scanWorkflowSession.ts`
3. `ui-review/src/lib/scanSession.ts`
4. `ui-review/src/screens/`
5. `ui-review/src/features/`

## Implementation Conventions

- Follow the existing React + TypeScript + Tailwind patterns.
- Keep the 1024 x 768 console layout stable and touch-friendly.
- Preserve protocol template vs scan session separation.
- Session edits must not mutate protocol templates unless the workflow explicitly saves a template.
- Keep long-form notes in `docs/`; do not add new root-level planning files.
- Do not commit `.venv/`, `node_modules/`, build logs, runtime logs, or raw external DICOM dumps.
