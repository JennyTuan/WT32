from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/disk-manager", tags=["disk-manager"])

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DISKS_FILE = DATA_DIR / "disks.json"
SCANFILES_FILE = DATA_DIR / "scanfiles.json"
AUDIT_FILE = DATA_DIR / "audit.jsonl"

lock = threading.Lock()

config: dict[str, Any] = {
    "retention_days": 7,
    "retention_time": "00:00",
    "auto_cleanup": False,
}


class FileActionRequest(BaseModel):
    file_ids: list[str] = Field(default_factory=list)
    partition: str


class ThresholdUpdate(BaseModel):
    threshold: int = Field(ge=1, le=100)


class ConfigUpdate(BaseModel):
    retention_days: int | None = Field(default=None, ge=1, le=365)
    retention_time: str | None = None
    auto_cleanup: bool | None = None


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def write_json(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8-sig") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)


def append_audit(action: str, detail: dict[str, Any]) -> None:
    entry = {
        "timestamp": datetime.now().isoformat(),
        "action": action,
        **detail,
    }
    with AUDIT_FILE.open("a", encoding="utf-8-sig") as file:
        file.write(json.dumps(entry, ensure_ascii=False) + "\n")


def build_retain_until() -> str:
    now = datetime.now()
    hours, minutes = map(int, config["retention_time"].split(":"))
    target = (now + timedelta(days=config["retention_days"])).replace(
        hour=hours,
        minute=minutes,
        second=0,
        microsecond=0,
    )
    return target.isoformat()


def build_partitions_response() -> list[dict[str, Any]]:
    partitions = read_json(DISKS_FILE)
    files = read_json(SCANFILES_FILE)

    result: list[dict[str, Any]] = []
    for partition in partitions:
        partition_files = [item for item in files if item["partition"] == partition["id"]]
        used_mb = sum(item["file_size_mb"] for item in partition_files)
        result.append(
            {
                **partition,
                "used_mb": used_mb,
                "files": partition_files,
            }
        )
    return result


def validate_partition_exists(partition_id: str) -> None:
    partitions = read_json(DISKS_FILE)
    if not any(item["id"] == partition_id for item in partitions):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partition not found")


def get_target_files(files: list[dict[str, Any]], partition: str, file_ids: list[str]) -> list[dict[str, Any]]:
    return [item for item in files if item["partition"] == partition and item["id"] in file_ids]


def ensure_request_has_files(req: FileActionRequest) -> None:
    if not req.file_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files selected")


@router.get("/partitions")
def get_partitions() -> dict[str, Any]:
    with lock:
        return {
            "partitions": build_partitions_response(),
            "config": config,
        }


@router.post("/files/reserve")
def reserve_files(req: FileActionRequest) -> dict[str, Any]:
    ensure_request_has_files(req)

    with lock:
        validate_partition_exists(req.partition)
        files = read_json(SCANFILES_FILE)
        targets = get_target_files(files, req.partition, req.file_ids)

        if not targets:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching files found")

        retain_until = build_retain_until()
        updated: list[str] = []

        for item in files:
            if item in targets:
                item["status"] = "RESERVED"
                item["is_locked"] = True
                item["retain_until"] = retain_until
                updated.append(item["id"])

        write_json(SCANFILES_FILE, files)
        append_audit(
            "RESERVE",
            {
                "partition": req.partition,
                "file_ids": updated,
                "result": "success",
            },
        )

    return {"updated": updated, "count": len(updated)}


@router.post("/files/release")
def release_files(req: FileActionRequest) -> dict[str, Any]:
    ensure_request_has_files(req)

    with lock:
        validate_partition_exists(req.partition)
        files = read_json(SCANFILES_FILE)
        targets = get_target_files(files, req.partition, req.file_ids)

        if not targets:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching files found")

        blocked: list[dict[str, str]] = []
        updated: list[str] = []

        for item in files:
            if item in targets:
                if item["active_recon_jobs"] > 0:
                    blocked.append(
                        {
                            "id": item["id"],
                            "reason": f"存在 {item['active_recon_jobs']} 个重建任务",
                        }
                    )
                    continue

                item["status"] = "ACQUIRED"
                item["is_locked"] = False
                item["retain_until"] = None
                updated.append(item["id"])

        if not updated and blocked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "选中文件无法释放", "blocked": blocked},
            )

        write_json(SCANFILES_FILE, files)
        append_audit(
            "RELEASE",
            {
                "partition": req.partition,
                "file_ids": updated,
                "blocked": blocked,
                "result": "success" if updated else "blocked",
            },
        )

    return {"updated": updated, "blocked": blocked, "count": len(updated)}


@router.delete("/files/purge")
def purge_files(req: FileActionRequest) -> dict[str, Any]:
    ensure_request_has_files(req)

    with lock:
        validate_partition_exists(req.partition)
        files = read_json(SCANFILES_FILE)
        targets = get_target_files(files, req.partition, req.file_ids)

        if not targets:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching files found")

        blocked: list[dict[str, str]] = []
        purged: list[str] = []
        remaining: list[dict[str, Any]] = []

        for item in files:
            if item not in targets:
                remaining.append(item)
                continue

            if item["active_recon_jobs"] > 0:
                blocked.append(
                    {
                        "id": item["id"],
                        "reason": f"存在 {item['active_recon_jobs']} 个重建任务",
                    }
                )
                remaining.append(item)
                continue

            if item["status"] == "RESERVED":
                blocked.append({"id": item["id"], "reason": "文件已保留，请先释放"})
                remaining.append(item)
                continue

            purged.append(item["id"])

        if not purged and blocked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "选中文件无法删除", "blocked": blocked},
            )

        write_json(SCANFILES_FILE, remaining)
        append_audit(
            "PURGE",
            {
                "partition": req.partition,
                "file_ids": purged,
                "blocked": blocked,
                "result": "success" if purged else "blocked",
            },
        )

    return {"purged": purged, "blocked": blocked, "count": len(purged)}


@router.patch("/partitions/{partition_id}/threshold")
def update_partition_threshold(partition_id: str, body: ThresholdUpdate) -> dict[str, Any]:
    with lock:
        partitions = read_json(DISKS_FILE)
        target = next((item for item in partitions if item["id"] == partition_id), None)

        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partition not found")

        target["threshold"] = body.threshold
        write_json(DISKS_FILE, partitions)
        append_audit(
            "UPDATE_THRESHOLD",
            {
                "partition": partition_id,
                "threshold": body.threshold,
                "result": "success",
            },
        )

    return {"partition_id": partition_id, "threshold": body.threshold}


@router.patch("/config")
def update_disk_config(body: ConfigUpdate) -> dict[str, Any]:
    with lock:
        if body.retention_days is not None:
            config["retention_days"] = body.retention_days
        if body.retention_time is not None:
            config["retention_time"] = body.retention_time
        if body.auto_cleanup is not None:
            config["auto_cleanup"] = body.auto_cleanup

        append_audit(
            "UPDATE_CONFIG",
            {
                "config": config,
                "result": "success",
            },
        )

        return config


