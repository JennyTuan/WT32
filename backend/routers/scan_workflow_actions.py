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


router = APIRouter(prefix="/scan-sessions", tags=["scan-workflow-actions"])


def _find_action(
    db: Session,
    scan_session_id: int,
    action_id: str,
) -> models.ScanSessionWorkflowAction | None:
    return (
        db.query(models.ScanSessionWorkflowAction)
        .filter(
            models.ScanSessionWorkflowAction.scan_session_id == scan_session_id,
            models.ScanSessionWorkflowAction.action_id == action_id,
        )
        .first()
    )


def _assert_replay_matches(
    existing: models.ScanSessionWorkflowAction,
    payload: schemas.ScanSessionWorkflowActionCreate,
) -> None:
    if (
        existing.action_type != payload.action
        or existing.target_series_id != payload.target_series_id
        or existing.reason != payload.reason
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ACTION_ID_CONFLICT",
                "message": "action_id was already used with a different workflow action payload",
            },
        )


def _build_response(
    db: Session,
    action: models.ScanSessionWorkflowAction,
    *,
    replayed: bool,
) -> schemas.ScanSessionWorkflowActionResponse:
    scan_session = scan_sessions_module._get_scan_session_or_404(
        action.scan_session_id,
        db,
    )
    return schemas.ScanSessionWorkflowActionResponse(
        replayed=replayed,
        action=schemas.ScanSessionWorkflowAction.model_validate(action),
        scan_session=schemas.ScanSessionDetail.model_validate(scan_session),
    )


def _get_target_series(
    scan_session: models.ScanSession,
    target_series_id: int | None,
) -> models.ScanSessionSeries | None:
    if target_series_id is None:
        return None
    target = next(
        (series for series in scan_session.series if series.id == target_series_id),
        None,
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target scan series does not belong to this scan session",
        )
    return target


def _create_action_record(
    scan_session: models.ScanSession,
    payload: schemas.ScanSessionWorkflowActionCreate,
    *,
    target: models.ScanSessionSeries | None,
    next_entry: str,
) -> models.ScanSessionWorkflowAction:
    return models.ScanSessionWorkflowAction(
        action_id=payload.action_id,
        scan_session_id=scan_session.id,
        target_series_id=target.id if target else None,
        action_type=payload.action,
        reason=payload.reason,
        resulting_session_status=scan_session.status,
        resulting_series_status=target.execution_status if target else None,
        next_entry=next_entry,
        dose_log_disposition="not_emitted",
    )


def _write_action_log(
    db: Session,
    scan_session: models.ScanSession,
    action: models.ScanSessionWorkflowAction,
    *,
    level: str,
    prior_session_status: str,
    prior_series_status: str | None,
    interrupted_series_ids: list[int] | None = None,
    invalidated_four_d_result: dict[str, object] | None = None,
) -> None:
    details = {
        "action_id": action.action_id,
        "action": action.action_type,
        "target_series_id": action.target_series_id,
        "reason": action.reason,
        "prior_session_status": prior_session_status,
        "resulting_session_status": action.resulting_session_status,
        "prior_series_status": prior_series_status,
        "resulting_series_status": action.resulting_series_status,
        "next_entry": action.next_entry,
        # 动作本身不代表一次完成采集，因此不凭参数快照生成剂量记录。
        "dose_log_disposition": action.dose_log_disposition,
    }
    if interrupted_series_ids is not None:
        details["interrupted_series_ids"] = interrupted_series_ids
    if invalidated_four_d_result is not None:
        details["invalidated_four_d_result"] = invalidated_four_d_result
    logs_module.write_system_log(
        db,
        level=level,
        source="scan_workflow_actions",
        event=f"workflow_{action.action_type}",
        message=(
            f"Workflow action {action.action_type} applied to scan session "
            f"{scan_session.id}"
        ),
        details=json.dumps(details, ensure_ascii=False),
        scan_session_id=scan_session.id,
    )


def _invalidate_stale_four_d_result(
    db: Session,
    scan_session: models.ScanSession,
    target: models.ScanSessionSeries,
) -> dict[str, object] | None:
    if scan_session.acquisition_type != "four_d" or target.series_type != "4d":
        return None
    result = (
        db.query(models.ScanSessionFourDResult)
        .filter(
            models.ScanSessionFourDResult.scan_session_id == scan_session.id,
            models.ScanSessionFourDResult.target_series_id == target.id,
        )
        .one_or_none()
    )
    if result is None:
        return None

    audit_snapshot: dict[str, object] = {
        "result_id": result.id,
        "result_version": result.version,
        "workflow_stage": result.workflow_stage,
        "source_attempt_id": result.source_attempt_id,
        "disposition": "deleted_before_new_attempt",
    }
    # 单结果模型无法同时保留旧结果与新 attempt；动作日志保留失效快照，
    # 原结果在同一事务内删除，避免后续恢复永久绑定到旧 attempt。
    db.delete(result)
    return audit_snapshot


def _return_to_edit(
    db: Session,
    scan_session: models.ScanSession,
    target: models.ScanSessionSeries,
    payload: schemas.ScanSessionWorkflowActionCreate,
) -> models.ScanSessionWorkflowAction:
    if scan_session.status in {"completed", "cancelled"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Terminal scan session cannot return a series to editing",
        )
    if target.execution_status not in {"pending", "running", "failed", "interrupted"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a pending, running, failed, or interrupted series can return to editing",
        )

    prior_session_status = scan_session.status
    prior_series_status = target.execution_status
    invalidated_four_d_result = _invalidate_stale_four_d_result(
        db,
        scan_session,
        target,
    )
    target.execution_status = "pending"
    target.failure_reason = None
    scan_sessions_module._clear_series_image_source(target)

    # 返回参数编辑会使原范围确认失效，必须在再次执行前重新确认。
    localizer = (
        target
        if target.series_type == "topogram"
        else scan_sessions_module._required_topogram(target)
    )
    if localizer:
        localizer.range_confirmed = False

    action = _create_action_record(
        scan_session,
        payload,
        target=target,
        next_entry="series_edit",
    )
    db.add(action)
    if prior_series_status == "running":
        scan_sessions_module._close_open_series_attempt(
            db,
            target,
            outcome="returned_to_edit",
            end_reason=payload.reason,
            ended_by_action=action,
        )
    _write_action_log(
        db,
        scan_session,
        action,
        level="INFO",
        prior_session_status=prior_session_status,
        prior_series_status=prior_series_status,
        invalidated_four_d_result=invalidated_four_d_result,
    )
    return action


def _retry_series(
    db: Session,
    scan_session: models.ScanSession,
    target: models.ScanSessionSeries,
    payload: schemas.ScanSessionWorkflowActionCreate,
) -> models.ScanSessionWorkflowAction:
    if scan_session.status in {"completed", "cancelled"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Terminal scan session cannot retry a series",
        )
    if target.execution_status not in {"failed", "interrupted"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a failed or interrupted series can be retried",
        )

    prior_session_status = scan_session.status
    prior_series_status = target.execution_status
    invalidated_four_d_result = _invalidate_stale_four_d_result(
        db,
        scan_session,
        target,
    )
    target.execution_status = "pending"
    target.failure_reason = None
    scan_sessions_module._clear_series_image_source(target)
    if target.series_type == "topogram":
        target.range_confirmed = False

    action = _create_action_record(
        scan_session,
        payload,
        target=target,
        next_entry="series_confirm",
    )
    db.add(action)
    _write_action_log(
        db,
        scan_session,
        action,
        level="INFO",
        prior_session_status=prior_session_status,
        prior_series_status=prior_series_status,
        invalidated_four_d_result=invalidated_four_d_result,
    )
    return action


def _terminate_exam(
    db: Session,
    scan_session: models.ScanSession,
    target: models.ScanSessionSeries | None,
    payload: schemas.ScanSessionWorkflowActionCreate,
) -> models.ScanSessionWorkflowAction:
    if scan_session.status in {"completed", "cancelled"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Terminal scan session cannot be terminated again with a new action_id",
        )

    prior_session_status = scan_session.status
    prior_series_status = target.execution_status if target else None
    interrupted_series = [
        series for series in scan_session.series if series.execution_status == "running"
    ]
    ended_at = datetime.now(timezone.utc)
    for series in interrupted_series:
        series.execution_status = "interrupted"
        series.failure_reason = payload.reason
        scan_sessions_module._clear_series_image_source(series)
    for series in scan_session.series:
        if series.series_type == "topogram":
            series.range_confirmed = False

    scan_session.status = "cancelled"
    action = _create_action_record(
        scan_session,
        payload,
        target=target,
        next_entry="patient_list",
    )
    db.add(action)
    for series in interrupted_series:
        scan_sessions_module._close_open_series_attempt(
            db,
            series,
            outcome="interrupted",
            end_reason=payload.reason,
            ended_by_action=action,
            ended_at=ended_at,
        )
    _write_action_log(
        db,
        scan_session,
        action,
        level="WARNING",
        prior_session_status=prior_session_status,
        prior_series_status=prior_series_status,
        interrupted_series_ids=[series.id for series in interrupted_series],
    )
    return action


@router.get(
    "/{scan_session_id}/actions",
    response_model=list[schemas.ScanSessionWorkflowAction],
)
def list_scan_session_workflow_actions(
    scan_session_id: int,
    db: Session = Depends(get_db),
):
    scan_sessions_module._get_scan_session_or_404(scan_session_id, db)
    return (
        db.query(models.ScanSessionWorkflowAction)
        .filter(models.ScanSessionWorkflowAction.scan_session_id == scan_session_id)
        .order_by(models.ScanSessionWorkflowAction.id.asc())
        .all()
    )


@router.get(
    "/{scan_session_id}/attempts",
    response_model=list[schemas.ScanSessionSeriesAttempt],
)
def list_scan_session_series_attempts(
    scan_session_id: int,
    target_series_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    scan_session = scan_sessions_module._get_scan_session_or_404(scan_session_id, db)
    if target_series_id is not None:
        _get_target_series(scan_session, target_series_id)
    query = db.query(models.ScanSessionSeriesAttempt).filter(
        models.ScanSessionSeriesAttempt.scan_session_id == scan_session_id
    )
    if target_series_id is not None:
        query = query.filter(
            models.ScanSessionSeriesAttempt.scan_session_series_id == target_series_id
        )
    return query.order_by(
        models.ScanSessionSeriesAttempt.scan_session_series_id.asc(),
        models.ScanSessionSeriesAttempt.attempt_number.asc(),
    ).all()


@router.post(
    "/{scan_session_id}/actions",
    response_model=schemas.ScanSessionWorkflowActionResponse,
)
def apply_scan_session_workflow_action(
    scan_session_id: int,
    payload: schemas.ScanSessionWorkflowActionCreate,
    db: Session = Depends(get_db),
):
    existing = _find_action(db, scan_session_id, payload.action_id)
    if existing:
        _assert_replay_matches(existing, payload)
        return _build_response(db, existing, replayed=True)

    # 所有生命周期写入均按会话、序列顺序加锁，避免动作与完成/执行交错提交。
    scan_sessions_module._lock_scan_session_and_series(scan_session_id, db)
    # 后到的同 action_id 请求可能在等待会话锁期间已由先到请求提交；
    # 加锁后再次查询，按首次结果重放，避免被动作后的新状态误判为冲突。
    existing = _find_action(db, scan_session_id, payload.action_id)
    if existing:
        _assert_replay_matches(existing, payload)
        return _build_response(db, existing, replayed=True)
    scan_session = scan_sessions_module._get_scan_session_or_404(scan_session_id, db)

    if payload.action == "finish_with_partial":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "PARTIAL_RESULT_NOT_SUPPORTED",
                "message": (
                    "Partial-result completion is unavailable until a formal "
                    "partial-result model and image registry are implemented"
                ),
            },
        )
    target = _get_target_series(scan_session, payload.target_series_id)

    try:
        if payload.action == "return_to_edit":
            action = _return_to_edit(db, scan_session, target, payload)
        elif payload.action == "retry_series":
            action = _retry_series(db, scan_session, target, payload)
        else:
            action = _terminate_exam(db, scan_session, target, payload)
        db.commit()
    except IntegrityError:
        # 并发重复 action_id 会整体回滚；随后只返回首次已提交的动作。
        db.rollback()
        existing = _find_action(db, scan_session_id, payload.action_id)
        if not existing:
            raise
        _assert_replay_matches(existing, payload)
        return _build_response(db, existing, replayed=True)

    db.refresh(action)
    return _build_response(db, action, replayed=False)
