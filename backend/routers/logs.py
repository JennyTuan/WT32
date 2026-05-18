"""System and dose logs.

- ``write_system_log`` / ``write_dose_logs_for_session`` are helper functions that
  other backend modules call to emit log entries. They flush within the caller's
  transaction (caller commits).
- The HTTP endpoints below provide read-only access for future UI use; the
  frontend does not consume them yet.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/logs", tags=["logs"])


# ---------------- Helpers (called from other modules) ----------------

def write_system_log(
    db: Session,
    *,
    level: str,
    source: str,
    event: str,
    message: str,
    details: Optional[str] = None,
    scan_session_id: Optional[int] = None,
) -> models.SystemLog:
    """Insert a system log row. Caller owns the commit."""
    entry = models.SystemLog(
        level=level,
        source=source,
        event=event,
        message=message,
        details=details,
        scan_session_id=scan_session_id,
    )
    db.add(entry)
    db.flush()
    return entry


def _series_dose_fields(series: models.ScanSessionSeries) -> dict:
    """Pull dose-relevant fields from whichever param sub-row this series uses."""
    if series.series_type == "topogram" and series.topogram_param:
        p = series.topogram_param
        return {
            "kv": p.kv,
            "ma": p.ma,
            "rotation_time": None,
            "pitch": None,
            "scan_length": p.scan_length,
            "collimator": p.collimator,
            "ctdi_vol": p.ctdi_vol,
            "dlp": p.dlp,
        }
    if series.series_type == "helical" and series.helical_param:
        p = series.helical_param
        return {
            "kv": p.kv,
            "ma": p.ma,
            "rotation_time": p.rotation_time,
            "pitch": p.pitch,
            "scan_length": p.scan_length,
            "collimator": p.collimator,
            "ctdi_vol": p.ctdi_vol,
            "dlp": p.dlp,
        }
    if series.series_type == "axial" and series.axial_param:
        p = series.axial_param
        return {
            "kv": p.kv,
            "ma": p.ma,
            "rotation_time": p.rotation_time,
            "pitch": None,
            "scan_length": p.scan_length,
            "collimator": p.collimator,
            "ctdi_vol": p.ctdi_vol,
            "dlp": p.dlp,
        }
    return {
        "kv": None, "ma": None, "rotation_time": None, "pitch": None,
        "scan_length": None, "collimator": None, "ctdi_vol": None, "dlp": None,
    }


def write_dose_logs_for_session(
    db: Session,
    scan_session: models.ScanSession,
    *,
    scanned_at: Optional[datetime] = None,
) -> list[models.DoseLog]:
    """Emit one DoseLog row per series in the session (skipping series with no
    dose-bearing param). Snapshots patient/protocol/series fields. Caller owns
    the commit."""
    when = scanned_at or datetime.utcnow()
    patient = scan_session.patient
    protocol = scan_session.protocol

    rows: list[models.DoseLog] = []
    for series in scan_session.series:
        fields = _series_dose_fields(series)
        # Skip series with no dose data (e.g. 4d-only or unconfigured)
        if all(fields[k] is None for k in ("kv", "ma", "ctdi_vol", "dlp", "scan_length")):
            continue
        row = models.DoseLog(
            scanned_at=when,
            patient_id=scan_session.patient_id,
            scan_session_id=scan_session.id,
            scan_session_series_id=series.id,
            patient_name_snapshot=patient.name if patient else None,
            patient_id_snapshot=patient.patient_id if patient else None,
            protocol_name_snapshot=protocol.name if protocol else scan_session.name,
            series_order=series.series_order,
            series_type=series.series_type,
            series_label=series.series_label,
            body_part=scan_session.body_part,
            scan_mode=scan_session.scan_mode,
            **fields,
        )
        db.add(row)
        rows.append(row)
    db.flush()
    return rows


# ---------------- Query endpoints (no UI yet) ----------------

@router.get("/system", response_model=list[schemas.SystemLog])
def list_system_logs(
    db: Session = Depends(get_db),
    level: Optional[str] = Query(None, description="Filter by level (DEBUG/INFO/WARNING/ERROR/CRITICAL)"),
    source: Optional[str] = None,
    event: Optional[str] = None,
    scan_session_id: Optional[int] = None,
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    q = db.query(models.SystemLog)
    if level:
        q = q.filter(models.SystemLog.level == level)
    if source:
        q = q.filter(models.SystemLog.source == source)
    if event:
        q = q.filter(models.SystemLog.event == event)
    if scan_session_id is not None:
        q = q.filter(models.SystemLog.scan_session_id == scan_session_id)
    return q.order_by(models.SystemLog.id.desc()).offset(offset).limit(limit).all()


@router.get("/dose", response_model=list[schemas.DoseLog])
def list_dose_logs(
    db: Session = Depends(get_db),
    patient_id: Optional[int] = None,
    patient_id_snapshot: Optional[str] = Query(None, description="Match by snapshotted patient_id string"),
    scan_session_id: Optional[int] = None,
    series_type: Optional[str] = None,
    body_part: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    q = db.query(models.DoseLog)
    if patient_id is not None:
        q = q.filter(models.DoseLog.patient_id == patient_id)
    if patient_id_snapshot:
        q = q.filter(models.DoseLog.patient_id_snapshot == patient_id_snapshot)
    if scan_session_id is not None:
        q = q.filter(models.DoseLog.scan_session_id == scan_session_id)
    if series_type:
        q = q.filter(models.DoseLog.series_type == series_type)
    if body_part:
        q = q.filter(models.DoseLog.body_part == body_part)
    return q.order_by(models.DoseLog.scanned_at.desc(), models.DoseLog.id.desc()).offset(offset).limit(limit).all()
