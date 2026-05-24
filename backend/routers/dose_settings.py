from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List

from ..database import get_db
from .. import models, schemas

router = APIRouter(
    prefix="/dose-settings",
    tags=["dose-settings"],
)


def _get_or_create_singleton(db: Session) -> models.DoseSettings:
    row = db.query(models.DoseSettings).filter(models.DoseSettings.id == 1).first()
    if row is None:
        row = models.DoseSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/", response_model=schemas.DoseSettings)
def get_dose_settings(db: Session = Depends(get_db)):
    return _get_or_create_singleton(db)


@router.put("/", response_model=schemas.DoseSettings)
def update_dose_settings(
    payload: schemas.DoseSettingsUpdate,
    db: Session = Depends(get_db),
):
    row = _get_or_create_singleton(db)
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for key, value in data.items():
        setattr(row, key, value)
    row.updated_at = func.now()
    db.commit()
    db.refresh(row)
    return row


@router.get("/drl", response_model=List[schemas.DrlEntry])
def list_drl_entries(db: Session = Depends(get_db)):
    return (
        db.query(models.DrlEntry)
        .order_by(models.DrlEntry.age_group.asc(), models.DrlEntry.body_part.asc())
        .all()
    )


@router.put("/drl", response_model=List[schemas.DrlEntry])
def replace_drl_entries(
    payload: schemas.DrlBulkReplace,
    db: Session = Depends(get_db),
):
    """Replace the full DRL table atomically — caller submits the desired final state."""
    # Validate uniqueness of (body_part, age_group) in payload
    seen: set[tuple[str, str]] = set()
    for entry in payload.entries:
        key = (entry.body_part, entry.age_group)
        if key in seen:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate entry: {entry.body_part} / {entry.age_group}",
            )
        seen.add(key)

    db.query(models.DrlEntry).delete()
    for entry in payload.entries:
        db.add(models.DrlEntry(**entry.model_dump()))
    db.commit()

    return (
        db.query(models.DrlEntry)
        .order_by(models.DrlEntry.age_group.asc(), models.DrlEntry.body_part.asc())
        .all()
    )
