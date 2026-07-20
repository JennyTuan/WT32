from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..file_backed_documents import DEFAULT_DISK_MANAGER_STATE, DISK_MANAGER_KEY
from ..persistent_documents import load_document, save_document


router = APIRouter(prefix="/disk-manager", tags=["disk-manager"])


class FileActionRequest(BaseModel):
    file_ids: list[str] = Field(default_factory=list)
    partition: str


class ThresholdUpdate(BaseModel):
    threshold: int = Field(ge=1, le=100)


class ConfigUpdate(BaseModel):
    retention_days: int | None = Field(default=None, ge=1, le=365)
    retention_time: str | None = None
    auto_cleanup: bool | None = None


class AuditLogEntry(BaseModel):
    timestamp: str
    action: str
    partition: str | None = None
    file_ids: list[str] = Field(default_factory=list)
    result: str | None = None
    detail: dict[str, Any] = Field(default_factory=dict)


def _state(db: Session) -> dict[str, Any]:
    # Round-trip through the document store so callers can mutate an isolated payload.
    state = load_document(db, DISK_MANAGER_KEY, DEFAULT_DISK_MANAGER_STATE)
    if not isinstance(state, dict):
        raise HTTPException(status_code=500, detail="Invalid disk-manager data")
    state.setdefault("config", dict(DEFAULT_DISK_MANAGER_STATE["config"]))
    state.setdefault("partitions", [])
    state.setdefault("files", [])
    state.setdefault("audit", [])
    return state


def _save_state(db: Session, state: dict[str, Any]) -> None:
    save_document(db, DISK_MANAGER_KEY, state)


def _append_audit(state: dict[str, Any], action: str, detail: dict[str, Any]) -> None:
    state["audit"].append({"timestamp": datetime.now().isoformat(), "action": action, **detail})


def _normalize_audit(entry: dict[str, Any]) -> AuditLogEntry:
    detail = {key: value for key, value in entry.items() if key not in {"timestamp", "action", "partition", "file_ids", "result"}}
    file_ids = entry.get("file_ids")
    return AuditLogEntry(
        timestamp=str(entry.get("timestamp", "")),
        action=str(entry.get("action", "")),
        partition=entry.get("partition"),
        file_ids=file_ids if isinstance(file_ids, list) else [],
        result=entry.get("result"),
        detail=detail,
    )


def _partition_or_404(state: dict[str, Any], partition_id: str) -> dict[str, Any]:
    partition = next((item for item in state["partitions"] if item.get("id") == partition_id), None)
    if partition is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partition not found")
    return partition


def _target_files(state: dict[str, Any], partition: str, file_ids: list[str]) -> list[dict[str, Any]]:
    return [item for item in state["files"] if item.get("partition") == partition and item.get("id") in file_ids]


def _require_files(req: FileActionRequest) -> None:
    if not req.file_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files selected")


def _retain_until(config: dict[str, Any]) -> str:
    hours, minutes = map(int, str(config["retention_time"]).split(":"))
    return (datetime.now() + timedelta(days=int(config["retention_days"]))).replace(
        hour=hours, minute=minutes, second=0, microsecond=0
    ).isoformat()


@router.get("/partitions")
def get_partitions(db: Session = Depends(get_db)) -> dict[str, Any]:
    state = _state(db)
    partitions = []
    for partition in state["partitions"]:
        files = [item for item in state["files"] if item.get("partition") == partition.get("id")]
        partitions.append({**partition, "used_mb": sum(item.get("file_size_mb", 0) for item in files), "files": files})
    return {"partitions": partitions, "config": state["config"]}


@router.get("/audit", response_model=list[AuditLogEntry])
def list_audit_logs(
    action: str | None = None,
    partition: str | None = None,
    result: str | None = None,
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[AuditLogEntry]:
    rows = _state(db)["audit"]
    if action:
        rows = [row for row in rows if row.get("action") == action]
    if partition:
        rows = [row for row in rows if row.get("partition") == partition]
    if result:
        rows = [row for row in rows if row.get("result") == result]
    rows.sort(key=lambda row: str(row.get("timestamp", "")), reverse=True)
    return [_normalize_audit(row) for row in rows[offset : offset + limit]]


@router.post("/files/reserve")
def reserve_files(req: FileActionRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    _require_files(req)
    state = _state(db)
    _partition_or_404(state, req.partition)
    targets = _target_files(state, req.partition, req.file_ids)
    if not targets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching files found")
    retain_until = _retain_until(state["config"])
    for item in targets:
        item.update(status="RESERVED", is_locked=True, retain_until=retain_until)
    updated = [str(item["id"]) for item in targets]
    _append_audit(state, "RESERVE", {"partition": req.partition, "file_ids": updated, "result": "success"})
    _save_state(db, state)
    return {"updated": updated, "count": len(updated)}


@router.post("/files/release")
def release_files(req: FileActionRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    _require_files(req)
    state = _state(db)
    _partition_or_404(state, req.partition)
    targets = _target_files(state, req.partition, req.file_ids)
    if not targets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching files found")
    updated: list[str] = []
    blocked: list[dict[str, str]] = []
    for item in targets:
        if item.get("active_recon_jobs", 0) > 0:
            blocked.append({"id": str(item["id"]), "reason": f"存在 {item['active_recon_jobs']} 个重建任务"})
            continue
        item.update(status="ACQUIRED", is_locked=False, retain_until=None)
        updated.append(str(item["id"]))
    if not updated and blocked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"message": "选中文件无法释放", "blocked": blocked})
    _append_audit(state, "RELEASE", {"partition": req.partition, "file_ids": updated, "blocked": blocked, "result": "success" if updated else "blocked"})
    _save_state(db, state)
    return {"updated": updated, "blocked": blocked, "count": len(updated)}


@router.delete("/files/purge")
def purge_files(req: FileActionRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    _require_files(req)
    state = _state(db)
    _partition_or_404(state, req.partition)
    targets = _target_files(state, req.partition, req.file_ids)
    if not targets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching files found")
    purged: list[str] = []
    blocked: list[dict[str, str]] = []
    remaining: list[dict[str, Any]] = []
    for item in state["files"]:
        if item not in targets:
            remaining.append(item)
        elif item.get("active_recon_jobs", 0) > 0:
            blocked.append({"id": str(item["id"]), "reason": f"存在 {item['active_recon_jobs']} 个重建任务"})
            remaining.append(item)
        elif item.get("status") == "RESERVED":
            blocked.append({"id": str(item["id"]), "reason": "文件已保留，请先释放"})
            remaining.append(item)
        else:
            purged.append(str(item["id"]))
    if not purged and blocked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"message": "选中文件无法删除", "blocked": blocked})
    state["files"] = remaining
    _append_audit(state, "PURGE", {"partition": req.partition, "file_ids": purged, "blocked": blocked, "result": "success" if purged else "blocked"})
    _save_state(db, state)
    return {"purged": purged, "blocked": blocked, "count": len(purged)}


@router.patch("/partitions/{partition_id}/threshold")
def update_partition_threshold(partition_id: str, body: ThresholdUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    state = _state(db)
    partition = _partition_or_404(state, partition_id)
    partition["threshold"] = body.threshold
    _append_audit(state, "UPDATE_THRESHOLD", {"partition": partition_id, "threshold": body.threshold, "result": "success"})
    _save_state(db, state)
    return {"partition_id": partition_id, "threshold": body.threshold}


@router.patch("/config")
def update_disk_config(body: ConfigUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    state = _state(db)
    config = state["config"]
    if body.retention_days is not None:
        config["retention_days"] = body.retention_days
    if body.retention_time is not None:
        config["retention_time"] = body.retention_time
    if body.auto_cleanup is not None:
        config["auto_cleanup"] = body.auto_cleanup
    _append_audit(state, "UPDATE_CONFIG", {"config": config, "result": "success"})
    _save_state(db, state)
    return config
