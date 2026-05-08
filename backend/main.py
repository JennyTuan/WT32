from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .routers import contrast_configs, corners, disk_manager, patients, protocols, recon_params, scan_params, scan_sessions
from .websocket.scan_ws import router as scan_ws_router

app = FastAPI(title="CT Prototype Backend", version="1.0.0")
DATA_DIR = Path(__file__).resolve().parent / "data"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def health_check():
    return {"message": "CT Prototype backend is running"}


app.include_router(patients.router, prefix="/api")
app.include_router(protocols.router, prefix="/api")
app.include_router(scan_params.router, prefix="/api")
app.include_router(recon_params.router, prefix="/api")
app.include_router(contrast_configs.router, prefix="/api")
app.include_router(scan_sessions.router, prefix="/api")
app.include_router(disk_manager.router, prefix="/api")
app.include_router(corners.router, prefix="/api")
app.include_router(scan_ws_router)
DICOM_OUT_DIR = DATA_DIR / "dicom_out"
DICOM_OUT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/dicom-out", StaticFiles(directory=DICOM_OUT_DIR), name="dicom_out")
