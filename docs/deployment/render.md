# Render deployment (free demonstration)

This deployment is for the WT32 product/UI prototype only. It must use
simulated or de-identified data, and is not a clinical system.

The included `Dockerfile` builds the React application and serves it from the
same FastAPI service. The browser therefore uses one HTTPS origin for the UI,
API, login session, and scan-simulation WebSocket. Do not split this build into
a Vercel static site plus an unrelated API URL unless you also design and test
the cross-site authentication flow.

## Before deploying

1. Push the deployment files to the GitHub repository.
2. Create a free PostgreSQL project with Supabase or another managed PostgreSQL
   provider. Copy its **direct PostgreSQL connection string**. Do not use a
   pooler URL unless the provider explicitly supports migrations through it.
3. Do not use the local `backend/app.db` in Render. It is a local SQLite
   fallback and a free web-service filesystem is not durable database storage.

The Render deployment starts from an empty database. It runs `alembic upgrade
head`, then WT32 seeds its prototype defaults on first startup. Local users,
patients, protocol edits, and sessions are not copied. Migrate those only when
they are simulated/de-identified and must be retained.

## Create the service

1. In Render, choose **New > Blueprint**, connect `JennyTuan/WT32`, and select
   the branch containing `render.yaml`.
2. On the environment-variable screen, paste the hosted database connection
   string into `DATABASE_URL`. Keep the other two generated/configured values.
3. Create the service and wait for its first deploy to finish. The public link
   is `https://wt32.onrender.com` (or the service name you selected).
4. Log in with the local prototype account `U0001` / `stn123456`, then test the
   patient list, a protocol page, and a scan simulation. `/health` should
   return a successful response in Render's health-check configuration.

## Expected free-tier limitations

Render's free Web Service pauses after inactivity, so the first visit after a
pause can take time to wake. The included Docker build deliberately excludes
the local, untracked DICOM image collections. Core workflow screens will work,
but image-viewer demonstrations that rely on those files will return an
unavailable-demo response until a separately reviewed, de-identified demo
asset strategy is added.

## Preserve an existing local database (optional)

Leave the local database in place. To copy existing demo data, first back it
up, then import a copy into the hosted PostgreSQL database:

- Existing local PostgreSQL: export with `pg_dump`, then restore with `pg_restore`.
- Existing `backend/app.db` SQLite: configure the hosted `DATABASE_URL` locally
  and run `python -m backend.migrate_legacy_sqlite --source backend/app.db`.

Never migrate real patient data to this public prototype.
