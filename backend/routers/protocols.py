from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/protocols", tags=["protocols"])


def _protocol_query(db: Session):
    return db.query(models.Protocol).options(
        selectinload(models.Protocol.contrast_config),
        selectinload(models.Protocol.series).selectinload(models.Series.topogram_param),
        selectinload(models.Protocol.series).selectinload(models.Series.helical_param),
        selectinload(models.Protocol.series).selectinload(models.Series.axial_param),
        selectinload(models.Protocol.series).selectinload(models.Series.recon_series),
        selectinload(models.Protocol.series)
        .selectinload(models.Series.fourd_config)
        .selectinload(models.FourDConfig.breathing_training_param),
    )


def _series_query(db: Session):
    return db.query(models.Series).options(
        selectinload(models.Series.topogram_param),
        selectinload(models.Series.helical_param),
        selectinload(models.Series.axial_param),
        selectinload(models.Series.recon_series),
        selectinload(models.Series.fourd_config).selectinload(models.FourDConfig.breathing_training_param),
    )


def _get_protocol_or_404(protocol_id: int, db: Session) -> models.Protocol:
    protocol = _protocol_query(db).filter(models.Protocol.id == protocol_id).first()
    if not protocol:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Protocol not found")
    return protocol


def _get_series_or_404(series_id: int, db: Session) -> models.Series:
    series = _series_query(db).filter(models.Series.id == series_id).first()
    if not series:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Series not found")
    return series


def _get_fourd_config_or_404(config_id: int, db: Session) -> models.FourDConfig:
    config = (
        db.query(models.FourDConfig)
        .options(selectinload(models.FourDConfig.breathing_training_param))
        .filter(models.FourDConfig.id == config_id)
        .first()
    )
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="4D config not found")
    return config


def _get_training_or_404(training_id: int, db: Session) -> models.BreathingTrainingParam:
    training = db.query(models.BreathingTrainingParam).filter(models.BreathingTrainingParam.id == training_id).first()
    if not training:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Breathing training param not found")
    return training


def _validate_series_logic(series: models.Series) -> None:
    if series.series_type == "topogram":
        if series.recon_series:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Topogram series cannot have recon series")
        if series.fourd_config is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Topogram series cannot have 4D config")
    elif series.series_type in {"helical", "axial"}:
        if series.fourd_config is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Helical/Axial series cannot have 4D config")
    elif series.series_type == "4d":
        if series.recon_series:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="4D series cannot have recon series")


@router.get("/series/", response_model=list[schemas.SeriesDetail])
def list_series(db: Session = Depends(get_db)):
    return _series_query(db).order_by(models.Series.protocol_id, models.Series.series_order).all()


@router.get("/series/{series_id}", response_model=schemas.SeriesDetail)
def get_series(series_id: int, db: Session = Depends(get_db)):
    return _get_series_or_404(series_id, db)


@router.post("/series/", response_model=schemas.SeriesDetail, status_code=status.HTTP_201_CREATED)
def create_series(payload: schemas.SeriesCreate, db: Session = Depends(get_db)):
    protocol = _get_protocol_or_404(payload.protocol_id, db)
    if payload.series_type == "4d" and protocol.scan_mode != "4d":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="4D series requires a protocol with scan_mode='4d'")
    series = models.Series(**payload.model_dump())
    db.add(series)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="series_order must be unique within a protocol") from exc
    db.refresh(series)
    return _get_series_or_404(series.id, db)


@router.put("/series/{series_id}", response_model=schemas.SeriesDetail)
def update_series(series_id: int, payload: schemas.SeriesUpdate, db: Session = Depends(get_db)):
    series = _get_series_or_404(series_id, db)
    updates = payload.model_dump(exclude_unset=True)
    if "protocol_id" in updates:
        protocol = _get_protocol_or_404(updates["protocol_id"], db)
    else:
        protocol = _get_protocol_or_404(series.protocol_id, db)
    for field, value in updates.items():
        setattr(series, field, value)
    if series.series_type == "4d" and protocol.scan_mode != "4d":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="4D series requires a protocol with scan_mode='4d'")
    _validate_series_logic(series)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="series_order must be unique within a protocol") from exc
    db.refresh(series)
    return _get_series_or_404(series.id, db)


@router.delete("/series/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_series(series_id: int, db: Session = Depends(get_db)):
    series = _get_series_or_404(series_id, db)
    db.delete(series)
    db.commit()


@router.get("/fourd-configs/", response_model=list[schemas.FourDConfig])
def list_fourd_configs(db: Session = Depends(get_db)):
    return (
        db.query(models.FourDConfig)
        .options(selectinload(models.FourDConfig.breathing_training_param))
        .order_by(models.FourDConfig.id.asc())
        .all()
    )


@router.get("/fourd-configs/{config_id}", response_model=schemas.FourDConfig)
def get_fourd_config(config_id: int, db: Session = Depends(get_db)):
    return _get_fourd_config_or_404(config_id, db)


@router.post("/fourd-configs/", response_model=schemas.FourDConfig, status_code=status.HTTP_201_CREATED)
def create_fourd_config(payload: schemas.FourDConfigCreate, db: Session = Depends(get_db)):
    series = _get_series_or_404(payload.series_id, db)
    if series.series_type != "4d":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="4D config can only be attached to 4d series")
    config = models.FourDConfig(**payload.model_dump())
    db.add(config)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="series_id already has a 4D config") from exc
    db.refresh(config)
    return _get_fourd_config_or_404(config.id, db)


@router.put("/fourd-configs/{config_id}", response_model=schemas.FourDConfig)
def update_fourd_config(config_id: int, payload: schemas.FourDConfigUpdate, db: Session = Depends(get_db)):
    config = _get_fourd_config_or_404(config_id, db)
    updates = payload.model_dump(exclude_unset=True)
    if "series_id" in updates:
        series = _get_series_or_404(updates["series_id"], db)
        if series.series_type != "4d":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="4D config can only be attached to 4d series")
    for field, value in updates.items():
        setattr(config, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="series_id already has a 4D config") from exc
    db.refresh(config)
    return _get_fourd_config_or_404(config.id, db)


@router.delete("/fourd-configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fourd_config(config_id: int, db: Session = Depends(get_db)):
    config = _get_fourd_config_or_404(config_id, db)
    db.delete(config)
    db.commit()


@router.get("/breathing-training/", response_model=list[schemas.BreathingTrainingParam])
def list_breathing_training(db: Session = Depends(get_db)):
    return db.query(models.BreathingTrainingParam).order_by(models.BreathingTrainingParam.id.asc()).all()


@router.get("/breathing-training/{training_id}", response_model=schemas.BreathingTrainingParam)
def get_breathing_training(training_id: int, db: Session = Depends(get_db)):
    return _get_training_or_404(training_id, db)


@router.post("/breathing-training/", response_model=schemas.BreathingTrainingParam, status_code=status.HTTP_201_CREATED)
def create_breathing_training(payload: schemas.BreathingTrainingParamCreate, db: Session = Depends(get_db)):
    _get_fourd_config_or_404(payload.fourd_config_id, db)
    training = models.BreathingTrainingParam(**payload.model_dump())
    db.add(training)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fourd_config_id already has training params") from exc
    db.refresh(training)
    return training


@router.put("/breathing-training/{training_id}", response_model=schemas.BreathingTrainingParam)
def update_breathing_training(training_id: int, payload: schemas.BreathingTrainingParamUpdate, db: Session = Depends(get_db)):
    training = _get_training_or_404(training_id, db)
    updates = payload.model_dump(exclude_unset=True)
    if "fourd_config_id" in updates:
        _get_fourd_config_or_404(updates["fourd_config_id"], db)
    for field, value in updates.items():
        setattr(training, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fourd_config_id already has training params") from exc
    db.refresh(training)
    return training


@router.delete("/breathing-training/{training_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_breathing_training(training_id: int, db: Session = Depends(get_db)):
    training = _get_training_or_404(training_id, db)
    db.delete(training)
    db.commit()


@router.get("/", response_model=list[schemas.ProtocolDetail])
def list_protocols(db: Session = Depends(get_db)):
    return _protocol_query(db).order_by(models.Protocol.id.asc()).all()


@router.get("/{protocol_id}", response_model=schemas.ProtocolDetail)
def get_protocol(protocol_id: int, db: Session = Depends(get_db)):
    return _get_protocol_or_404(protocol_id, db)


@router.post("/", response_model=schemas.ProtocolDetail, status_code=status.HTTP_201_CREATED)
def create_protocol(payload: schemas.ProtocolCreate, db: Session = Depends(get_db)):
    protocol = models.Protocol(**payload.model_dump())
    db.add(protocol)
    db.commit()
    db.refresh(protocol)
    return _get_protocol_or_404(protocol.id, db)


@router.put("/{protocol_id}", response_model=schemas.ProtocolDetail)
def update_protocol(protocol_id: int, payload: schemas.ProtocolUpdate, db: Session = Depends(get_db)):
    protocol = _get_protocol_or_404(protocol_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(protocol, field, value)
    db.commit()
    db.refresh(protocol)
    return _get_protocol_or_404(protocol.id, db)


@router.delete("/{protocol_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_protocol(protocol_id: int, db: Session = Depends(get_db)):
    protocol = _get_protocol_or_404(protocol_id, db)
    db.delete(protocol)
    db.commit()
