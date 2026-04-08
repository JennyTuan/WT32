"""Disk Manager API — JSON file-backed storage for scan file lifecycle management."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/disk-manager", tags=["disk-manager"])

# ---------------------------------------------------------------------------
# File paths
# ---------------------------------------------------------------------------
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_DISKS_FILE = _DATA_DIR / "disks.json"
_SCANFILES_FILE = _DATA_DIR / "scanfiles.json"
_AUDIT_FILE = _DATA_DIR / "audit.jsonl"

# ---------------------------------------------------------------------------
# Mutex for concurrent protection
# ---------------------------------------------------------------------------
_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Config (in-memory, persisted alongside disks.json calls)
# ---------------------------------------------------------------------------
_config: dict[str, Any] = {
    "retention_days": 7,
    "retention_time": "00:00",
    "auto_cleanup": False,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _read_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _append_audit(entry: dict) -> None:
    with open(_AUDIT_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _build_partitions_response() -> list[dict]:
    disks = _read_json(_DISKS_FILE)
    scanfiles = _read_json(_SCANFILES_FILE)

    result = []
    for disk in disks:
        files = [sf for sf in scanfiles if sf["partition"] == disk["id"]]
        used_mb = sum(sf["file_size_mb"] for sf in files)
        result.append({
            **disk,
            "used_mb": used_mb,
            "files": files,
        })
    return result


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class FileActionRequest(BaseModel):
    file_ids: list[str]
    partition: str


class ThresholdUpdate(BaseModel):
    threshold: int


class ConfigUpdate(BaseModel):
    retention_days: int | None = None
    retention_time: str | None = None
    auto_cleanup: bool | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/partitions")
def get_partitions():
    """Return all partitions with their files and computed used_mb."""
    with _lock:
        partitions = _build_partitions_response()
    return {"partitions": partitions, "config": _config}


@router.post("/files/reserve")
def reserve_files(req: FileActionRequest):
    """Set files to RESERVED status with retain_until based on retention policy."""
    with _lock:
        scanfiles = _read_json(_SCANFILES_FILE)
        updated = []
        retain_until = (
            datetime.now() + timedelta(days=_config["retention_days"])
        ).isoformat()

        for sf in scanfiles:
            if sf["id"] in req.file_ids and sf["partition"] == req.partition:
                sf["status"] = "RESERVED"
                sf["is_locked"] = True
                sf["retain_until"] = retain_until
                updated.append(sf["id"])

        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching files found")

        _write_json(_SCANFILES_FILE, scanfiles)
        _append_audit({
            "timestamp": datetime.now().isoformat(),
            "action": "RESERVE",
            "file_ids": updated,
            "partition": req.partition,
            "result": "success",
        })

    return {"updated": updated, "count": len(updated)}


@router.post("/files/release")
def release_files(req: FileActionRequest):
    """Set files to RELEASED status. Blocked if active_recon_jobs > 0."""
    with _lock:
        scanfiles = _read_json(_SCANFILES_FILE)
        blocked: list[dict] = []
        updated: list[str] = []

        for sf in scanfiles:
            if sf["id"] in req.file_ids and sf["partition"] == req.partition:
                if sf["active_recon_jobs"] > 0:
                    blocked.append({"id": sf["id"], "reason": f"有 {sf['active_recon_jobs']} 个活跃重建任务"})
                else:
                    sf["status"] = "RELEASED"
                    sf["is_locked"] = False
                    sf["retain_until"] = None
                    updated.append(sf["id"])

        if blocked and not updated:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "所有文件均被阻止释放", "blocked": blocked},
            )

        if updated:
            _write_json(_SCANFILES_FILE, scanfiles)
            _append_audit({
                "timestamp": datetime.now().isoformat(),
                "action": "RELEASE",
                "file_ids": updated,
                "partition": req.partition,
                "result": "success",
            })

    return {"updated": updated, "blocked": blocked, "count": len(updated)}


@router.post("/files/purge")
def purge_files(req: FileActionRequest):
    """Remove files permanently. Blocked if active_recon_jobs > 0 or status is RESERVED."""
    with _lock:
        scanfiles = _read_json(_SCANFILES_FILE)
        blocked: list[dict] = []
        purged: list[str] = []

        remaining = []
        for sf in scanfiles:
            if sf["id"] in req.file_ids and sf["partition"] == req.partition:
                if sf["active_recon_jobs"] > 0:
                    blocked.append({"id": sf["id"], "reason": f"有 {sf['active_recon_jobs']} 个活跃重建任务"})
                    remaining.append(sf)
                elif sf["status"] == "RESERVED":
                    blocked.append({"id": sf["id"], "reason": "文件已保留，请先释放"})
                    remaining.append(sf)
                else:
                    purged.append(sf["id"])
            else:
                remaining.append(sf)

        if blocked and not purged:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "所有文件均被阻止删除", "blocked": blocked},
            )

        if purged:
            _write_json(_SCANFILES_FILE, remaining)
            _append_audit({
                "timestamp": datetime.now().isoformat(),
                "action": "PURGE",
                "file_ids": purged,
                "partition": req.partition,
                "result": "success",
            })

    return {"purged": purged, "blocked": blocked, "count": len(purged)}


@router.patch("/partitions/{partition_id}/threshold")
def update_threshold(partition_id: str, body: ThresholdUpdate):
    """Update the alert threshold for a partition."""
    with _lock:
        disks = _read_json(_DISKS_FILE)
        found = False
        for disk in disks:
            if disk["id"] == partition_id:
                disk["threshold"] = max(50, min(95, body.threshold))
                found = True
                break
        if not found:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partition not found")
        _write_json(_DISKS_FILE, disks)

    return {"partition_id": partition_id, "threshold": body.threshold}


@router.patch("/config")
def update_config(body: ConfigUpdate):
    """Update retention policy and auto-cleanup setting."""
    if body.retention_days is not None:
        _config["retention_days"] = body.retention_days
    if body.retention_time is not None:
        _config["retention_time"] = body.retention_time
    if body.auto_cleanup is not None:
        _config["auto_cleanup"] = body.auto_cleanup
    return _config
