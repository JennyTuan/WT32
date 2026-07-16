from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..database import get_db
from . import logs as logs_module

router = APIRouter(prefix="/scan-sessions", tags=["scan-sessions"])


SESSION_STATUS_SEQUENCE = ["draft", "in_progress", "completed", "cancelled"]
DEPENDENT_LOCALIZER_SERIES_TYPES = {"helical", "axial", "4d"}
TERMINAL_SESSION_STATUSES = {"completed", "cancelled"}
SERIES_IMAGE_SOURCES_BY_TYPE = {
    "topogram": {
        "head-stroke-topogram",
        "head-dual-scout-demo",
        "limbs-helical-demo",
        "qin-lung-topogram",
        "fourd-scout-demo",
    },
    "helical": {
        "brain-helical-demo",
        "limbs-helical-demo",
        "qin-lung-helical-demo",
    },
    "axial": set(),
    "4d": set(),
}

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


def _lock_scan_session_and_series(
    scan_session_id: int,
    db: Session,
) -> models.ScanSession:
    """Lock a session before its series so lifecycle writers share one order."""
    scan_session = (
        db.query(models.ScanSession)
        .filter(models.ScanSession.id == scan_session_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if not scan_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan session not found",
        )
    (
        db.query(models.ScanSessionSeries)
        .filter(models.ScanSessionSeries.scan_session_id == scan_session_id)
        .order_by(
            models.ScanSessionSeries.series_order.asc(),
            models.ScanSessionSeries.id.asc(),
        )
        .populate_existing()
        .with_for_update()
        .all()
    )
    # 等待会话锁之前可能已加载关系；主动过期，避免生命周期检查复用旧快照。
    db.expire(scan_session, ["series"])
    return scan_session


def _assert_scan_session_mutable(
    scan_session: models.ScanSession,
    resource: str,
) -> None:
    if scan_session.status in TERMINAL_SESSION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Terminal scan session cannot modify {resource}",
        )


def _lock_scan_session_for_mutation(
    scan_session_id: int,
    db: Session,
    resource: str,
) -> models.ScanSession:
    """先取得生命周期锁，再判断写操作是否允许。"""
    scan_session = _lock_scan_session_and_series(scan_session_id, db)
    _assert_scan_session_mutable(scan_session, resource)
    return scan_session


def _get_series_ref_or_404(
    session_series_id: int,
    db: Session,
) -> tuple[int, int]:
    ref = (
        db.query(
            models.ScanSessionSeries.scan_session_id,
            models.ScanSessionSeries.id,
        )
        .filter(models.ScanSessionSeries.id == session_series_id)
        .first()
    )
    if not ref:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan session series not found",
        )
    return ref.scan_session_id, ref.id


def _get_child_series_ref_or_404(
    model,
    entity_id: int,
    detail: str,
    db: Session,
) -> tuple[int, int]:
    ref = (
        db.query(
            models.ScanSessionSeries.scan_session_id,
            models.ScanSessionSeries.id,
        )
        .join(
            model,
            model.scan_session_series_id == models.ScanSessionSeries.id,
        )
        .filter(model.id == entity_id)
        .first()
    )
    if not ref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return ref.scan_session_id, ref.id


def _lock_series_for_mutation(
    scan_session_id: int,
    session_series_id: int,
    db: Session,
    resource: str,
    *,
    require_pending: bool = False,
    forbid_four_d_result: bool = False,
) -> tuple[models.ScanSession, models.ScanSessionSeries]:
    scan_session = _lock_scan_session_for_mutation(
        scan_session_id,
        db,
        resource,
    )
    series = (
        db.query(models.ScanSessionSeries)
        .filter(
            models.ScanSessionSeries.id == session_series_id,
            models.ScanSessionSeries.scan_session_id == scan_session.id,
        )
        .populate_existing()
        .first()
    )
    if not series:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan session series not found",
        )
    if require_pending and series.execution_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{resource.capitalize()} can only be modified while its scan "
                "series is pending; use a formal workflow recovery action first"
            ),
        )
    if forbid_four_d_result:
        result_exists = (
            db.query(models.ScanSessionFourDResult.id)
            .filter(models.ScanSessionFourDResult.target_series_id == series.id)
            .first()
            is not None
        )
        if result_exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A series with a persisted 4D result cannot be structurally modified",
            )
    return scan_session, series


def _assert_session_series_structure_mutable(
    scan_session: models.ScanSession,
    db: Session,
) -> None:
    protected_series = [
        series
        for series in scan_session.series
        if series.execution_status in {"running", "image_ready"}
    ]
    if protected_series:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Series structure cannot change while a series is running or image_ready; "
                "use a formal workflow recovery action first"
            ),
        )
    if (
        db.query(models.ScanSessionFourDResult.id)
        .filter(models.ScanSessionFourDResult.scan_session_id == scan_session.id)
        .first()
        is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Series structure cannot change after a 4D result has been persisted",
        )


def _assert_no_running_series(scan_session: models.ScanSession, action: str) -> None:
    if any(series.execution_status == "running" for series in scan_session.series):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Running scan series must be settled before the session can be {action}",
        )


def _assert_all_series_image_ready(scan_session: models.ScanSession) -> None:
    incomplete_series = [
        series
        for series in scan_session.series
        if series.execution_status != "image_ready"
    ]
    if not scan_session.series or incomplete_series:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="All planned scan series must be image_ready before the session can be completed",
        )


def _required_topogram(series: models.ScanSessionSeries) -> models.ScanSessionSeries | None:
    if series.series_type not in DEPENDENT_LOCALIZER_SERIES_TYPES or not series.scan_session:
        return None
    preceding = [
        candidate
        for candidate in series.scan_session.series
        if candidate.series_type == "topogram" and candidate.series_order < series.series_order
    ]
    return max(preceding, key=lambda candidate: candidate.series_order, default=None)


def _parameter_values_changed(entity, updates: dict) -> bool:
    return any(getattr(entity, field) != value for field, value in updates.items())


def _invalidate_range_confirmation_for_parameter_change(
    series: models.ScanSessionSeries,
) -> None:
    topogram = series if series.series_type == "topogram" else _required_topogram(series)
    if topogram and topogram.range_confirmed:
        # 参数快照变化后，旧定位范围不得继续解锁后续模拟扫描。
        topogram.range_confirmed = False


def _clear_series_image_source(series: models.ScanSessionSeries) -> None:
    series.image_source_id = None
    series.image_source_version = None


def _apply_series_execution_update(
    series: models.ScanSessionSeries,
    payload: schemas.ScanSessionSeriesExecutionUpdate,
) -> None:
    updates = payload.model_dump(exclude_unset=True)
    next_status = updates.get("execution_status")
    current_status = series.execution_status
    scan_session = series.scan_session
    source_fields_present = (
        "image_source_id" in updates or "image_source_version" in updates
    )

    if scan_session and scan_session.status in TERMINAL_SESSION_STATUSES and (
        next_status is not None
        or updates.get("range_confirmed") is not None
        or updates.get("failure_reason") is not None
        or source_fields_present
    ):
        # 终态会话的序列执行快照不可再写入，即使请求看似是状态重放。
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Terminal scan session cannot change series execution or range state",
        )

    if updates.get("failure_reason") is not None and next_status not in {"failed", "interrupted"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="failure_reason is only valid when execution_status is failed or interrupted",
        )

    if source_fields_present and series.series_type == "4d":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="4D image provenance is stored with the persisted 4D result",
        )

    if source_fields_present and updates.get("image_source_id") not in SERIES_IMAGE_SOURCES_BY_TYPE.get(
        series.series_type,
        set(),
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Series image source is not compatible with the series type",
        )

    if source_fields_present and not (
        current_status == "running" and next_status == "image_ready"
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Series image source can only be registered during the "
                "running -> image_ready transition"
            ),
        )

    if source_fields_present and series.image_source_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registered series image source is immutable",
        )

    if next_status is not None and next_status != current_status:
        allowed_next_statuses = {
            "pending": {"running"},
            "running": {"image_ready", "failed", "interrupted"},
            "image_ready": set(),
            "failed": set(),
            "interrupted": set(),
        }.get(current_status, set())
        if next_status not in allowed_next_statuses:
            detail = (
                "Use return_to_edit or retry_series to reset a scan series"
                if next_status == "pending" or current_status in {"failed", "interrupted"}
                else f"Invalid scan series execution transition: {current_status} -> {next_status}"
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=detail,
            )

    if next_status == current_status and next_status in {"failed", "interrupted"}:
        replay_reason = updates.get("failure_reason")
        if replay_reason is not None and replay_reason.strip() != series.failure_reason:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Execution status replay must keep the original failure reason",
            )

    if next_status == "running" and (
        not scan_session or scan_session.status != "in_progress"
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scan session must be in_progress before a series can run",
        )

    if updates.get("range_confirmed") is True:
        if series.series_type != "topogram":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only a topogram series can confirm a scan range",
            )
        if series.execution_status != "image_ready" and next_status != "image_ready":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Topogram image is not ready; scan range cannot be confirmed",
            )

    status_changed = next_status is not None and next_status != current_status

    if next_status == "running" and status_changed:
        required_topogram = _required_topogram(series)
        if required_topogram and (
            required_topogram.execution_status != "image_ready"
            or not required_topogram.range_confirmed
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Required topogram image and confirmed scan range are not available",
            )
        series.failure_reason = None
        _clear_series_image_source(series)
        if series.series_type == "topogram":
            # 定位像重扫时，旧的范围确认不能继续解锁后续序列。
            series.range_confirmed = False

    if next_status == "image_ready" and status_changed:
        series.failure_reason = None
        if source_fields_present:
            series.image_source_id = updates["image_source_id"]
            series.image_source_version = updates["image_source_version"]
        else:
            # 没有登记受控来源时明确表示本次序列影像不可用，不回退到静态演示影像。
            _clear_series_image_source(series)

    if next_status in {"failed", "interrupted"} and status_changed:
        default_reason = (
            "Series execution interrupted"
            if next_status == "interrupted"
            else "Series execution failed"
        )
        series.failure_reason = (updates.get("failure_reason") or default_reason).strip()
        _clear_series_image_source(series)
        if series.series_type == "topogram":
            series.range_confirmed = False

    if "range_confirmed" in updates:
        series.range_confirmed = updates["range_confirmed"]
    if next_status is not None:
        series.execution_status = next_status


def _open_series_attempt(
    db: Session,
    series: models.ScanSessionSeries,
) -> models.ScanSessionSeriesAttempt:
    open_attempt = (
        db.query(models.ScanSessionSeriesAttempt)
        .filter(
            models.ScanSessionSeriesAttempt.scan_session_series_id == series.id,
            models.ScanSessionSeriesAttempt.ended_at.is_(None),
        )
        .order_by(models.ScanSessionSeriesAttempt.attempt_number.desc())
        .first()
    )
    if open_attempt:
        return open_attempt

    latest_attempt = (
        db.query(models.ScanSessionSeriesAttempt)
        .filter(models.ScanSessionSeriesAttempt.scan_session_series_id == series.id)
        .order_by(models.ScanSessionSeriesAttempt.attempt_number.desc())
        .first()
    )
    attempt = models.ScanSessionSeriesAttempt(
        scan_session_id=series.scan_session_id,
        scan_session_series_id=series.id,
        attempt_number=(latest_attempt.attempt_number + 1 if latest_attempt else 1),
        started_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    return attempt


def _close_open_series_attempt(
    db: Session,
    series: models.ScanSessionSeries,
    *,
    outcome: str,
    end_reason: str,
    ended_by_action: models.ScanSessionWorkflowAction | None = None,
    ended_at: datetime | None = None,
) -> models.ScanSessionSeriesAttempt | None:
    attempt = (
        db.query(models.ScanSessionSeriesAttempt)
        .filter(
            models.ScanSessionSeriesAttempt.scan_session_series_id == series.id,
            models.ScanSessionSeriesAttempt.ended_at.is_(None),
        )
        .order_by(models.ScanSessionSeriesAttempt.attempt_number.desc())
        .first()
    )
    if not attempt:
        return None

    attempt.ended_at = ended_at or datetime.now(timezone.utc)
    attempt.outcome = outcome
    attempt.end_reason = end_reason
    attempt.ended_by_action = ended_by_action
    return attempt


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
    scan_session = _lock_scan_session_for_mutation(
        scan_session_id,
        db,
        "session metadata",
    )
    _assert_no_running_series(scan_session, "modified")
    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] != scan_session.status:
        # 生命周期只能经 start/complete/cancel 入口变更，避免绕过日志和终态保护。
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scan session status must be changed through its lifecycle endpoint",
        )
    _apply_updates(scan_session, updates)
    db.commit()
    db.refresh(scan_session)
    return _get_scan_session_or_404(scan_session.id, db)


@router.post("/{scan_session_id}/start", response_model=schemas.ScanSessionDetail)
def start_scan_session(scan_session_id: int, db: Session = Depends(get_db)):
    scan_session = _lock_scan_session_and_series(scan_session_id, db)
    if scan_session.status in TERMINAL_SESSION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Terminal scan session cannot be started",
        )

    should_emit_start_log = scan_session.started_at is None
    scan_session.status = "in_progress"
    if scan_session.started_at is None:
        scan_session.started_at = datetime.now(timezone.utc)
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
    scan_session = _lock_scan_session_and_series(scan_session_id, db)
    if scan_session.status == "completed":
        return _get_scan_session_or_404(scan_session.id, db)
    if scan_session.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled scan session cannot be completed",
        )
    if scan_session.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scan session must be in_progress before it can be completed",
        )
    if scan_session.acquisition_type == "four_d":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "4D scan session must be completed through "
                f"POST /api/scan-sessions/{scan_session.id}/fourd-result/finalize"
            ),
        )
    _assert_all_series_image_ready(scan_session)
    scan_session.status = "completed"
    scan_session.completed_at = datetime.now(timezone.utc)

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
    scan_session = _lock_scan_session_and_series(scan_session_id, db)
    if scan_session.status == "cancelled":
        return _get_scan_session_or_404(scan_session.id, db)
    if scan_session.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Completed scan session cannot be cancelled",
        )
    _assert_no_running_series(scan_session, "cancelled")
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
    detail = "Scan session contrast config not found"
    ref = (
        db.query(models.ScanSessionContrastConfig.scan_session_id)
        .filter(models.ScanSessionContrastConfig.id == config_id)
        .first()
    )
    if not ref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    scan_session = _lock_scan_session_for_mutation(
        ref.scan_session_id,
        db,
        "contrast configuration",
    )
    _assert_no_running_series(scan_session, "modified")
    entity = (
        db.query(models.ScanSessionContrastConfig)
        .filter(models.ScanSessionContrastConfig.id == config_id)
        .populate_existing()
        .first()
    )
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.post("/{scan_session_id}/series", response_model=schemas.ScanSessionDetail, status_code=status.HTTP_201_CREATED)
def create_scan_session_series(scan_session_id: int, payload: schemas.ScanSessionSeriesCreate, db: Session = Depends(get_db)):
    scan_session = _lock_scan_session_for_mutation(
        scan_session_id,
        db,
        "series structure",
    )
    _assert_session_series_structure_mutable(scan_session, db)
    session_series = _build_session_series_from_payload(payload)
    session_series.scan_session_id = scan_session.id
    db.add(session_series)
    db.flush()
    # 结构守卫已加载过 relationship；按数据库重读可确保新插入序列也参与归一。
    _normalize_series_order_by_session_id(db, scan_session.id)
    db.commit()
    db.refresh(session_series)
    return _get_scan_session_or_404(scan_session.id, db)


@router.put("/series/{session_series_id}", response_model=schemas.ScanSessionSeries)
def update_scan_session_series(session_series_id: int, payload: schemas.ScanSessionSeriesUpdate, db: Session = Depends(get_db)):
    scan_session_id, locked_series_id = _get_series_ref_or_404(
        session_series_id,
        db,
    )
    _, entity = _lock_series_for_mutation(
        scan_session_id,
        locked_series_id,
        db,
        "series metadata",
        require_pending=True,
        forbid_four_d_result=True,
    )
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/series/{session_series_id}/execution", response_model=schemas.ScanSessionSeries)
def update_scan_session_series_execution(
    session_series_id: int,
    payload: schemas.ScanSessionSeriesExecutionUpdate,
    db: Session = Depends(get_db),
):
    series_ref = (
        db.query(
            models.ScanSessionSeries.id,
            models.ScanSessionSeries.scan_session_id,
        )
        .filter(models.ScanSessionSeries.id == session_series_id)
        .first()
    )
    if not series_ref:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan session series not found",
        )
    # 与会话级动作采用相同的锁顺序，避免并发执行更新和终止动作交错提交。
    _lock_scan_session_and_series(series_ref.scan_session_id, db)
    entity = (
        db.query(models.ScanSessionSeries)
        .filter(models.ScanSessionSeries.id == session_series_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if not entity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan session series not found",
        )
    previous_status = entity.execution_status
    requested_status = payload.execution_status
    if (
        entity.scan_session.acquisition_type == "four_d"
        and entity.series_type == "4d"
        and previous_status == "running"
        and requested_status == "image_ready"
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "4D target series must be finalized through "
                f"POST /api/scan-sessions/{entity.scan_session_id}/fourd-result/finalize"
            ),
        )
    _apply_series_execution_update(entity, payload)
    next_status = entity.execution_status
    if previous_status != "running" and next_status == "running":
        _open_series_attempt(db, entity)
    elif previous_status == "running" and next_status != "running":
        end_reason = {
            "image_ready": "Series image became ready",
            "failed": entity.failure_reason or "Series execution failed",
            "interrupted": entity.failure_reason or "Series execution interrupted",
        }.get(next_status, f"Series execution ended with status {next_status}")
        _close_open_series_attempt(
            db,
            entity,
            outcome=next_status,
            end_reason=end_reason,
        )
    db.commit()
    db.refresh(entity)
    return entity


@router.post("/series/{session_series_id}/duplicate", response_model=schemas.ScanSessionDetail)
def duplicate_scan_session_series(session_series_id: int, db: Session = Depends(get_db)):
    scan_session_id, locked_series_id = _get_series_ref_or_404(
        session_series_id,
        db,
    )
    scan_session = _lock_scan_session_for_mutation(
        scan_session_id,
        db,
        "series structure",
    )
    _assert_session_series_structure_mutable(scan_session, db)
    entity = (
        db.query(models.ScanSessionSeries)
        .filter(
            models.ScanSessionSeries.id == locked_series_id,
            models.ScanSessionSeries.scan_session_id == scan_session.id,
        )
        .populate_existing()
        .first()
    )
    if not entity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan session series not found",
        )

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
    scan_session_id, locked_series_id = _get_series_ref_or_404(
        session_series_id,
        db,
    )
    scan_session = _lock_scan_session_for_mutation(
        scan_session_id,
        db,
        "series structure",
    )
    _assert_session_series_structure_mutable(scan_session, db)
    entity = (
        db.query(models.ScanSessionSeries)
        .filter(
            models.ScanSessionSeries.id == locked_series_id,
            models.ScanSessionSeries.scan_session_id == scan_session.id,
        )
        .populate_existing()
        .first()
    )
    if not entity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan session series not found",
        )

    db.delete(entity)
    db.flush()
    _normalize_series_order_by_session_id(db, scan_session_id)
    db.commit()
    return _get_scan_session_or_404(scan_session_id, db)


@router.put("/topogram/{param_id}", response_model=schemas.ScanSessionTopogramParam)
def update_scan_session_topogram_param(param_id: int, payload: schemas.ScanSessionTopogramParamUpdate, db: Session = Depends(get_db)):
    detail = "Scan session topogram param not found"
    scan_session_id, session_series_id = _get_child_series_ref_or_404(
        models.ScanSessionTopogramParam,
        param_id,
        detail,
        db,
    )
    _, series = _lock_series_for_mutation(
        scan_session_id,
        session_series_id,
        db,
        "topogram parameters",
        require_pending=True,
    )
    entity = (
        db.query(models.ScanSessionTopogramParam)
        .filter(models.ScanSessionTopogramParam.id == param_id)
        .populate_existing()
        .first()
    )
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    updates = payload.model_dump(exclude_unset=True)
    if _parameter_values_changed(entity, updates):
        _invalidate_range_confirmation_for_parameter_change(series)
    _apply_updates(entity, updates)
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/helical/{param_id}", response_model=schemas.ScanSessionHelicalParam)
def update_scan_session_helical_param(param_id: int, payload: schemas.ScanSessionHelicalParamUpdate, db: Session = Depends(get_db)):
    detail = "Scan session helical param not found"
    scan_session_id, session_series_id = _get_child_series_ref_or_404(
        models.ScanSessionHelicalParam,
        param_id,
        detail,
        db,
    )
    _, series = _lock_series_for_mutation(
        scan_session_id,
        session_series_id,
        db,
        "helical parameters",
        require_pending=True,
    )
    entity = (
        db.query(models.ScanSessionHelicalParam)
        .filter(models.ScanSessionHelicalParam.id == param_id)
        .populate_existing()
        .first()
    )
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    updates = payload.model_dump(exclude_unset=True)
    if _parameter_values_changed(entity, updates):
        _invalidate_range_confirmation_for_parameter_change(series)
    _apply_updates(entity, updates)
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/axial/{param_id}", response_model=schemas.ScanSessionAxialParam)
def update_scan_session_axial_param(param_id: int, payload: schemas.ScanSessionAxialParamUpdate, db: Session = Depends(get_db)):
    detail = "Scan session axial param not found"
    scan_session_id, session_series_id = _get_child_series_ref_or_404(
        models.ScanSessionAxialParam,
        param_id,
        detail,
        db,
    )
    _, series = _lock_series_for_mutation(
        scan_session_id,
        session_series_id,
        db,
        "axial parameters",
        require_pending=True,
    )
    entity = (
        db.query(models.ScanSessionAxialParam)
        .filter(models.ScanSessionAxialParam.id == param_id)
        .populate_existing()
        .first()
    )
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    updates = payload.model_dump(exclude_unset=True)
    if _parameter_values_changed(entity, updates):
        _invalidate_range_confirmation_for_parameter_change(series)
    _apply_updates(entity, updates)
    db.commit()
    db.refresh(entity)
    return entity


@router.post("/series/{session_series_id}/recon-series", response_model=schemas.ScanSessionDetail, status_code=status.HTTP_201_CREATED)
def create_scan_session_recon_series(session_series_id: int, payload: schemas.ScanSessionReconSeriesCreate, db: Session = Depends(get_db)):
    scan_session_id, locked_series_id = _get_series_ref_or_404(
        session_series_id,
        db,
    )
    _, series = _lock_series_for_mutation(
        scan_session_id,
        locked_series_id,
        db,
        "reconstruction configuration",
        require_pending=True,
    )
    recon = models.ScanSessionReconSeries(
        scan_session_series_id=series.id,
        **payload.model_dump(),
    )
    db.add(recon)
    db.commit()
    return _get_scan_session_or_404(series.scan_session_id, db)


@router.delete("/recon-series/{recon_id}", response_model=schemas.ScanSessionDetail)
def delete_scan_session_recon_series(recon_id: int, db: Session = Depends(get_db)):
    detail = "Scan session recon series not found"
    scan_session_id, session_series_id = _get_child_series_ref_or_404(
        models.ScanSessionReconSeries,
        recon_id,
        detail,
        db,
    )
    _, series = _lock_series_for_mutation(
        scan_session_id,
        session_series_id,
        db,
        "reconstruction configuration",
        require_pending=True,
    )
    recon = (
        db.query(models.ScanSessionReconSeries)
        .filter(models.ScanSessionReconSeries.id == recon_id)
        .populate_existing()
        .first()
    )
    if not recon:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    scan_session_id = series.scan_session_id
    db.delete(recon)
    db.commit()
    return _get_scan_session_or_404(scan_session_id, db)


@router.put("/recon-series/{recon_id}", response_model=schemas.ScanSessionReconSeries)
def update_scan_session_recon_series(recon_id: int, payload: schemas.ScanSessionReconSeriesUpdate, db: Session = Depends(get_db)):
    detail = "Scan session recon series not found"
    scan_session_id, session_series_id = _get_child_series_ref_or_404(
        models.ScanSessionReconSeries,
        recon_id,
        detail,
        db,
    )
    _lock_series_for_mutation(
        scan_session_id,
        session_series_id,
        db,
        "reconstruction configuration",
        require_pending=True,
    )
    entity = (
        db.query(models.ScanSessionReconSeries)
        .filter(models.ScanSessionReconSeries.id == recon_id)
        .populate_existing()
        .first()
    )
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/fourd-configs/{config_id}", response_model=schemas.ScanSessionFourDConfig)
def update_scan_session_fourd_config(config_id: int, payload: schemas.ScanSessionFourDConfigUpdate, db: Session = Depends(get_db)):
    detail = "Scan session 4D config not found"
    scan_session_id, session_series_id = _get_child_series_ref_or_404(
        models.ScanSessionFourDConfig,
        config_id,
        detail,
        db,
    )
    _lock_series_for_mutation(
        scan_session_id,
        session_series_id,
        db,
        "4D configuration",
        require_pending=True,
    )
    entity = (
        db.query(models.ScanSessionFourDConfig)
        .filter(models.ScanSessionFourDConfig.id == config_id)
        .populate_existing()
        .first()
    )
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity


@router.put("/breathing-training/{training_id}", response_model=schemas.ScanSessionBreathingTrainingParam)
def update_scan_session_breathing_training(training_id: int, payload: schemas.ScanSessionBreathingTrainingParamUpdate, db: Session = Depends(get_db)):
    detail = "Scan session breathing training param not found"
    ref = (
        db.query(
            models.ScanSessionSeries.scan_session_id,
            models.ScanSessionSeries.id,
        )
        .join(
            models.ScanSessionFourDConfig,
            models.ScanSessionFourDConfig.scan_session_series_id
            == models.ScanSessionSeries.id,
        )
        .join(
            models.ScanSessionBreathingTrainingParam,
            models.ScanSessionBreathingTrainingParam.scan_session_fourd_config_id
            == models.ScanSessionFourDConfig.id,
        )
        .filter(models.ScanSessionBreathingTrainingParam.id == training_id)
        .first()
    )
    if not ref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    _lock_series_for_mutation(
        ref.scan_session_id,
        ref.id,
        db,
        "breathing training parameters",
        require_pending=True,
    )
    entity = (
        db.query(models.ScanSessionBreathingTrainingParam)
        .filter(models.ScanSessionBreathingTrainingParam.id == training_id)
        .populate_existing()
        .first()
    )
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    _apply_updates(entity, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entity)
    return entity
