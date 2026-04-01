from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import contrast_configs, patients, protocols, recon_params, scan_params, scan_sessions
from .websocket.scan_ws import router as scan_ws_router

app = FastAPI(title="CT Prototype Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
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
app.include_router(scan_ws_router)
