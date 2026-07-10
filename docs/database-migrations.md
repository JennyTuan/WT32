# Database Migrations

WT32 uses PostgreSQL for the configured backend database and Alembic for schema versions. The SQLite database remains only as a zero-configuration fallback for legacy local tests.

## Configure The Connection

Set the connection in the PowerShell terminal used to migrate and start the backend:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://jenny_dev:YOUR_URL_ENCODED_PASSWORD@localhost:5432/wt32"
```

You may instead copy `.env.example` to `.env` and edit the local file. It is ignored by Git and loaded by both Alembic and FastAPI.

The password portion must be URL-encoded. For example, `@` becomes `%40`. Do not commit a real connection string or password.

## Upgrade A Fresh Database

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
```

## Copy Existing SQLite Data

If `backend/app.db` contains data that must be retained, copy it only after upgrading an empty PostgreSQL database and before starting FastAPI:

```powershell
.\.venv\Scripts\python.exe -m backend.migrate_legacy_sqlite --source backend\app.db --dry-run
.\.venv\Scripts\python.exe -m backend.migrate_legacy_sqlite --source backend\app.db
```

The command copies all relational tables in foreign-key order within one target transaction, preserves primary keys, and advances PostgreSQL sequences. It never deletes source rows and refuses to write when the target already contains business data, so it cannot be used as an incremental synchronization tool.

## Start The Backend

Start FastAPI in the same terminal. Startup verifies that PostgreSQL is at the current revision before inserting or synchronizing prototype seed data.

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

## Create A Future Migration

After changing SQLAlchemy models:

```powershell
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe schema change"
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Review every generated migration before applying it. Autogeneration proposes schema operations; it cannot infer product-specific data transformations.

## Roll Back

Back up data before any downgrade. To undo one revision:

```powershell
.\.venv\Scripts\python.exe -m alembic downgrade -1
```

The current baseline revision creates the entire schema, so downgrading that first revision removes all WT32 tables and their data. Use this only for a disposable development database.

## Verify

```powershell
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m unittest backend.tests.test_database_configuration backend.tests.test_database_migrations
```

If FastAPI reports that the schema is not current, run `alembic upgrade head` with the same `DATABASE_URL` used by the backend.
