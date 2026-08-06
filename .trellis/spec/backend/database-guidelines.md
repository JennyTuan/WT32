# Database Guidelines

Use SQLAlchemy models from `backend/models.py` and Pydantic contracts from
`backend/schemas.py`. Read and write through the FastAPI session dependency
used by the relevant router. Responses use Pydantic models that inherit the
shared `ORMModel` (`ConfigDict(from_attributes=True)`).

Persistent schema changes require a new Alembic revision in
`backend/migrations/versions/`; do not rely on startup to create or upgrade
PostgreSQL schema. Validate both migration behavior and the public API with
the focused tests in `backend/tests/`.

The central domain rule is a real data boundary: `Protocol` and its series are
reusable templates; `ScanSession` and `ScanSessionSeries` are per-exam
snapshots. Copying a template must retain the original ID in the corresponding
`template_*_id` field, as demonstrated in
`backend/tests/test_scan_session_snapshot.py`. Editing a session must never
mutate its template unless an explicit save-to-template workflow is added.

Do not modify `backend/app.db` or commit generated/raw DICOM data. Keep
database URLs and credentials in environment variables or the ignored `.env`.
