# Cross-Layer Thinking Guide

For a change that crosses the UI and backend, trace this WT32 path before
editing:

```text
SQLAlchemy model → Pydantic schema → FastAPI router → frontend API/session helper → screen/feature
```

For a scan-workflow change, also identify whether it belongs to a protocol
template or a per-exam scan-session snapshot. A feature must not silently
cross that boundary.

Check these questions before implementation:

- Does the model field have matching create, update, and response schemas?
- Does the route return the shape consumed by `ui-review/src/lib/scanSession.ts`?
- Is local storage only caching the server-owned selected session, rather than
  becoming a second source of truth?
- Does the UI preserve the prototype language: simulated, estimated, reference,
  and requires confirmation where CT, dose, contrast, or safety is involved?

Validate the narrowest public behavior at the affected boundary. For a new
persisted parameter, that normally means a backend API or snapshot test plus a
frontend state/API test when the client transforms or caches the value.
