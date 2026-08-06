# Code Reuse Thinking Guide

Before adding code, use `rg` to find an existing WT32 owner. Reuse the owner
when it already matches the responsibility; do not create an abstraction just
because two snippets look similar.

## Common owners

| Need | Owner to inspect first |
| --- | --- |
| Selected patient/session persistence | `ui-review/src/lib/patientSession.ts`, `scanSession.ts` |
| Workflow plan and route progression | `ui-review/src/lib/scanWorkflowSession.ts`, `scanExecutionFlow.ts` |
| API base URL and client calls | `ui-review/src/lib/apiClient.ts` and the matching `*Api.ts` helper |
| Protocol-detail screen behavior | `ui-review/src/features/protocolDetail/` |
| Protocol/session cloning | `backend/routers/scan_sessions.py` |
| ORM and transport contracts | `backend/models.py`, `backend/schemas.py` |

Create a shared helper only after an existing owner cannot own the behavior and
the logic is both non-trivial and has more than one real caller. A one-line
local transformation should remain local. When editing a repeated field or
constant, search its uses first so every real owner remains consistent.

For scan workflows, the canonical session API/cache is `scanSession.ts`; do
not duplicate its cache key, response normalisation, or template/session
boundary in a screen.
