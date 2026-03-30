from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/scan-sessions", tags=["scan-sessions"])


SESSION_STATUS_SEQUENCE = ["draft", "in_progress", "completed", "cancelled"]


def _scan_session_query(db: Session):
    return db.query(models.ScanSession).options(
        selectinload(models.ScanSession.contrast_config),
        selectinload(models.ScanSession.series).selectinload(models.ScanSessionSeries.topogram_param),
        selectinload(models.ScanSession.series).selectinload(models.ScanSessionSeries.helical_param),
        selectinload(models.ScanSession.series).selectinload(models.ScanSessionSeries.axial_param),
        selectinload(models.ScanSession.series).selectinload(models.ScanSessionSeries.recon_series),
        selectinload(models.ScanSession.series)
        .selectinload(models.ScanSessionSeries.fourd_config)
        .selectinload(models.ScanSessionFourDConfig.breathing_training_param),
    )


def _get_scan_session_or_404(scan_session_id: int, db: Session) -> models.ScanSession:
    session = _scan_session_query(db).filter(models.ScanSession.id == scan_session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan session not found")
    return session


def _get_protocol_or_404(protocol_id: int, db: Session) -> models.Protocol:
    protocol = (
        db.query(models.Protocol)
        .options(
            selectinload(models.Protocol.contrast_config),
            selectinload(models.Protocol.series).selectinload(models.Series.topogram_param),
            selectinload(models.Protocol.series).selectinload(models.Series.helical_param),
            selectinload(models.Protocol.series).selectinload(models.Series.axial_param),
            selectinload(models.Protocol.series).selectinload(models.Series.recon_series),
            selectinload(models.Protocol.series)
            .selectinload(models.Series.fourd_config)
            .selectinload(models.FourDConfig.breathing_training_param),
        )
        .filter(models.Protocol.id == protocol_id)
        .first()
    )
    if not protocol:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Protocol not found")
    return protocol


def _get_patient_or_404(patient_id: int, db: Session) -> models.Patient:
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


def _get_entity_or_404(model, entity_id: int, detail: str, db: Session):
    entity = db.query(model).filter(model.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return entity


def _clone_session_from_protocol(patient: models.Patient, protocol: models.Protocol, payload: schemas.ScanSessionCreate) -> models.ScanSession:
    scan_session = models.ScanSession(
        patient_id=patient.id,
        protocol_id=protocol.id,
        session_name=payload.session_name,
        status="draft",
        name=protocol.name,
        body_part=protocol.body_part,
        age_group=protocol.age_group,
        patient_weight=protocol.patient_weight,
        patient_position=protocol.patient_position,
        table_direction=protocol.table_direction,
        scan_mode=protocol.scan_mode,
        description=protocol.description,
    )

    if protocol.contrast_config:
        scan_session.contrast_config = models.ScanSessionContrastConfig(
            template_contrast_config_id=protocol.contrast_config.id,
            contrast_agent=protocol.contrast_config.contrast_agent,
            concentration=protocol.contrast_config.concentration,
            total_volume=protocol.contrast_config.total_volume,
            injection_rate=protocol.contrast_config.injection_rate,
            saline_volume=protocol.contrast_config.saline_volume,
            saline_rate=protocol.contrast_config.saline_rate,
        )

    for series in protocol.series:
        session_series = models.ScanSessionSeries(
            template_series_id=series.id,
            series_order=series.series_order,
            series_type=series.series_type,
            series_label=series.series_label,
            contrast_delay=series.contrast_delay,
            trigger_mode=series.trigger_mode,
            tracking_threshold=series.tracking_threshold,
        )

        if series.topogram_param:
            session_series.topogram_param = models.ScanSessionTopogramParam(
                template_param_id=series.topogram_param.id,
                kv=series.topogram_param.kv,
                ma=series.topogram_param.ma,
                scan_length=series.topogram_param.scan_length,
                tube_angle=series.topogram_param.tube_angle,
                fov=series.topogram_param.fov,
                ctdi_vol=series.topogram_param.ctdi_vol,
                dlp=series.topogram_param.dlp,
            )

        if series.helical_param:
            session_series.helical_param = models.ScanSessionHelicalParam(
                template_param_id=series.helical_param.id,
                kv=series.helical_param.kv,
                ma=series.helical_param.ma,
                slice_thickness=series.helical_param.slice_thickness,
                pitch=series.helical_param.pitch,
                rotation_time=series.helical_param.rotation_time,
                scan_length=series.helical_param.scan_length,
                fov=series.helical_param.fov,
                ctdi_vol=series.helical_param.ctdi_vol,
                dlp=series.helical_param.dlp,
                auto_ma=series.helical_param.auto_ma,
                ma_min=series.helical_param.ma_min,
                ma_max=series.helical_param.ma_max,
            )

        if series.axial_param:
            session_series.axial_param = models.ScanSessionAxialParam(
                template_param_id=series.axial_param.id,
                kv=series.axial_param.kv,
                ma=series.axial_param.ma,
                slice_thickness=series.axial_param.slice_thickness,
                slice_interval=series.axial_param.slice_interval,
                rotation_time=series.axial_param.rotation_time,
                scan_length=series.axial_param.scan_length,
                fov=series.axial_param.fov,
                ctdi_vol=series.axial_param.ctdi_vol,
                dlp=series.axial_param.dlp,
                auto_ma=series.axial_param.auto_ma,
                ma_min=series.axial_param.ma_min,
                ma_max=series.axial_param.ma_max,
                step_count=series.axial_param.step_count,
            )

        for recon in series.recon_series:
            session_series.recon_series.append(
                models.ScanSessionReconSeries(
                    template_recon_series_id=recon.id,
                    recon_name=recon.recon_name,
                    recon_type=recon.recon_type,
                    kernel=recon.kernel,
                    matrix=recon.matrix,
                    window_width=recon.window_width,
                    window_level=recon.window_level,
                    slice_thickness=recon.slice_thickness,
                    increment=recon.increment,
                )
            )

        if series.fourd_config:
            fourd_config = models.ScanSessionFourDConfig(
                template_config_id=series.fourd_config.id,
                breathing_mode=series.fourd_config.breathing_mode,
                phase_count=series.fourd_config.phase_count,
                acquisition_time=series.fourd_config.acquisition_time,
                trigger_threshold=series.fourd_config.trigger_threshold,
            )
            if series.fourd_config.breathing_training_param:
                fourd_config.breathing_training_param = models.ScanSessionBreathingTrainingParam(
                    template_param_id=series.fourd_config.breathing_training_param.id,
                    training_duration=series.fourd_config.breathing_training_param.training_duration,
                    target_amplitude=series.fourd_config.breathing_training_param.target_amplitude,
                    tolerance_range=series.fourd_config.breathing_training_param.tolerance_range,
                )
            session_series.fourd_config = fourd_config

        scan_session.series.append(session_series)

    return scan_session


def _apply_updates(entity, updates: dict):
    for field, value in updates.items():
        setattr(entity, field, value)


@router.get("/", response_model=list[schemas.ScanSessionSummary])
def list_scan_sessions(db: Session = Depends(get_db)):
    return _scan_session_query(db).order_by(models.ScanSession.created_at.desc(), models.ScanSession.id.desc()).all()


@router.get("/{scan_session_id}", response_model=schemas.ScanSessionDetail)
def get_scan_session(scan_session_id: int, db: Session = Depends(get_db)):
    return _get_scan_session_or_404(scan_session_id, db)


@router.post("/", response_model=schemas.ScanSessionDetail, status_code=status.HTTP_201_CREATED)
def create_scan_session(payload: schemas.ScanSessionCreate, db: Session = Depends(get_db)):
    patient = _get_patient_or_404(payload.patient_id, db)
    protocol = _get_protocol_or_404(payload.protocol_id, db)
    scan_session = _clone_session_from_protocol(patient, protocol, payload)
    db.add(scan_session)
    db.commit()
    db.refresh(scan_session)
    return _get_scan_session_or_404(scan_session.id, db)


@router.put("/{scan_session_id}", response_model=schemas.ScanSessionDetail)
def update_scan_session(scan_session_id: int, payload: schemas.ScanSessionUpdate, db: Session = Depends(get_db)):
    scan_session = _get_scan_session_or_404(scan_session_id, db)
    updates = payload.model_dump(exclude_unset=True)
    _apply_updates(scan_session, updates)
    db.commit()
    db.refresh(scan_session)
    return _get_scan_session_or_404(scan_session.id, db)


@router.post("/{scan_session_id}/start", response_model=schemas.ScanSessionDetail)
def start_scan_session(scan_session_id: int, db: Session = Depends(get_db)):
    scan_session = _get_scan_session_or_404(scan_session_id, db)
    scan_session.status = "in_progress"
    scan_session.started_at = datetime.utcnow()
    db.commit()
    db.refresh(scan_session)
    return _get_scan_session_or_404(scan_session.id, db)


@router.post("/{scan_session_id}/complete", response_model=schemas.ScanSessionDetail)
def complete_scan_session(scan_session_id: int, db: Session = Depends(get_db)):
    scan_session = _get_scan_session_or_404(scan_session_id, db)
    scan_session.status = "completed"
    if scan_session.started_at is None:
        scan_session.started_at = datetime.utcnow()
    scan_session.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(scan_session)
    return _get_scan_session_or_404(scan_session.id, db)


@router.post("/{scan_session_id}/cancel", response_model=schemas.ScanSessionDetail)
def cancel_scan_session(scan_session_id: int, db: Session = Depends(get_db)):
    scan_session = _get_scan_session_or_404(scan_session_id, db)
    scan_session.status = "cancelled"
    db.commit()
    db.refresh(scan_session)
    return _get_scan_session_or_404(scan_session.id, db)


@router.put("/contrast-configs/{config_id}", response_model=schemas.ScanSessionContrastConfig)
def update_scan_session_contrast_config(config_id: int, payload: schemas.ScanSessionContrastConfigUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionContrastConfig, config_id, "Scan session contrast config not found", db)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/series/{session_series_id}", response_model=schemas.ScanSessionSeries)
def update_scan_session_series(session_series_id: int, payload: schemas.ScanSessionSeriesUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionSeries, session_series_id, "Scan session series not found", db)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/topogram/{param_id}", response_model=schemas.ScanSessionTopogramParam)
def update_scan_session_topogram_param(param_id: int, payload: schemas.ScanSessionTopogramParamUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionTopogramParam, param_id, "Scan session topogram param not found", db)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/helical/{param_id}", response_model=schemas.ScanSessionHelicalParam)
def update_scan_session_helical_param(param_id: int, payload: schemas.ScanSessionHelicalParamUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionHelicalParam, param_id, "Scan session helical param not found", db)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/axial/{param_id}", response_model=schemas.ScanSessionAxialParam)
def update_scan_session_axial_param(param_id: int, payload: schemas.ScanSessionAxialParamUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionAxialParam, param_id, "Scan session axial param not found", db)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/recon-series/{recon_id}", response_model=schemas.ScanSessionReconSeries)
def update_scan_session_recon_series(recon_id: int, payload: schemas.ScanSessionReconSeriesUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionReconSeries, recon_id, "Scan session recon series not found", db)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/fourd-configs/{config_id}", response_model=schemas.ScanSessionFourDConfig)
def update_scan_session_fourd_config(config_id: int, payload: schemas.ScanSessionFourDConfigUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionFourDConfig, config_id, "Scan session 4D config not found", db)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/breathing-training/{training_id}", response_model=schemas.ScanSessionBreathingTrainingParam)
def update_scan_session_breathing_training(training_id: int, payload: schemas.ScanSessionBreathingTrainingParamUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionBreathingTrainingParam, training_id, "Scan session breathing training param not found", db)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity
