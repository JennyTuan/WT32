from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from . import logs as logs_module
from . import scan_sessions as scan_sessions_module


router = APIRouter(prefix="/scan-sessions", tags=["scan-results"])

FOUR_D_IMAGE_SOURCE_ID = "fourd-engineer"
FOUR_D_IMAGE_SOURCE_VERSION = 1


def _get_bound_four_d_context(
    scan_session_id: int,
    patient_id: int,
    target_series_id: int,
    db: Session,
    *,
    for_update: bool = False,
) -> tuple[models.ScanSession, models.ScanSessionSeries]:
    session_query = db.query(models.ScanSession).filter(models.ScanSession.id == scan_session_id)
    if for_update:
        session_query = session_query.with_for_update()
    scan_session = session_query.one_or_none()
    if scan_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan session not found")
    if scan_session.patient_id != patient_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Patient does not match the scan session",
        )
    if scan_session.acquisition_type != "four_d":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scan session is not a 4D acquisition",
        )

    series_query = db.query(models.ScanSessionSeries).filter(
        models.ScanSessionSeries.id == target_series_id,
        models.ScanSessionSeries.scan_session_id == scan_session.id,
    )
    if for_update:
        series_query = series_query.with_for_update()
    target_series = series_query.one_or_none()
    if target_series is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Target series does not belong to the scan session",
        )
    if target_series.series_type != "4d":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Target series is not a 4D series",
        )
    return scan_session, target_series


def _dump_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _optional_json(value: object | None) -> str | None:
    return None if value is None else _dump_json(value)


def _assert_unique_four_d_target(
    scan_session: models.ScanSession,
    target_series: models.ScanSessionSeries,
) -> None:
    four_d_targets = [
        series for series in scan_session.series if series.series_type == "4d"
    ]
    if len(four_d_targets) != 1 or four_d_targets[0].id != target_series.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="4D result persistence requires exactly one bound 4D target series",
        )


def _assert_unique_running_four_d_target(
    scan_session: models.ScanSession,
    target_series: models.ScanSessionSeries,
) -> None:
    _assert_unique_four_d_target(scan_session, target_series)
    if target_series.execution_status != "running":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The bound 4D target series must be running while its result is edited",
        )


def _get_open_source_attempt(
    db: Session,
    target_series: models.ScanSessionSeries,
) -> models.ScanSessionSeriesAttempt | None:
    return (
        db.query(models.ScanSessionSeriesAttempt)
        .filter(
            models.ScanSessionSeriesAttempt.scan_session_id
            == target_series.scan_session_id,
            models.ScanSessionSeriesAttempt.scan_session_series_id
            == target_series.id,
            models.ScanSessionSeriesAttempt.ended_at.is_(None),
        )
        .order_by(models.ScanSessionSeriesAttempt.attempt_number.desc())
        .first()
    )


def _assert_result_source_attempt_is_current(
    db: Session,
    result: models.ScanSessionFourDResult,
    target_series: models.ScanSessionSeries,
) -> models.ScanSessionSeriesAttempt | None:
    current_attempt = _get_open_source_attempt(db, target_series)
    if result.source_attempt_id is not None and (
        current_attempt is None or current_attempt.id != result.source_attempt_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The 4D result is not bound to the current target-series attempt",
        )
    return current_attempt


def _assert_legal_update_transition(
    result: models.ScanSessionFourDResult,
    payload: schemas.ScanSessionFourDResultUpsert,
) -> None:
    if payload.workflow_stage == "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The ready stage can only be committed by the atomic 4D finalize endpoint",
        )

    if _dump_json(payload.scan_result.model_dump(mode="json")) != result.scan_result_json:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The acquired 4D scan_result snapshot is immutable",
        )

    scan_result = json.loads(result.scan_result_json)
    rescan_occurred = bool(scan_result["rescan_occurred"])
    current_stage = result.workflow_stage
    next_stage = payload.workflow_stage

    if current_stage == "acquired":
        allowed = next_stage == "data_reviewed" or (
            rescan_occurred and next_stage == "rescan_selected"
        )
    elif current_stage == "data_reviewed":
        allowed = next_stage in {"data_reviewed", "phase_selected"}
    elif current_stage == "rescan_selected":
        allowed = rescan_occurred and next_stage in {
            "rescan_selected",
            "phase_selected",
        }
    elif current_stage == "phase_selected":
        # 原子 finalize 前允许版本化修订候选帧，避免恢复后用户修改被静默丢弃。
        allowed = next_stage == "phase_selected"
    else:
        allowed = False

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Illegal 4D result workflow transition: {current_stage} -> "
                f"{next_stage}"
            ),
        )


def _to_response(
    result: models.ScanSessionFourDResult,
    scan_session: models.ScanSession,
) -> schemas.ScanSessionFourDResult:
    return schemas.ScanSessionFourDResult.model_validate(
        {
            "id": result.id,
            "scan_session_id": result.scan_session_id,
            "patient_id": scan_session.patient_id,
            "target_series_id": result.target_series_id,
            "version": result.version,
            "workflow_stage": result.workflow_stage,
            "source_kind": result.source_kind,
            "image_source_id": result.image_source_id,
            "image_source_version": result.image_source_version,
            "source_attempt_id": result.source_attempt_id,
            "scan_result": json.loads(result.scan_result_json),
            "data_review": json.loads(result.data_review_json) if result.data_review_json else None,
            "rescan_choices": json.loads(result.rescan_choices_json) if result.rescan_choices_json else None,
            "phase_selections": json.loads(result.phase_selections_json) if result.phase_selections_json else None,
            "created_at": result.created_at,
            "updated_at": result.updated_at,
        }
    )


def _to_finalize_response(
    db: Session,
    result: models.ScanSessionFourDResult,
    scan_session: models.ScanSession,
    *,
    replayed: bool,
) -> schemas.ScanSessionFourDResultFinalizeResponse:
    return schemas.ScanSessionFourDResultFinalizeResponse(
        replayed=replayed,
        result=_to_response(result, scan_session),
        scan_session=schemas.ScanSessionDetail.model_validate(
            scan_sessions_module._get_scan_session_or_404(scan_session.id, db)
        ),
    )


@router.get("/{scan_session_id}/fourd-result", response_model=schemas.ScanSessionFourDResult)
def get_four_d_result(
    scan_session_id: int,
    patient_id: int = Query(gt=0),
    target_series_id: int = Query(gt=0),
    db: Session = Depends(get_db),
):
    scan_session, _ = _get_bound_four_d_context(
        scan_session_id,
        patient_id,
        target_series_id,
        db,
    )
    result = (
        db.query(models.ScanSessionFourDResult)
        .filter(models.ScanSessionFourDResult.scan_session_id == scan_session.id)
        .one_or_none()
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="4D scan result not found")
    if result.target_series_id != target_series_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stored 4D result is bound to a different target series",
        )
    return _to_response(result, scan_session)


@router.put("/{scan_session_id}/fourd-result", response_model=schemas.ScanSessionFourDResult)
def put_four_d_result(
    scan_session_id: int,
    payload: schemas.ScanSessionFourDResultUpsert,
    db: Session = Depends(get_db),
):
    scan_session, target_series = _get_bound_four_d_context(
        scan_session_id,
        payload.patient_id,
        payload.target_series_id,
        db,
        for_update=True,
    )
    if scan_session.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="4D results can only be persisted while the scan session is in_progress",
        )
    _assert_unique_running_four_d_target(scan_session, target_series)

    result = (
        db.query(models.ScanSessionFourDResult)
        .filter(models.ScanSessionFourDResult.scan_session_id == scan_session.id)
        .with_for_update()
        .one_or_none()
    )
    scan_result_json = _dump_json(payload.scan_result.model_dump(mode="json"))
    data_review_json = _optional_json(
        payload.data_review.model_dump(mode="json") if payload.data_review is not None else None
    )
    rescan_choices_json = _optional_json(payload.rescan_choices)
    phase_selections_json = _optional_json(payload.phase_selections)

    if result is None:
        if payload.expected_version != 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="4D result does not exist; expected_version must be 0 when creating it",
            )
        if payload.workflow_stage != "acquired":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A new 4D result must be created at the acquired workflow stage",
            )
        source_attempt = _get_open_source_attempt(db, target_series)
        result = models.ScanSessionFourDResult(
            scan_session_id=scan_session.id,
            target_series_id=target_series.id,
            version=1,
            workflow_stage="acquired",
            source_kind="simulation",
            image_source_id=FOUR_D_IMAGE_SOURCE_ID,
            image_source_version=FOUR_D_IMAGE_SOURCE_VERSION,
            source_attempt_id=source_attempt.id if source_attempt else None,
            scan_result_json=scan_result_json,
            data_review_json=data_review_json,
            rescan_choices_json=rescan_choices_json,
            phase_selections_json=phase_selections_json,
        )
        db.add(result)
    else:
        if result.target_series_id != target_series.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Stored 4D result is bound to a different target series",
            )
        if result.version != payload.expected_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"4D result version conflict; current version is {result.version}",
            )
        _assert_result_source_attempt_is_current(db, result, target_series)
        _assert_legal_update_transition(result, payload)
        result.version += 1
        result.workflow_stage = payload.workflow_stage
        result.data_review_json = data_review_json
        result.rescan_choices_json = rescan_choices_json
        result.phase_selections_json = phase_selections_json
        result.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A 4D result already exists for this scan session or target series",
        ) from error
    db.refresh(result)
    return _to_response(result, scan_session)


@router.post(
    "/{scan_session_id}/fourd-result/finalize",
    response_model=schemas.ScanSessionFourDResultFinalizeResponse,
)
def finalize_four_d_result(
    scan_session_id: int,
    payload: schemas.ScanSessionFourDResultFinalize,
    db: Session = Depends(get_db),
):
    scan_session, target_series = _get_bound_four_d_context(
        scan_session_id,
        payload.patient_id,
        payload.target_series_id,
        db,
        for_update=True,
    )
    _assert_unique_four_d_target(scan_session, target_series)

    result = (
        db.query(models.ScanSessionFourDResult)
        .filter(models.ScanSessionFourDResult.scan_session_id == scan_session.id)
        .with_for_update()
        .one_or_none()
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="4D scan result not found",
        )
    if result.target_series_id != target_series.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stored 4D result is bound to a different target series",
        )

    # 客户端可能在提交成功后丢失响应；完整终态按绑定关系幂等返回，
    # 不要求重试方预先知道服务端已经递增后的版本号。
    if scan_session.status == "completed":
        if (
            result.workflow_stage == "ready"
            and target_series.execution_status == "image_ready"
        ):
            return _to_finalize_response(
                db,
                result,
                scan_session,
                replayed=True,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Completed 4D session has an inconsistent result or target-series state",
        )

    if scan_session.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only an in_progress 4D scan session can be finalized",
        )
    if result.version != payload.expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"4D result version conflict; current version is {result.version}",
        )
    if result.workflow_stage != "phase_selected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="4D result must be phase_selected before it can be finalized",
        )
    if target_series.execution_status != "running":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The bound 4D target series must be running before finalization",
        )
    _assert_result_source_attempt_is_current(db, result, target_series)

    incomplete_other_series = [
        series
        for series in scan_session.series
        if series.id != target_series.id and series.execution_status != "image_ready"
    ]
    if incomplete_other_series:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="All other planned scan series must be image_ready before 4D finalization",
        )

    completed_at = datetime.now(timezone.utc)
    result.workflow_stage = "ready"
    result.version += 1
    result.updated_at = completed_at
    target_series.execution_status = "image_ready"
    target_series.failure_reason = None
    scan_sessions_module._close_open_series_attempt(
        db,
        target_series,
        outcome="image_ready",
        end_reason="4D post-processing result finalized",
        ended_at=completed_at,
    )
    scan_session.status = "completed"
    scan_session.completed_at = completed_at

    # 4D 原型尚无正式剂量模型；即使会话内定位像带参数，也不生成可能被误读为
    # 实际执行剂量的记录，只在系统日志中明确保留未生成原因。
    dose_log_disposition = "not_emitted_no_formal_4d_dose_model"
    logs_module.write_system_log(
        db,
        level="INFO",
        source="scan_results",
        event="fourd_result_finalized",
        message=(
            f"4D result {result.id} atomically finalized scan session "
            f"{scan_session.id}; dose logs were not emitted because the "
            "prototype has no formal 4D dose model"
        ),
        details=_dump_json(
            {
                "result_id": result.id,
                "result_version": result.version,
                "target_series_id": target_series.id,
                "source_kind": result.source_kind,
                "image_source_id": result.image_source_id,
                "image_source_version": result.image_source_version,
                "source_attempt_id": result.source_attempt_id,
                "dose_log_disposition": dose_log_disposition,
            }
        ),
        scan_session_id=scan_session.id,
    )

    db.commit()
    db.refresh(result)
    db.refresh(scan_session)
    return _to_finalize_response(
        db,
        result,
        scan_session,
        replayed=False,
    )
