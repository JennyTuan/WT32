"""Auth endpoints: login, logout, current user, change password."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..auth_utils import get_current_user, hash_password, verify_password
from ..database import EMERGENCY_USERNAME, get_db
from .logs import write_system_log

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 6
ACCOUNT_LOCKED_DETAIL = "账号已锁定，请联系管理员"


class LoginPayload(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class ChangePasswordPayload(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


def _serialize_me(user: models.UserAccount) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "employee_id": user.employee_id,
        "department": user.department,
        "title": user.title,
        "role_code": user.role_code,
        "role_name": user.role.name if user.role else None,
        "status": user.status,
        "login_allowed": user.login_allowed,
        "password_reset_required": user.password_reset_required,
        "last_login_at": user.last_login_at,
    }


@router.post("/login")
def login(payload: LoginPayload, request: Request, db: Session = Depends(get_db)):
    username = payload.username.strip()
    if username == EMERGENCY_USERNAME:
        # Emergency account has no password — it can only be entered via the
        # dedicated emergency-login flow with confirmation.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    candidate = (
        db.query(models.UserAccount)
        .filter(models.UserAccount.username == username)
        .first()
    )
    # Always do hash verification (or a dummy one) to keep timing similar.
    if not candidate or not candidate.password_hash:
        # Run a dummy verify so unknown-user case doesn't return faster than wrong-password.
        verify_password(payload.password, "$2b$12$abcdefghijklmnopqrstuv")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    if candidate.status == "locked":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCOUNT_LOCKED_DETAIL)
    if not candidate.login_allowed or candidate.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已停用")

    if not verify_password(payload.password, candidate.password_hash):
        candidate.failed_attempts = (candidate.failed_attempts or 0) + 1
        just_locked = candidate.failed_attempts >= MAX_FAILED_ATTEMPTS
        if just_locked:
            candidate.status = "locked"
            candidate.locked_at = datetime.utcnow()
            write_system_log(
                db,
                level="WARNING",
                source="auth",
                event="user_locked",
                message=f"User {candidate.username} locked after {candidate.failed_attempts} failed attempts",
            )
        db.commit()
        if just_locked:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCOUNT_LOCKED_DETAIL)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    candidate.failed_attempts = 0
    candidate.last_login_at = datetime.utcnow()
    write_system_log(
        db,
        level="INFO",
        source="auth",
        event="user_login",
        message=f"User {candidate.username} logged in",
    )
    db.commit()
    db.refresh(candidate)

    request.session["user_id"] = candidate.id
    return _serialize_me(candidate)


@router.post("/emergency-login")
def emergency_login(request: Request, db: Session = Depends(get_db)):
    user = (
        db.query(models.UserAccount)
        .filter(models.UserAccount.username == EMERGENCY_USERNAME)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="紧急账号未初始化")

    previous_user_id = request.session.get("user_id")
    previous_username = None
    if previous_user_id:
        prev = db.query(models.UserAccount).filter(models.UserAccount.id == previous_user_id).first()
        previous_username = prev.username if prev else None

    user.last_login_at = datetime.utcnow()
    write_system_log(
        db,
        level="WARNING",
        source="auth",
        event="emergency_login",
        message=f"Emergency login session started (previous user: {previous_username or 'none'})",
    )
    db.commit()
    db.refresh(user)

    request.session["user_id"] = user.id
    return _serialize_me(user)


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    user_id = request.session.get("user_id")
    request.session.clear()
    if user_id:
        user = db.query(models.UserAccount).filter(models.UserAccount.id == user_id).first()
        if user:
            write_system_log(
                db,
                level="INFO",
                source="auth",
                event="user_logout",
                message=f"User {user.username} logged out",
            )
            db.commit()
    return {"ok": True}


@router.get("/me")
def me(current_user: models.UserAccount = Depends(get_current_user)):
    return _serialize_me(current_user)


@router.post("/change-password")
def change_password(
    payload: ChangePasswordPayload,
    request: Request,
    current_user: models.UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前密码不正确")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="新密码不能与当前密码相同")

    current_user.password_hash = hash_password(payload.new_password)
    current_user.password_reset_required = False
    current_user.password_updated_at = datetime.utcnow()
    current_user.credential_version = (current_user.credential_version or 1) + 1
    write_system_log(
        db,
        level="INFO",
        source="auth",
        event="password_changed",
        message=f"User {current_user.username} changed password",
    )
    db.commit()
    db.refresh(current_user)
    # Keep session valid; just refresh user_id in case it was missing.
    request.session["user_id"] = current_user.id
    return _serialize_me(current_user)
