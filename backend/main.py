from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .database import SessionLocal, init_db
from .routers import auth, contrast_configs, corners, dicom_settings, disk_manager, dose_settings, logs, organization_info, patients, performance, protocols, recon_params, scan_params, scan_sessions, system_settings, user_management
from .websocket.scan_ws import router as scan_ws_router

app = FastAPI(title="CT Prototype Backend", version="1.0.0")
DATA_DIR = Path(__file__).resolve().parent / "data"

# Cookies must be permitted by CORS for the SPA → API session flow. With
# allow_credentials=True the wildcard origin is not allowed; explicit origins
# come from CT_PROTOTYPE_CORS_ORIGINS (comma-separated) or fall back to common
# Vite dev origins on the local network.
_cors_env = os.environ.get("CT_PROTOTYPE_CORS_ORIGINS", "").strip()
if _cors_env:
    _allowed_origins = [origin.strip() for origin in _cors_env.split(",") if origin.strip()]
else:
    _allowed_origins = [
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ]
_allow_origin_regex = os.environ.get(
    "CT_PROTOTYPE_CORS_ORIGIN_REGEX",
    # Allow the Vite dev server on any LAN IP (the tablet hits the host over LAN).
    r"^http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):\d+$",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session cookie: signed with itsdangerous. SECRET_KEY should come from env in
# production; a dev fallback keeps local startup zero-config.
_session_secret = os.environ.get("CT_PROTOTYPE_SESSION_SECRET") or "dev-only-secret-change-me"
app.add_middleware(
    SessionMiddleware,
    secret_key=_session_secret,
    session_cookie="ct_session",
    same_site="lax",
    https_only=False,
    max_age=60 * 60 * 12,  # 12h
)


@app.on_event("startup")
def on_startup():
    init_db()
    db = SessionLocal()
    try:
        logs.write_system_log(
            db,
            level="INFO",
            source="main",
            event="app_started",
            message="CT Prototype backend started",
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@app.get("/")
def health_check():
    return {"message": "CT Prototype backend is running"}


app.include_router(auth.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(protocols.router, prefix="/api")
app.include_router(scan_params.router, prefix="/api")
app.include_router(recon_params.router, prefix="/api")
app.include_router(contrast_configs.router, prefix="/api")
app.include_router(scan_sessions.router, prefix="/api")
app.include_router(disk_manager.router, prefix="/api")
app.include_router(corners.router, prefix="/api")
app.include_router(dicom_settings.router, prefix="/api")
app.include_router(logs.router, prefix="/api")
app.include_router(dose_settings.router, prefix="/api")
app.include_router(user_management.router, prefix="/api")
app.include_router(system_settings.router, prefix="/api")
app.include_router(organization_info.router, prefix="/api")
app.include_router(performance.router, prefix="/api")
app.include_router(scan_ws_router)
DICOM_OUT_DIR = DATA_DIR / "dicom_out"
DICOM_OUT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/dicom-out", StaticFiles(directory=DICOM_OUT_DIR), name="dicom_out")
HEAD_STROKE_DEMO_PLAIN_DIR = DATA_DIR / "Head Stroke Demo [Plain]"
if HEAD_STROKE_DEMO_PLAIN_DIR.exists():
    app.mount(
        "/dicom-head-stroke-plain",
        StaticFiles(directory=HEAD_STROKE_DEMO_PLAIN_DIR),
        name="dicom_head_stroke_plain",
    )
