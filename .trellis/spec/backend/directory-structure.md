# Backend Directory Structure

```text
backend/
  main.py                 FastAPI app, route registration, static/demo serving
  models.py               SQLAlchemy persistence models
  schemas.py              Pydantic request/response contracts
  database.py             engine, sessions, seed and persistence helpers
  routers/                resource-specific HTTP APIs
  websocket/scan_ws.py    simulated scan WebSocket
  migrations/versions/    Alembic revisions
  tests/                  public behavior and snapshot tests
```

Follow the existing flow: `models.py` → `schemas.py` → a focused
`routers/*.py` module → `websocket/scan_ws.py` only when the feature has a
simulation event. `backend/main.py` includes routers and owns application-wide
startup or static-demo concerns.

Add an endpoint to the router that owns its resource; for example scan-session
actions belong in `backend/routers/scan_sessions.py` or
`backend/routers/scan_workflow_actions.py`, not in `main.py`. Keep model,
schema, route, and test names in `snake_case`; model and schema classes use
`PascalCase`.

Do not put clinical decision rules or real-device adapters in this service.
Simulator responses and CT-facing copy must preserve the prototype boundary.
