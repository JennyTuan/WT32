# WT32 Agent Guide

## Scope and safety boundary

WT32 is a CT scanner control-console prototype for product and UI validation, not clinical software. Never imply real device control, diagnostic conclusions, treatment advice, guaranteed safety, final dose calculation, or dose approval.

For scan parameters, dose, contrast, and safety-related UI copy, use wording such as **estimated**, **reference**, **simulation**, and **requires confirmation**.

## Work efficiently

- Inspect the current behavior and only the files relevant to the task before changing code. Preserve unrelated dirty-worktree changes.
- Read [README.md](README.md) when the architecture or setup is relevant; read [docs/README.md](docs/README.md) only when documentation or product context is needed.
- Before CT terminology, dose, contrast, safety, or clinical-workflow work, read [docs/CT_DOMAIN_CONTEXT.md](docs/CT_DOMAIN_CONTEXT.md).
- Do not open bulky/generated content unless the task concerns it: `.venv/`, `ui-review/node_modules/`, `ui-review/dist/`, logs/test results, `backend/data/**`, DICOM/image stacks, or large binary documents.

## Validate before implementation

For new, ambiguous, or safety-sensitive requests:

- Separate the observed problem from the proposed solution; check existing workflow intent and product boundaries first.
- Do not add behavior merely because the UI appears incomplete or a value is `--`.
- State briefly: whether to change it, the intended scope, what remains out of scope, and how to verify it.
- When the domain facts are uncertain, use the appropriate research or requirements-analysis workflow before coding.

## Find the change surface

- Backend: `backend/models.py` → `backend/schemas.py` → the relevant `backend/routers/*.py` → `backend/websocket/scan_ws.py`.
- Frontend: `ui-review/src/App.tsx` → `ui-review/src/lib/scanWorkflowSession.ts` / `scanSession.ts` → relevant `screens/` and `features/`.

## Implementation rules

- Follow the existing React, TypeScript, Tailwind, and Python patterns.
- Keep the 1024 × 768 console layout touch-friendly.
- Preserve protocol templates versus scan sessions: session edits must not mutate a template unless the workflow explicitly saves it.
- Put long-form documentation in `docs/`; do not add root-level planning files.
- Do not commit virtual environments, dependencies, logs, build output, or raw external DICOM data.
- Add concise Simplified Chinese comments only for non-obvious domain rules, safety wording, state transitions, or template/session-copy boundaries.

## Run and verify

Backend development:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

Frontend development (use `npm.cmd` on Windows):

```powershell
cd ui-review
npm.cmd run dev
```

- For backend changes, run `.\.venv\Scripts\python.exe -m unittest discover -s backend\tests` from the repository root.
- For frontend changes, run the relevant focused check, then `npm.cmd run lint` and `npm.cmd run build` in `ui-review`.
- Prefer user-visible/public-interface behavior tests. Do not leave new lint or build warnings unexplained.

## Local UI verification

Use the local-only test account when login is required: `U0001` / `stn123456`.

## Task-specific references

- Test baseline and test-growth priorities: [docs/agents/testing.md](docs/agents/testing.md)
- GitHub Issue/PRD workflow: [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
- Domain documentation and ADR guidance: [docs/agents/domain.md](docs/agents/domain.md)
