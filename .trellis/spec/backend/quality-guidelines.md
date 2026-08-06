# Backend Quality Guidelines

Keep changes minimal and match the local FastAPI, SQLAlchemy, and Pydantic
patterns. A feature that crosses persistence must update the relevant model,
schema, router, and public-behavior test together. Prefer a focused test such
as `backend/tests/test_scan_session_api.py` or
`backend/tests/test_scan_session_snapshot.py` over testing implementation
details.

Run this from the repository root for backend changes:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests
```

Review for these WT32-specific failures:

- session editing accidentally changes a protocol template;
- a new parameter bypasses its schema validation or fails to survive cloning;
- CT-facing copy implies real device control, final dose calculation, approval,
  diagnostic output, or guaranteed safety;
- a change adds a dependency or framework instead of reusing the project.
