from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..database import get_db
from . import logs as logs_module

router = APIRouter(prefix="/scan-sessions", tags=["scan-sessions"])


SESSION_STATUS_SEQUENCE = ["draft", "in_progress", "completed", "cancelled"]

TOPOGRAM_PARAM_FIELDS = (
    "kv",
    "ma",
    "scan_length",
    "tube_angle",
    "fov",
    "collimator",
    "scan_direction",
    "dom",
    "ctdi_vol",
    "dlp",
)
HELICAL_PARAM_FIELDS = (
    "kv",
    "ma",
    "slice_thickness",
    "pitch",
    "rotation_time",
    "scan_length",
    "fov",
    "collimator",
    "scan_direction",
    "dom",
    "ctdi_vol",
    "dlp",
    "auto_ma",
    "ma_min",
    "ma_max",
)
AXIAL_PARAM_FIELDS = (
    "kv",
    "ma",
    "slice_thickness",
    "slice_interval",
    "rotation_time",
    "scan_length",
    "fov",
    "collimator",
    "scan_direction",
    "dom",
    "ctdi_vol",
    "dlp",
    "auto_ma",
    "ma_min",
    "ma_max",
    "step_count",
)
RECON_SERIES_FIELDS = (
    "recon_name",
    "recon_type",
    "kernel",
    "matrix",
    "window_width",
    "window_level",
    "slice_thickness",
    "increment",
    "recon_fov",
    "center_x",
    "center_y",
)


def _copy_fields(source, fields: tuple[str, ...]) -> dict:
    return {field: getattr(source, field) for field in fields}


def _clone_topogram_param(source, *, template_param_id: int | None) -> models.ScanSessionTopogramParam:
    return models.ScanSessionTopogramParam(
        template_param_id=template_param_id,
        **_copy_fields(source, TOPOGRAM_PARAM_FIELDS),
    )


def _clone_helical_param(source, *, template_param_id: int | None) -> models.ScanSessionHelicalParam:
    return models.ScanSessionHelicalParam(
        template_param_id=template_param_id,
        **_copy_fields(source, HELICAL_PARAM_FIELDS),
    )


def _clone_axial_param(source, *, template_param_id: int | None) -> models.ScanSessionAxialParam:
    return models.ScanSessionAxialParam(
        template_param_id=template_param_id,
        **_copy_fields(source, AXIAL_PARAM_FIELDS),
    )


def _clone_recon_series(source, *, template_recon_series_id: int | None) -> models.ScanSessionReconSeries:
    return models.ScanSessionReconSeries(
        template_recon_series_id=template_recon_series_id,
        **_copy_fields(source, RECON_SERIES_FIELDS),
    )


def _scan_session_query(db: Session):
    return db.query(models.ScanSession).options(
        selectinload(models.ScanSession.contrast_config),
        selectinload(models.ScanSession.series).selectinload(models.ScanSessionSeries.topogram_param),
        selectinload(models.ScanSession.series).selectinload(models.ScanSessionSeries.helical_param),
        selectinload(models.ScanSession.series).selectinload(models.ScanSessionSeries.axial_param),
        selectinload(models.ScanSession.series).selectinload(models.ScanSessionSeries.recon_series),
        selectinload(models.ScanSession.series).selectinload(models.ScanSessionSeries.gating_config),
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
            selectinload(models.Protocol.series).selectinload(models.Series.gating_config),
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
        acquisition_type=protocol.acquisition_type,
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
            session_series.topogram_param = _clone_topogram_param(
                series.topogram_param,
                template_param_id=series.topogram_param.id,
            )

        if series.helical_param:
            session_series.helical_param = _clone_helical_param(
                series.helical_param,
                template_param_id=series.helical_param.id,
            )

        if series.axial_param:
            session_series.axial_param = _clone_axial_param(
                series.axial_param,
                template_param_id=series.axial_param.id,
            )

        for recon in series.recon_series:
            session_series.recon_series.append(
                _clone_recon_series(recon, template_recon_series_id=recon.id)
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

        if series.gating_config:
            session_series.gating_config = models.ScanSessionGatingConfig(
                template_config_id=series.gating_config.id,
                breathing_mode=series.gating_config.breathing_mode,
                target_phase=series.gating_config.target_phase,
                threshold_normalized=series.gating_config.threshold_normalized,
                trigger_direction=series.gating_config.trigger_direction,
                wait_timeout_s=series.gating_config.wait_timeout_s,
                trigger_delay_ms=series.gating_config.trigger_delay_ms,
                stability_cv_threshold=series.gating_config.stability_cv_threshold,
                baseline_drift_mm_threshold=series.gating_config.baseline_drift_mm_threshold,
                breath_hold_timeout_s=series.gating_config.breath_hold_timeout_s,
                breath_hold_amplitude_tolerance_mm=series.gating_config.breath_hold_amplitude_tolerance_mm,
            )

        scan_session.series.append(session_series)

    return scan_session


def _apply_updates(entity, updates: dict):
    for field, value in updates.items():
        setattr(entity, field, value)


def _normalize_series_order(scan_session: models.ScanSession):
    ordered_series = sorted(scan_session.series, key=lambda item: (item.series_order, item.id))
    for index, series in enumerate(ordered_series, start=1):
        series.series_order = index


def _normalize_series_order_by_session_id(db: Session, scan_session_id: int) -> None:
    # 删除后关系集合可能仍保留旧对象；从数据库重读剩余序列，避免顺序归一漏掉真实行。
    ordered_series = (
        db.query(models.ScanSessionSeries)
        .filter(models.ScanSessionSeries.scan_session_id == scan_session_id)
        .order_by(models.ScanSessionSeries.series_order.asc(), models.ScanSessionSeries.id.asc())
        .all()
    )
    for index, series in enumerate(ordered_series, start=1):
        series.series_order = index


def _build_session_series_from_payload(payload: schemas.ScanSessionSeriesCreate) -> models.ScanSessionSeries:
    session_series = models.ScanSessionSeries(
        series_order=payload.series_order,
        series_type=payload.series_type,
        series_label=payload.series_label,
        contrast_delay=payload.contrast_delay,
        trigger_mode=payload.trigger_mode,
        tracking_threshold=payload.tracking_threshold,
    )

    if payload.topogram_param:
        topogram = payload.topogram_param.model_dump(exclude_unset=True, exclude={"series_id"})
        session_series.topogram_param = models.ScanSessionTopogramParam(**topogram)

    if payload.helical_param:
        helical = payload.helical_param.model_dump(exclude_unset=True, exclude={"series_id"})
        session_series.helical_param = models.ScanSessionHelicalParam(**helical)

    if payload.axial_param:
        axial = payload.axial_param.model_dump(exclude_unset=True, exclude={"series_id"})
        session_series.axial_param = models.ScanSessionAxialParam(**axial)

    for recon_payload in payload.recon_series:
        recon = recon_payload.model_dump(exclude_unset=True, exclude={"series_id"})
        if "recon_type" not in recon or recon["recon_type"] is None:
            recon["recon_type"] = "soft"
        session_series.recon_series.append(models.ScanSessionReconSeries(**recon))

    return session_series


def _clone_session_series(source: models.ScanSessionSeries) -> models.ScanSessionSeries:
    cloned = models.ScanSessionSeries(
        scan_session_id=source.scan_session_id,
        template_series_id=source.template_series_id,
        series_order=source.series_order,
        series_type=source.series_type,
        series_label=f"{source.series_label} Copy",
        contrast_delay=source.contrast_delay,
        trigger_mode=source.trigger_mode,
        tracking_threshold=source.tracking_threshold,
    )

    if source.topogram_param:
        cloned.topogram_param = _clone_topogram_param(
            source.topogram_param,
            template_param_id=source.topogram_param.template_param_id,
        )

    if source.helical_param:
        cloned.helical_param = _clone_helical_param(
            source.helical_param,
            template_param_id=source.helical_param.template_param_id,
        )

    if source.axial_param:
        cloned.axial_param = _clone_axial_param(
            source.axial_param,
            template_param_id=source.axial_param.template_param_id,
        )

    for recon in source.recon_series:
        cloned.recon_series.append(
            _clone_recon_series(
                recon,
                template_recon_series_id=recon.template_recon_series_id,
            )
        )

    if source.fourd_config:
        cloned_fourd = models.ScanSessionFourDConfig(
            template_config_id=source.fourd_config.template_config_id,
            breathing_mode=source.fourd_config.breathing_mode,
            phase_count=source.fourd_config.phase_count,
            acquisition_time=source.fourd_config.acquisition_time,
            trigger_threshold=source.fourd_config.trigger_threshold,
        )
        if source.fourd_config.breathing_training_param:
            cloned_fourd.breathing_training_param = models.ScanSessionBreathingTrainingParam(
                template_param_id=source.fourd_config.breathing_training_param.template_param_id,
                training_duration=source.fourd_config.breathing_training_param.training_duration,
                target_amplitude=source.fourd_config.breathing_training_param.target_amplitude,
                tolerance_range=source.fourd_config.breathing_training_param.tolerance_range,
            )
        cloned.fourd_config = cloned_fourd

    if source.gating_config:
        cloned.gating_config = models.ScanSessionGatingConfig(
            template_config_id=source.gating_config.template_config_id,
            breathing_mode=source.gating_config.breathing_mode,
            target_phase=source.gating_config.target_phase,
            threshold_normalized=source.gating_config.threshold_normalized,
            trigger_direction=source.gating_config.trigger_direction,
            wait_timeout_s=source.gating_config.wait_timeout_s,
            trigger_delay_ms=source.gating_config.trigger_delay_ms,
            stability_cv_threshold=source.gating_config.stability_cv_threshold,
            baseline_drift_mm_threshold=source.gating_config.baseline_drift_mm_threshold,
            breath_hold_timeout_s=source.gating_config.breath_hold_timeout_s,
            breath_hold_amplitude_tolerance_mm=source.gating_config.breath_hold_amplitude_tolerance_mm,
        )

    return cloned


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


@router.post("/ad-hoc", response_model=schemas.ScanSessionDetail, status_code=status.HTTP_201_CREATED)
def create_ad_hoc_scan_session(payload: schemas.ScanSessionAdHocCreate, db: Session = Depends(get_db)):
    patient = _get_patient_or_404(payload.patient_id, db)
    protocol = _get_protocol_or_404(payload.source_protocol_id, db)

    scan_session = models.ScanSession(
        patient_id=patient.id,
        protocol_id=protocol.id,
        session_name=payload.session_name,
        status="draft",
        name=payload.name,
        body_part=payload.body_part,
        age_group=payload.age_group,
        patient_weight=payload.patient_weight,
        patient_position=payload.patient_position,
        table_direction=payload.table_direction,
        acquisition_type=payload.acquisition_type,
        scan_mode=payload.scan_mode,
        description=payload.description,
    )

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
    if scan_session.status in ("completed", "cancelled"):
        return _get_scan_session_or_404(scan_session.id, db)

    should_emit_start_log = scan_session.started_at is None
    scan_session.status = "in_progress"
    if scan_session.started_at is None:
        scan_session.started_at = datetime.utcnow()
    if should_emit_start_log:
        logs_module.write_system_log(
            db,
            level="INFO",
            source="scan_sessions",
            event="scan_started",
            message=f"Scan session {scan_session.id} started ({scan_session.name})",
            scan_session_id=scan_session.id,
        )
    db.commit()
    db.refresh(scan_session)
    return _get_scan_session_or_404(scan_session.id, db)


@router.post("/{scan_session_id}/complete", response_model=schemas.ScanSessionDetail)
def complete_scan_session(scan_session_id: int, db: Session = Depends(get_db)):
    scan_session = _get_scan_session_or_404(scan_session_id, db)
    if scan_session.status in ("completed", "cancelled"):
        return _get_scan_session_or_404(scan_session.id, db)
    scan_session.status = "completed"
    should_emit_start_log = scan_session.started_at is None
    if scan_session.started_at is None:
        scan_session.started_at = datetime.utcnow()
    scan_session.completed_at = datetime.utcnow()
    if should_emit_start_log:
        logs_module.write_system_log(
            db,
            level="INFO",
            source="scan_sessions",
            event="scan_started",
            message=f"Scan session {scan_session.id} started ({scan_session.name})",
            scan_session_id=scan_session.id,
        )

    dose_rows = logs_module.write_dose_logs_for_session(
        db, scan_session, scanned_at=scan_session.completed_at
    )
    logs_module.write_system_log(
        db,
        level="INFO",
        source="scan_sessions",
        event="scan_completed",
        message=(
            f"Scan session {scan_session.id} completed ({scan_session.name}); "
            f"emitted {len(dose_rows)} dose log(s)"
        ),
        scan_session_id=scan_session.id,
    )
    db.commit()
    db.refresh(scan_session)
    return _get_scan_session_or_404(scan_session.id, db)


@router.post("/{scan_session_id}/cancel", response_model=schemas.ScanSessionDetail)
def cancel_scan_session(scan_session_id: int, db: Session = Depends(get_db)):
    scan_session = _get_scan_session_or_404(scan_session_id, db)
    if scan_session.status in ("completed", "cancelled"):
        return _get_scan_session_or_404(scan_session.id, db)
    scan_session.status = "cancelled"
    logs_module.write_system_log(
        db,
        level="WARNING",
        source="scan_sessions",
        event="scan_cancelled",
        message=f"Scan session {scan_session.id} cancelled ({scan_session.name})",
        scan_session_id=scan_session.id,
    )
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


@router.post("/{scan_session_id}/series", response_model=schemas.ScanSessionDetail, status_code=status.HTTP_201_CREATED)
def create_scan_session_series(scan_session_id: int, payload: schemas.ScanSessionSeriesCreate, db: Session = Depends(get_db)):
    scan_session = _get_scan_session_or_404(scan_session_id, db)
    session_series = _build_session_series_from_payload(payload)
    session_series.scan_session_id = scan_session.id
    db.add(session_series)
    db.flush()
    _normalize_series_order(scan_session)
    db.commit()
    db.refresh(session_series)
    return _get_scan_session_or_404(scan_session.id, db)


@router.put("/series/{session_series_id}", response_model=schemas.ScanSessionSeries)
def update_scan_session_series(session_series_id: int, payload: schemas.ScanSessionSeriesUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionSeries, session_series_id, "Scan session series not found", db)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.post("/series/{session_series_id}/duplicate", response_model=schemas.ScanSessionDetail)
def duplicate_scan_session_series(session_series_id: int, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionSeries, session_series_id, "Scan session series not found", db)
    scan_session = _get_scan_session_or_404(entity.scan_session_id, db)

    cloned = _clone_session_series(entity)
    cloned.series_order = entity.series_order + 1
    db.add(cloned)
    db.flush()

    affected_series = sorted(scan_session.series + [cloned], key=lambda item: (item.series_order, item.id))
    for index, series in enumerate(affected_series, start=1):
        series.series_order = index

    db.commit()
    db.refresh(cloned)
    return _get_scan_session_or_404(entity.scan_session_id, db)


@router.delete("/series/{session_series_id}", response_model=schemas.ScanSessionDetail)
def delete_scan_session_series(session_series_id: int, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.ScanSessionSeries, session_series_id, "Scan session series not found", db)
    scan_session_id = entity.scan_session_id

    db.delete(entity)
    db.flush()
    _normalize_series_order_by_session_id(db, scan_session_id)
    db.commit()
    return _get_scan_session_or_404(scan_session_id, db)


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


@router.post("/series/{session_series_id}/recon-series", response_model=schemas.ScanSessionDetail, status_code=status.HTTP_201_CREATED)
def create_scan_session_recon_series(session_series_id: int, payload: schemas.ScanSessionReconSeriesCreate, db: Session = Depends(get_db)):
    series = _get_entity_or_404(models.ScanSessionSeries, session_series_id, "Scan session series not found", db)
    recon = models.ScanSessionReconSeries(
        scan_session_series_id=series.id,
        **payload.model_dump(),
    )
    db.add(recon)
    db.commit()
    return _get_scan_session_or_404(series.scan_session_id, db)


@router.delete("/recon-series/{recon_id}", response_model=schemas.ScanSessionDetail)
def delete_scan_session_recon_series(recon_id: int, db: Session = Depends(get_db)):
    recon = _get_entity_or_404(models.ScanSessionReconSeries, recon_id, "Scan session recon series not found", db)
    series = _get_entity_or_404(models.ScanSessionSeries, recon.scan_session_series_id, "Scan session series not found", db)
    scan_session_id = series.scan_session_id
    db.delete(recon)
    db.commit()
    return _get_scan_session_or_404(scan_session_id, db)


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
