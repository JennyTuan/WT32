"""Database-backed data sources for service-mode reports.

These endpoints intentionally report only events and scan records that the
prototype persists today.  Device telemetry such as tube exposure time or
component-life counters is not inferred from scan sessions.
"""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..file_backed_documents import DAILY_QA_KEY, DEFAULT_DISK_MANAGER_STATE, DISK_MANAGER_KEY
from ..persistent_documents import load_document
from .disk_manager import _normalize_audit


router = APIRouter(prefix="/reports", tags=["reports"])


def _day_start(value: date | None) -> datetime | None:
    return datetime.combine(value, time.min, tzinfo=timezone.utc) if value else None


def _day_end(value: date | None) -> datetime | None:
    return datetime.combine(value, time.max, tzinfo=timezone.utc) if value else None


def _completed_sessions_query(db: Session, date_from: date | None, date_to: date | None):
    query = db.query(models.ScanSession).filter(models.ScanSession.completed_at.is_not(None))
    if start := _day_start(date_from):
        query = query.filter(models.ScanSession.completed_at >= start)
    if end := _day_end(date_to):
        query = query.filter(models.ScanSession.completed_at <= end)
    return query


@router.get("/qa")
def list_qa_report_records(
    date_from: date | None = None,
    date_to: date | None = None,
    operator: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Filter persisted daily-QA records without making the browser read a whole document."""
    payload = load_document(db, DAILY_QA_KEY, [])
    records = payload if isinstance(payload, list) else []
    start = str(date_from) if date_from else None
    end = str(date_to) if date_to else None
    term = (search or "").strip().casefold()

    filtered: list[dict[str, Any]] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        record_date = str(record.get("date", ""))
        record_operator = str(record.get("operator", ""))
        if start and record_date < start:
            continue
        if end and record_date > end:
            continue
        if operator and record_operator != operator:
            continue
        if term:
            searchable = " ".join(
                str(record.get(key, "")) for key in ("phantomType", "operator", "deviceName", "judgment")
            ).casefold()
            if term not in searchable:
                continue
        filtered.append(record)

    filtered.sort(key=lambda item: (str(item.get("date", "")), str(item.get("time", ""))), reverse=True)
    operators = sorted({str(item.get("operator", "")) for item in records if isinstance(item, dict) and item.get("operator")})
    return {"items": filtered, "total": len(filtered), "operators": operators}


@router.get("/audit")
def list_report_audit(
    limit: int = Query(2000, ge=1, le=2000),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Expose both persisted audit sources through one report API.

    Disk actions predate the relational audit stream and remain in the
    database-backed disk document. Keeping their original payload avoids
    silently discarding file-operation detail during the migration.
    """
    system_logs = (
        db.query(models.SystemLog)
        .filter(models.SystemLog.source.in_(("scan_sessions", "user_management")))
        .order_by(models.SystemLog.timestamp.desc(), models.SystemLog.id.desc())
        .limit(limit)
        .all()
    )
    disk_state = load_document(db, DISK_MANAGER_KEY, DEFAULT_DISK_MANAGER_STATE)
    disk_rows = disk_state.get("audit", []) if isinstance(disk_state, dict) else []
    normalized_disk = [_normalize_audit(row).model_dump() for row in disk_rows if isinstance(row, dict)]
    normalized_disk.sort(key=lambda row: row["timestamp"], reverse=True)
    return {
        "system_logs": [
            {
                "id": row.id,
                "timestamp": row.timestamp,
                "level": row.level,
                "source": row.source,
                "event": row.event,
                "message": row.message,
                "details": row.details,
                "scan_session_id": row.scan_session_id,
            }
            for row in system_logs
        ],
        "disk_logs": normalized_disk[:limit],
    }


@router.get("/runtime-stats")
def get_runtime_statistics(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return reference statistics derived from completed prototype scan sessions.

    These are workflow records, not real scanner telemetry or component-life
    measurements. Values that need hardware counters are explicitly unavailable.
    """
    today = datetime.now(timezone.utc).date()
    effective_to = date_to or today
    effective_from = date_from or (effective_to - timedelta(days=29))
    sessions = _completed_sessions_query(db, effective_from, effective_to).all()
    total_completed = db.query(models.ScanSession).filter(models.ScanSession.completed_at.is_not(None)).count()

    daily_counts: Counter[str] = Counter()
    scan_mix: Counter[str] = Counter()
    for session in sessions:
        if session.completed_at:
            daily_counts[session.completed_at.date().isoformat()] += 1
        for series in session.series:
            scan_mix[series.series_type] += 1

    days = (effective_to - effective_from).days + 1
    daily = [
        {"date": (effective_from + timedelta(days=offset)).isoformat(), "count": daily_counts[(effective_from + timedelta(days=offset)).isoformat()]}
        for offset in range(max(days, 0))
    ]

    log_query = db.query(models.SystemLog).filter(models.SystemLog.timestamp >= _day_start(effective_from))
    if end := _day_end(effective_to):
        log_query = log_query.filter(models.SystemLog.timestamp <= end)
    log_levels = Counter(level for (level,) in log_query.with_entities(models.SystemLog.level).all())

    return {
        "period": {"from": effective_from.isoformat(), "to": effective_to.isoformat()},
        "completed_scans": len(sessions),
        "completed_scans_all_time": total_completed,
        "scan_mix": dict(scan_mix),
        "daily_scans": daily,
        "alerts": {"errors": log_levels["ERROR"] + log_levels["CRITICAL"], "warnings": log_levels["WARNING"]},
        "telemetry": {
            "power_on_hours": None,
            "tube_exposure_hours": None,
            "component_usage": [],
            "availability_note": "设备工时和部件寿命计数尚未接入模拟遥测数据源。",
        },
    }
