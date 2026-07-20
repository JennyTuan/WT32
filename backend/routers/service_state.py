"""Database-backed state for service-mode prototype workflows."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..file_backed_documents import AIR_CALIBRATION_KEY, DAILY_QA_KEY
from ..persistent_documents import load_document, save_document


router = APIRouter(prefix="/service-state", tags=["service-state"])
ALLOWED_KEYS = {DAILY_QA_KEY: [], AIR_CALIBRATION_KEY: {}}


def _default_for(key: str) -> Any:
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=404, detail="Service state not found")
    return ALLOWED_KEYS[key]


@router.get("/{key}")
def get_service_state(key: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"payload": load_document(db, key, _default_for(key))}


@router.put("/{key}")
def put_service_state(
    key: str,
    payload: Any = Body(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    default = _default_for(key)
    if isinstance(default, list) and not isinstance(payload, list):
        raise HTTPException(status_code=422, detail="Payload must be a list")
    if isinstance(default, dict) and not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Payload must be an object")
    save_document(db, key, payload)
    return {"payload": payload}
