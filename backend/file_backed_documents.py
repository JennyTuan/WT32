"""One-time import of mutable prototype state formerly stored under ``backend/data``.

The source files are retained as read-only migration input and demo assets.  Once
a document exists in the database, application requests never read or write it.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session


DATA_DIR = Path(__file__).resolve().parent / "data"
SYSTEM_SETTINGS_KEY = "system_settings"
ORGANIZATION_INFO_KEY = "organization_info"
DICOM_SETTINGS_KEY = "dicom_settings"
DISK_MANAGER_KEY = "disk_manager"
DAILY_QA_KEY = "daily_qa_records"
AIR_CALIBRATION_KEY = "air_calibration"

DEFAULT_DISK_MANAGER_STATE: dict[str, Any] = {
    "config": {
        "retention_days": 7,
        "retention_time": "00:00",
        "auto_cleanup": False,
    },
    "partitions": [],
    "files": [],
    "audit": [],
}


def _read_json(filename: str, fallback: Any) -> Any:
    path = DATA_DIR / filename
    if not path.exists():
        return fallback
    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def _read_json_lines(filename: str) -> list[dict[str, Any]]:
    path = DATA_DIR / filename
    if not path.exists():
        return []
    entries: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as file:
        for line in file:
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                entries.append(value)
    return entries


def legacy_documents() -> dict[str, Any]:
    return {
        SYSTEM_SETTINGS_KEY: _read_json("system_settings.json", {}),
        ORGANIZATION_INFO_KEY: _read_json("organization_info.json", {}),
        DICOM_SETTINGS_KEY: _read_json("dicom_settings.json", {}),
        DISK_MANAGER_KEY: {
            **DEFAULT_DISK_MANAGER_STATE,
            "partitions": _read_json("disks.json", []),
            "files": _read_json("scanfiles.json", []),
            "audit": _read_json_lines("audit.jsonl"),
        },
        DAILY_QA_KEY: [],
        AIR_CALIBRATION_KEY: {},
    }


def seed_legacy_documents(db: Session, models: Any) -> int:
    """Insert missing documents without overwriting database-owned state."""
    inserted = 0
    for key, payload in legacy_documents().items():
        if db.get(models.PersistentDocument, key) is not None:
            continue
        db.add(models.PersistentDocument(key=key, payload=json.dumps(payload, ensure_ascii=False)))
        inserted += 1
    if inserted:
        db.flush()
    return inserted
