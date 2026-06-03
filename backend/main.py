from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.sessions import SessionMiddleware

from .database import SessionLocal, init_db
from .routers import ai_inference, auth, contrast_configs, corners, dicom_settings, disk_manager, dose_settings, logs, organization_info, patients, performance, protocols, recon_params, scan_params, scan_sessions, system_settings, user_management
from .websocket.scan_ws import router as scan_ws_router

app = FastAPI(title="CT Prototype Backend", version="1.0.0")
DATA_DIR = Path(__file__).resolve().parent / "data"
DICOM_PUBLIC_DIR = Path(__file__).resolve().parent.parent / "ui-review" / "public" / "dicom"
LIHVR_LOWER_EXTREMITY_DEMO_DIR = DATA_DIR / "lihVr" / "1.2.194.0.108707908.20260528141323.1236.10000.4191216"
LIHVR_LOWER_EXTREMITY_SERIES = {
    "topogram": "1.2.156.112605.189250948009764.260528061813.3.4424.38678",
    "thin-soft": "1.2.156.112605.189250948009764.260528061813.3.4424.106136",
    "thin-bone": "1.2.156.112605.189250948009764.260528061813.3.4424.96136",
    "vr-reference": "1.2.156.112605.66988332599980.260528062340.3.3292.13135.2",
}

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
app.include_router(ai_inference.router, prefix="/api")
app.include_router(scan_ws_router)


# Per-process dedup set so a corrupt/encrypted file doesn't flood SystemLog
# when the viewer requests it hundreds of times (thumbnails + viewer + MPR).
_DICOM_LOGGED: set[tuple[str, str]] = set()


def _log_dicom_issue(level: str, event: str, message: str, *, file_rel: str, details: str | None = None) -> None:
    key = (file_rel, event)
    if key in _DICOM_LOGGED:
        return
    _DICOM_LOGGED.add(key)
    db = SessionLocal()
    try:
        logs.write_system_log(db, level=level, source="dicom_serve", event=event, message=message, details=details)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _dicom_error_response(status_code: int, code: str, message: str, file_rel: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message, "file": file_rel},
    )


def _resolve_static_file(root: Path, file_path: str) -> Path:
    root = root.resolve()
    target = (root / file_path).resolve()
    if target != root and root not in target.parents:
        raise HTTPException(status_code=404, detail="File not found")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return target


def _readable_file_size(path: Path) -> int:
    with path.open("rb") as file:
        file.seek(0, os.SEEK_END)
        return file.tell()


def _iter_file(path: Path, start: int, end: int):
    with path.open("rb") as file:
        file.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = file.read(min(1024 * 1024, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def _validate_dicom_magic(path: Path) -> bool:
    """A real DICOM file has 'DICM' at byte offset 128. Files locked by an
    endpoint-encryption agent typically return scrambled bytes here."""
    try:
        with path.open("rb") as f:
            head = f.read(132)
    except OSError:
        raise
    return len(head) >= 132 and head[128:132] == b"DICM"


def _dicom_file_response(request: Request, path: Path) -> StreamingResponse:
    size = _readable_file_size(path)
    start = 0
    end = max(size - 1, 0)
    status_code = 200
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": "application/dicom",
    }

    range_header = request.headers.get("range")
    if range_header and range_header.startswith("bytes="):
        raw_start, _, raw_end = range_header.removeprefix("bytes=").partition("-")
        try:
            if raw_start:
                start = int(raw_start)
                end = int(raw_end) if raw_end else size - 1
            elif raw_end:
                suffix_length = int(raw_end)
                start = max(size - suffix_length, 0)
                end = size - 1
        except ValueError as exc:
            raise HTTPException(status_code=416, detail="Invalid range") from exc

        if start < 0 or start >= size or end < start:
            raise HTTPException(status_code=416, detail="Range not satisfiable")

        end = min(end, size - 1)
        status_code = 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"

    headers["Content-Length"] = str(end - start + 1 if size > 0 else 0)
    return StreamingResponse(_iter_file(path, start, end), status_code=status_code, headers=headers)


def _serve_validated_dicom(root: Path, file_path: str, request: Request):
    try:
        target = _resolve_static_file(root, file_path)
    except HTTPException as exc:
        if exc.status_code == 404:
            return _dicom_error_response(404, "DICOM_NOT_FOUND", "影像文件不存在或路径错误", file_path)
        raise

    try:
        ok = _validate_dicom_magic(target)
    except PermissionError:
        _log_dicom_issue(
            "ERROR",
            "dicom_permission_denied",
            f"DICOM 文件无法读取（权限被拒）: {file_path}",
            file_rel=file_path,
            details=f"path={target}",
        )
        return _dicom_error_response(403, "DICOM_PERMISSION_DENIED", "影像文件无法读取，系统权限被拒绝（可能被安全软件锁定）", file_path)
    except OSError as exc:
        _log_dicom_issue(
            "ERROR",
            "dicom_read_error",
            f"DICOM 文件读取异常: {file_path}",
            file_rel=file_path,
            details=f"path={target}, errno={exc.errno}, msg={exc}",
        )
        return _dicom_error_response(500, "DICOM_READ_ERROR", "影像文件读取异常，请稍后重试", file_path)

    if not ok:
        size = target.stat().st_size if target.exists() else 0
        _log_dicom_issue(
            "WARNING",
            "dicom_invalid",
            f"DICOM 文件无效或被加密锁定: {file_path}",
            file_rel=file_path,
            details=f"reason=missing_DICM_magic, size={size}",
        )
        return _dicom_error_response(
            422,
            "DICOM_INVALID",
            "影像文件格式错误，无法解析（可能被加密软件锁定或文件已损坏）",
            file_path,
        )

    return _dicom_file_response(request, target)


def _read_demo_dicom_header(path: Path):
    import pydicom

    return pydicom.dcmread(str(path), stop_before_pixels=True, force=True)


def _demo_dicom_sort_key(path: Path):
    try:
        ds = _read_demo_dicom_header(path)
    except Exception:
        return (1, path.name)

    instance = getattr(ds, "InstanceNumber", None)
    try:
        return (0, int(instance))
    except (TypeError, ValueError):
        pass

    image_position = getattr(ds, "ImagePositionPatient", None)
    if image_position is not None and len(image_position) >= 3:
        try:
            return (0, float(image_position[2]))
        except (TypeError, ValueError):
            pass

    return (1, path.name)


def _demo_dicom_text(value, fallback: str = "N/A") -> str:
    if value is None:
        return fallback
    return str(value) or fallback


def _build_lihvr_demo_series(key: str, uid: str):
    series_dir = LIHVR_LOWER_EXTREMITY_DEMO_DIR / uid
    if not series_dir.is_dir():
        raise FileNotFoundError(f"Missing DICOM series directory: {series_dir}")

    files = sorted((path for path in series_dir.iterdir() if path.is_file()), key=_demo_dicom_sort_key)
    if not files:
        raise FileNotFoundError(f"No DICOM files found in: {series_dir}")

    first = _read_demo_dicom_header(files[0])
    first_rel = files[0].relative_to(LIHVR_LOWER_EXTREMITY_DEMO_DIR).as_posix()
    urls = [
        f"/dicom-lihvr/{quote(path.relative_to(LIHVR_LOWER_EXTREMITY_DEMO_DIR).as_posix(), safe='/')}"
        for path in files
    ]

    window_center = getattr(first, "WindowCenter", None)
    window_width = getattr(first, "WindowWidth", None)
    if isinstance(window_center, (list, tuple)):
        window_center = window_center[0] if window_center else None
    if isinstance(window_width, (list, tuple)):
        window_width = window_width[0] if window_width else None

    return {
        "key": key,
        "seriesInstanceUid": uid,
        "seriesDescription": _demo_dicom_text(getattr(first, "SeriesDescription", None), key),
        "protocolName": _demo_dicom_text(getattr(first, "ProtocolName", None), "Lower Extremity"),
        "bodyPart": _demo_dicom_text(getattr(first, "BodyPartExamined", None), "EXTREMITY"),
        "imageType": [str(item) for item in getattr(first, "ImageType", [])],
        "count": len(files),
        "rows": int(getattr(first, "Rows", 0) or 0),
        "cols": int(getattr(first, "Columns", 0) or 0),
        "sliceThickness": _demo_dicom_text(getattr(first, "SliceThickness", None)),
        "pixelSpacing": [_demo_dicom_text(item) for item in getattr(first, "PixelSpacing", [])],
        "kv": _demo_dicom_text(getattr(first, "KVP", None)),
        "mAs": _demo_dicom_text(getattr(first, "XRayTubeCurrent", None)),
        "fov": "215 mm",
        "matrix": _demo_dicom_text(getattr(first, "Columns", None), "512"),
        "kernel": _demo_dicom_text(getattr(first, "ConvolutionKernel", None)),
        "windowCenter": float(window_center) if window_center is not None else None,
        "windowWidth": float(window_width) if window_width is not None else None,
        "firstFile": first_rel,
        "urls": urls,
    }


@lru_cache(maxsize=1)
def _build_lihvr_lower_extremity_manifest():
    if not LIHVR_LOWER_EXTREMITY_DEMO_DIR.is_dir():
        raise FileNotFoundError(f"Missing DICOM study directory: {LIHVR_LOWER_EXTREMITY_DEMO_DIR}")

    series = [
        _build_lihvr_demo_series(key, uid)
        for key, uid in LIHVR_LOWER_EXTREMITY_SERIES.items()
    ]
    by_key = {item["key"]: item for item in series}
    return {
        "studyId": "study-lihvr-lower-extremity",
        "studyName": "Lower Extremity",
        "sourcePath": str(LIHVR_LOWER_EXTREMITY_DEMO_DIR),
        "defaultSeriesKey": "thin-soft",
        "defaultVolumePreset": "CT-Bone",
        "defaultWindowWidth": by_key["thin-soft"].get("windowWidth") or 1800,
        "defaultWindowLevel": by_key["thin-soft"].get("windowCenter") or 350,
        "series": series,
    }


@app.get("/api/demo-dicom/limbs-helical")
def get_limbs_helical_demo_manifest():
    try:
        return _build_lihvr_lower_extremity_manifest()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/dicom-lihvr/{file_path:path}")
def serve_lihvr_demo_dicom(file_path: str, request: Request):
    if not LIHVR_LOWER_EXTREMITY_DEMO_DIR.exists():
        return _dicom_error_response(404, "DICOM_NOT_FOUND", "影像目录不存在", file_path)
    return _serve_validated_dicom(LIHVR_LOWER_EXTREMITY_DEMO_DIR, file_path, request)


@app.get("/dicom/{file_path:path}")
def serve_public_dicom(file_path: str, request: Request):
    return _serve_validated_dicom(DICOM_PUBLIC_DIR, file_path, request)


@app.get("/dicom-out/{file_path:path}")
def serve_dicom_out(file_path: str, request: Request):
    return _serve_validated_dicom(DICOM_OUT_DIR, file_path, request)


@app.get("/dicom-head-stroke-plain/{file_path:path}")
def serve_head_stroke_plain(file_path: str, request: Request):
    if not HEAD_STROKE_DEMO_PLAIN_DIR.exists():
        return _dicom_error_response(404, "DICOM_NOT_FOUND", "影像目录不存在", file_path)
    return _serve_validated_dicom(HEAD_STROKE_DEMO_PLAIN_DIR, file_path, request)


DICOM_OUT_DIR = DATA_DIR / "dicom_out"
DICOM_OUT_DIR.mkdir(parents=True, exist_ok=True)
HEAD_STROKE_DEMO_PLAIN_DIR = DATA_DIR / "Head Stroke Demo [Plain]"
