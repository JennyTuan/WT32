# Testing Notes For Agents

This repo is actively moving from "manual validation first" toward a stronger automated testing baseline.

## Current Baseline

Backend:

```powershell
cd C:\STN\projects\WT32
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests
```

Frontend:

```powershell
cd C:\STN\projects\WT32\ui-review
npm.cmd run lint
npm.cmd run build
```

There is no frontend test runner configured yet. Do not claim frontend automated tests exist until a real `test` script is added to `ui-review/package.json`.

## What To Add First

Prioritize behavior that is expensive or risky to re-check manually:

- Protocol template versus scan-session separation.
- Scan workflow state in `ui-review/src/lib/scanWorkflowSession.ts`.
- Scan-session API behavior in `backend/routers/scan_sessions.py`.
- Dose, DOM, contrast, and safety-related copy constraints.
- Gating and 4D workflow branching.
- DICOM/image loading error states where sample data boundaries are clear.

## Test Style

- Test public interfaces and observable workflow behavior.
- Add one behavior test at a time, then make it pass.
- Name tests with WT32 domain terms so failures read like product regressions.
- Keep fixtures small and intentional; do not depend on raw external DICOM dumps unless the test explicitly covers DICOM parsing.
- When code needs comments, write concise Simplified Chinese comments for non-obvious domain rules or state transitions.
