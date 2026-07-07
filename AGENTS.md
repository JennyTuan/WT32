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

## Generated And Bulky Files

Do not read these by default:

- `.venv/`, `ui-review/node_modules/`, `ui-review/dist/`
- `.codex-run-logs/`, `test-results/`, build logs and temporary check files
- Raw or generated medical image data under `backend/data/**`, `ui-review/public/dicom/`, `ui-review/public/dicom-4d/`, and `ui-review/public/fourd-engineer/`
- DICOM/MHA/WebP image stacks such as `*.dcm`, `*.dicom`, `*.mha`, and generated slice assets
- Large binary documents such as `*.docx`, `*.xlsx`, and archives

Open these files only when the task is specifically about image loading, DICOM ingestion, demo data, or build-output comparison.

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

## Local Prototype Login

For future AI assistants working with the local WT32 prototype UI, use this test account when login is required:

- Username: `U0001`
- Password: `stn123456`

Use this only for local development and UI verification.

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

## Testing And Quality Gates

- See `docs/agents/testing.md` for the current testing baseline and recommended test-growth priorities.
- Treat behavior tests as part of the implementation, not as optional cleanup.
- Prefer tests through public interfaces and user-visible workflow behavior over private implementation details.
- For backend changes, run:

```powershell
cd C:\STN\projects\WT32
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests
```

- For frontend changes, run the relevant focused check first, then at minimum:

```powershell
cd C:\STN\projects\WT32\ui-review
npm.cmd run lint
npm.cmd run build
```

- Current frontend has no dedicated test runner yet. When adding one, document the command here and keep it runnable with `npm.cmd` on Windows.
- Do not let new lint or build warnings become background noise; either fix them or document why they are accepted.

## Code Comments

- Add comments for non-obvious business rules, CT domain constraints, safety wording, state transitions, and protocol/session copy boundaries.
- Keep comments concise and useful. Avoid restating what the next line of code already says.
- Use Simplified Chinese for new code comments.

## Token Budget Notes

- Start with this file, then `README.md`, then only the relevant backend router, frontend screen, or domain doc.
- For frontend workflow changes, prefer `ui-review/src/App.tsx`, `ui-review/src/screens/`, and relevant helpers in `ui-review/src/lib/`.
- For backend API changes, prefer `backend/main.py`, `backend/models.py`, `backend/schemas.py`, and the specific `backend/routers/*.py` module.
- For CT terminology or safety-sensitive copy, read `docs/CT_DOMAIN_CONTEXT.md` before editing.

## Agent Skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `JennyTuan/WT32`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo. Read `docs/CT_DOMAIN_CONTEXT.md`, `docs/README.md`, and relevant docs/ADRs before domain-sensitive work. See `docs/agents/domain.md`.
