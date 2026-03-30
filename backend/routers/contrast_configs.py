from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/contrast-configs", tags=["contrast-configs"])


def _get_protocol_or_404(protocol_id: int, db: Session) -> models.Protocol:
    protocol = db.query(models.Protocol).filter(models.Protocol.id == protocol_id).first()
    if not protocol:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Protocol not found")
    return protocol


def _get_config_or_404(config_id: int, db: Session) -> models.ContrastConfig:
    config = db.query(models.ContrastConfig).filter(models.ContrastConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrast config not found")
    return config


@router.get("/", response_model=list[schemas.ContrastConfig])
def list_contrast_configs(db: Session = Depends(get_db)):
    return db.query(models.ContrastConfig).order_by(models.ContrastConfig.id.asc()).all()


@router.get("/{config_id}", response_model=schemas.ContrastConfig)
def get_contrast_config(config_id: int, db: Session = Depends(get_db)):
    return _get_config_or_404(config_id, db)


@router.post("/", response_model=schemas.ContrastConfig, status_code=status.HTTP_201_CREATED)
def create_contrast_config(payload: schemas.ContrastConfigCreate, db: Session = Depends(get_db)):
    protocol = _get_protocol_or_404(payload.protocol_id, db)
    if protocol.scan_mode != "contrast":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contrast config requires a contrast protocol")
    config = models.ContrastConfig(**payload.model_dump())
    db.add(config)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="protocol already has a contrast config") from exc
    db.refresh(config)
    return config


@router.put("/{config_id}", response_model=schemas.ContrastConfig)
def update_contrast_config(config_id: int, payload: schemas.ContrastConfigUpdate, db: Session = Depends(get_db)):
    config = _get_config_or_404(config_id, db)
    updates = payload.model_dump(exclude_unset=True)
    if "protocol_id" in updates:
        protocol = _get_protocol_or_404(updates["protocol_id"], db)
        if protocol.scan_mode != "contrast":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contrast config requires a contrast protocol")
    for field, value in updates.items():
        setattr(config, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="protocol already has a contrast config") from exc
    db.refresh(config)
    return config


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contrast_config(config_id: int, db: Session = Depends(get_db)):
    config = _get_config_or_404(config_id, db)
    db.delete(config)
    db.commit()
