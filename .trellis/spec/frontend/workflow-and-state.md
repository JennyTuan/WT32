# Frontend Workflow and State

Routes are declared in `ui-review/src/App.tsx`; add a route only when a new
screen is genuinely required. Place reusable feature logic in `src/lib/` or
the owning `src/features/` module, then keep screens focused on presentation
and orchestration. Reuse shared controls in `src/components/` before adding a
near-duplicate.

`src/lib/scanWorkflowSession.ts` stores workflow plans in local storage.
`src/lib/scanSession.ts` owns the selected session cache and HTTP mutations.
Use its exported helpers rather than adding a second local-storage key or a
screen-specific copy of session state.

The API base URL is built by `src/lib/apiClient.ts`; do not hard-code backend
hosts in normal API calls. Treat `fetch` failures explicitly and preserve the
existing user-facing failure message pattern.

Most importantly, protocol templates and scan sessions are distinct. Session
screens edit the per-exam snapshot returned by `/api/scan-sessions/`; they do
not modify a template unless the user intentionally enters a template-editing
workflow. `src/lib/scanSession.ts` updates the selected-session cache after a
successful server response—follow that pattern so refreshes and route changes
do not restore stale state.

For an inline confirmation-page edit, use the successful mutation response to
update the screen's session state. Do not make a follow-up fetch a condition of
save success: a transient refresh failure must not turn a persisted change into
an error or reset the control that the operator was editing. Refreshes that are
needed for unrelated state must be non-blocking and preserve the active field.

Keep the 1024 × 768 layout touch-friendly and preserve normal keyboard and
accessibility behavior. CT, dose, contrast, QA, and service UI must identify
values as simulation, estimated, or reference data requiring confirmation;
do not imply real scanner control or clinical approval.
