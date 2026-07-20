from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..database import CSV_PROTOCOL_DESCRIPTION_PREFIX, PROTOCOL_SEEDS, get_db

router = APIRouter(prefix="/protocols", tags=["protocols"])

CURRENT_CSV_PROTOCOL_DESCRIPTIONS = {
    str(protocol_seed.get("description", ""))
    for protocol_seed in PROTOCOL_SEEDS
    if str(protocol_seed.get("description", "")).startswith(CSV_PROTOCOL_DESCRIPTION_PREFIX)
}


def _csv_protocol_order(description: str | None) -> int | None:
    value = str(description or "")
    if not value.startswith(CSV_PROTOCOL_DESCRIPTION_PREFIX):
        return None
    source = value[len(CSV_PROTOCOL_DESCRIPTION_PREFIX):].split(":", 1)[0]
    first_index = source.split(",", 1)[0]
    try:
        return int(first_index)
    except ValueError:
        return None


def _normalize_protocol_classification(values: dict) -> dict:
    acquisition_type = values.get("acquisition_type")
    scan_mode = values.get("scan_mode")
    is_4d = values.get("is_4d")
    is_enhance = values.get("is_enhance")

    if acquisition_type is None:
        if is_4d is True or scan_mode == "4d":
            acquisition_type = "four_d"
        else:
            acquisition_type = "regular"

    if acquisition_type == "four_d":
        scan_mode = "4d"
        is_4d = True
    else:
        is_4d = False
        if is_enhance is True or scan_mode == "contrast":
            scan_mode = "contrast"
            is_enhance = True
        else:
            scan_mode = "plain"
            is_enhance = False

    values["acquisition_type"] = acquisition_type
    values["scan_mode"] = scan_mode
    values["is_4d"] = is_4d
    values["is_enhance"] = is_enhance
    return values


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


def _protocol_catalog_query(db: Session):
    return db.query(models.Protocol).options(selectinload(models.Protocol.series))


def _protocol_dose_reference_query(db: Session):
    return db.query(models.Protocol).options(
        selectinload(models.Protocol.series).selectinload(models.Series.topogram_param),
        selectinload(models.Protocol.series).selectinload(models.Series.helical_param),
        selectinload(models.Protocol.series).selectinload(models.Series.axial_param),
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


def _build_protocol_summary(protocol: models.Protocol) -> schemas.ProtocolSummary:
    supported_modes: list[str] = []
    seen_modes: set[str] = set()

    for series in protocol.series:
        mode = series.series_type
        if mode in seen_modes:
            continue
        seen_modes.add(mode)
        supported_modes.append(mode)

    return schemas.ProtocolSummary.model_validate(
        {
            "id": protocol.id,
            "name": protocol.name,
            "body_part": protocol.body_part,
            "age_group": protocol.age_group,
            "patient_weight": protocol.patient_weight,
            "patient_position": protocol.patient_position,
            "table_direction": protocol.table_direction,
            "acquisition_type": protocol.acquisition_type,
            "scan_mode": protocol.scan_mode,
            "description": protocol.description,
            "is_factory": protocol.is_factory,
            "is_enabled": protocol.is_enabled,
            "created_at": protocol.created_at,
            "updated_at": protocol.updated_at,
            "csv_order": _csv_protocol_order(protocol.description),
            "is_4d": protocol.is_4d,
            "is_enhance": protocol.is_enhance,
            "series_count": len(protocol.series),
            "supported_modes": supported_modes,
        }
    )


@router.get("/series/", response_model=list[schemas.SeriesDetail])
def list_series(db: Session = Depends(get_db)):
    return _series_query(db).order_by(models.Series.protocol_id, models.Series.series_order).all()


@router.get("/series/{series_id}", response_model=schemas.SeriesDetail)
def get_series(series_id: int, db: Session = Depends(get_db)):
    return _get_series_or_404(series_id, db)


@router.post("/series/", response_model=schemas.SeriesDetail, status_code=status.HTTP_201_CREATED)
def create_series(payload: schemas.SeriesCreate, db: Session = Depends(get_db)):
    protocol = _get_protocol_or_404(payload.protocol_id, db)
    if payload.series_type == "4d" and protocol.acquisition_type != "four_d":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="4D series requires a protocol with acquisition_type='four_d'")
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
    if series.series_type == "4d" and protocol.acquisition_type != "four_d":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="4D series requires a protocol with acquisition_type='four_d'")
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


@router.get("/catalog", response_model=list[schemas.ProtocolSummary])
def list_protocol_catalog(db: Session = Depends(get_db)):
    protocols = _protocol_catalog_query(db).order_by(models.Protocol.id.asc()).all()
    visible_protocols: list[models.Protocol] = []
    for protocol in protocols:
        description = str(protocol.description or "")
        if protocol.is_factory:
            if description.startswith(CSV_PROTOCOL_DESCRIPTION_PREFIX):
                if description not in CURRENT_CSV_PROTOCOL_DESCRIPTIONS:
                    continue
            else:
                continue
        # Hide a legacy bad seed that was incorrectly stored as plain mode while
        # sharing the same display name as the real 4D chest protocol.
        if protocol.body_part == "chest" and protocol.name == "胸腔4D" and protocol.scan_mode == "plain":
            continue
        visible_protocols.append(protocol)
    return [_build_protocol_summary(protocol) for protocol in visible_protocols]


@router.get("/dose-reference", response_model=list[schemas.ProtocolDoseReference])
def list_protocol_dose_references(db: Session = Depends(get_db)):
    """Return only the template fields needed to estimate historical log doses."""
    return _protocol_dose_reference_query(db).order_by(models.Protocol.id.asc()).all()


@router.get("/{protocol_id}", response_model=schemas.ProtocolDetail)
def get_protocol(protocol_id: int, db: Session = Depends(get_db)):
    return _get_protocol_or_404(protocol_id, db)


@router.post("/", response_model=schemas.ProtocolDetail, status_code=status.HTTP_201_CREATED)
def create_protocol(payload: schemas.ProtocolCreate, db: Session = Depends(get_db)):
    protocol = models.Protocol(**_normalize_protocol_classification(payload.model_dump()))
    db.add(protocol)
    db.commit()
    db.refresh(protocol)
    return _get_protocol_or_404(protocol.id, db)


@router.put("/{protocol_id}", response_model=schemas.ProtocolDetail)
def update_protocol(protocol_id: int, payload: schemas.ProtocolUpdate, db: Session = Depends(get_db)):
    protocol = _get_protocol_or_404(protocol_id, db)
    if protocol.is_factory:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Factory protocols cannot be modified")
    updates = _normalize_protocol_classification(
        {
            "acquisition_type": protocol.acquisition_type,
            "scan_mode": protocol.scan_mode,
            "is_4d": protocol.is_4d,
            "is_enhance": protocol.is_enhance,
            **payload.model_dump(exclude_unset=True),
        }
    )
    for field, value in updates.items():
        setattr(protocol, field, value)
    protocol.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(protocol)
    return _get_protocol_or_404(protocol.id, db)


@router.patch("/{protocol_id}/toggle-enabled", response_model=schemas.ProtocolDetail)
def toggle_protocol_enabled(protocol_id: int, db: Session = Depends(get_db)):
    protocol = _get_protocol_or_404(protocol_id, db)
    if protocol.is_factory:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Factory protocols cannot be modified")
    protocol.is_enabled = not protocol.is_enabled
    protocol.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(protocol)
    return _get_protocol_or_404(protocol.id, db)


@router.post("/full", response_model=schemas.ProtocolDetail, status_code=status.HTTP_201_CREATED)
def create_protocol_full(payload: schemas.ProtocolCreateWithSeries, db: Session = Depends(get_db)):
    # 1. Create Protocol
    protocol_data = payload.model_dump(exclude={"series"})
    protocol = models.Protocol(**_normalize_protocol_classification(protocol_data))
    db.add(protocol)
    db.flush()  # Get protocol.id

    # 2. Add Series
    for s_data in payload.series:
        s_dict = s_data.model_dump(exclude={"topogram_param", "helical_param", "axial_param", "recon_series"})
        series = models.Series(**s_dict, protocol_id=protocol.id)
        db.add(series)
        db.flush()

        # Add single params
        if s_data.topogram_param:
            db.add(models.TopogramParam(**s_data.topogram_param.model_dump(exclude={"series_id"}), series_id=series.id))
        if s_data.helical_param:
            db.add(models.HelicalParam(**s_data.helical_param.model_dump(exclude={"series_id"}), series_id=series.id))
        if s_data.axial_param:
            db.add(models.AxialParam(**s_data.axial_param.model_dump(exclude={"series_id"}), series_id=series.id))
        
        # Add recons
        for r_data in s_data.recon_series:
            db.add(models.ReconSeries(**r_data.model_dump(exclude={"series_id"}), series_id=series.id))

    db.commit()
    db.refresh(protocol)
    return _get_protocol_or_404(protocol.id, db)


@router.put("/{protocol_id}/full", response_model=schemas.ProtocolDetail)
def update_protocol_full(protocol_id: int, payload: schemas.ProtocolCreateWithSeries, db: Session = Depends(get_db)):
    protocol = _get_protocol_or_404(protocol_id, db)
    if protocol.is_factory:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Factory protocols cannot be modified")

    # 1. Update basic fields
    protocol_data = _normalize_protocol_classification(
        {
            "acquisition_type": protocol.acquisition_type,
            "scan_mode": protocol.scan_mode,
            "is_4d": protocol.is_4d,
            "is_enhance": protocol.is_enhance,
            **payload.model_dump(exclude={"series"}, exclude_unset=True),
        }
    )
    for field, value in protocol_data.items():
        setattr(protocol, field, value)
    protocol.updated_at = datetime.now(timezone.utc)

    # 2. Replace series (Simplest for prototype: delete and recreate)
    # Use ORM delete to ensure cascade is triggered for SQLite without PRAGMA foreign_keys=ON
    existing_series = db.query(models.Series).filter(models.Series.protocol_id == protocol.id).all()
    for es in existing_series:
        db.delete(es)
    db.flush()
    
    for s_data in payload.series:
        s_dict = s_data.model_dump(exclude={"topogram_param", "helical_param", "axial_param", "recon_series"})
        series = models.Series(**s_dict, protocol_id=protocol.id)
        db.add(series)
        db.flush()

        if s_data.topogram_param:
            db.add(models.TopogramParam(**s_data.topogram_param.model_dump(exclude={"series_id"}), series_id=series.id))
        if s_data.helical_param:
            db.add(models.HelicalParam(**s_data.helical_param.model_dump(exclude={"series_id"}), series_id=series.id))
        if s_data.axial_param:
            db.add(models.AxialParam(**s_data.axial_param.model_dump(exclude={"series_id"}), series_id=series.id))
        
        for r_data in s_data.recon_series:
            db.add(models.ReconSeries(**r_data.model_dump(exclude={"series_id"}), series_id=series.id))

    db.commit()
    db.refresh(protocol)
    return _get_protocol_or_404(protocol.id, db)
