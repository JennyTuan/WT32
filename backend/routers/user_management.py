from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from .. import models, schemas
from ..database import get_db
from .logs import write_system_log

router = APIRouter(prefix="/user-management", tags=["user-management"])


def _optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _required_text(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="required text field cannot be blank")
    return stripped


def _permission_list(role: models.UserRole) -> list[str]:
    try:
        value = json.loads(role.permissions or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _serialize_role(role: models.UserRole, user_count: int = 0) -> dict[str, Any]:
    return {
        "code": role.code,
        "name": role.name,
        "description": role.description,
        "permissions": _permission_list(role),
        "is_system": role.is_system,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
        "user_count": user_count,
    }


def _serialize_user(user: models.UserAccount) -> dict[str, Any]:
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
        "phone": user.phone,
        "email": user.email,
        "login_allowed": user.login_allowed,
        "password_reset_required": user.password_reset_required,
        "credential_version": user.credential_version,
        "failed_attempts": user.failed_attempts,
        "last_login_at": user.last_login_at,
        "password_updated_at": user.password_updated_at,
        "locked_at": user.locked_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def _role_counts(db: Session) -> dict[str, int]:
    rows = (
        db.query(models.UserAccount.role_code, func.count(models.UserAccount.id))
        .group_by(models.UserAccount.role_code)
        .all()
    )
    return {role_code: int(count) for role_code, count in rows}


def _get_role_or_404(db: Session, role_code: str) -> models.UserRole:
    role = db.query(models.UserRole).filter(models.UserRole.code == role_code).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role_code not found")
    return role


def _check_unique_user_fields(db: Session, *, username: str | None, employee_id: str | None, exclude_id: int | None = None) -> None:
    if username:
        query = db.query(models.UserAccount).filter(models.UserAccount.username == username)
        if exclude_id is not None:
            query = query.filter(models.UserAccount.id != exclude_id)
        if query.first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="username already exists")

    if employee_id:
        query = db.query(models.UserAccount).filter(models.UserAccount.employee_id == employee_id)
        if exclude_id is not None:
            query = query.filter(models.UserAccount.id != exclude_id)
        if query.first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="employee_id already exists")


def _generate_user_code(db: Session) -> str:
    prefix = f"U{datetime.now().strftime('%Y%m%d')}"
    used_codes: set[str] = set()
    for (value,) in db.query(models.UserAccount.username).filter(models.UserAccount.username.like(f"{prefix}%")).all():
        if value:
            used_codes.add(value)
    for (value,) in db.query(models.UserAccount.employee_id).filter(models.UserAccount.employee_id.like(f"{prefix}%")).all():
        if value:
            used_codes.add(value)

    max_suffix = 0
    for value in used_codes:
        suffix = value.removeprefix(prefix)
        if len(suffix) == 3 and suffix.isdigit():
            max_suffix = max(max_suffix, int(suffix))

    for next_suffix in range(max_suffix + 1, 1000):
        code = f"{prefix}{next_suffix:03d}"
        if code not in used_codes:
            return code
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="user code sequence exhausted for today")


def _active_admin_count(db: Session, exclude_id: int | None = None) -> int:
    query = db.query(models.UserAccount).filter(
        models.UserAccount.role_code == "system_admin",
        models.UserAccount.status == "active",
        models.UserAccount.login_allowed.is_(True),
    )
    if exclude_id is not None:
        query = query.filter(models.UserAccount.id != exclude_id)
    return query.count()


def _ensure_admin_remains(db: Session, user: models.UserAccount, updates: dict[str, Any] | None = None) -> None:
    next_role = updates.get("role_code", user.role_code) if updates else user.role_code
    next_status = updates.get("status", user.status) if updates else user.status
    next_login_allowed = updates.get("login_allowed", user.login_allowed) if updates else user.login_allowed
    currently_active_admin = user.role_code == "system_admin" and user.status == "active" and user.login_allowed
    still_active_admin = next_role == "system_admin" and next_status == "active" and next_login_allowed
    if currently_active_admin and not still_active_admin and _active_admin_count(db, exclude_id=user.id) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="at least one active administrator is required")


def _audit(db: Session, event: str, message: str, details: dict[str, Any]) -> None:
    write_system_log(
        db,
        level="INFO",
        source="user_management",
        event=event,
        message=message,
        details=json.dumps(details, ensure_ascii=False),
    )


def _apply_user_update(user: models.UserAccount, updates: dict[str, Any]) -> None:
    optional_fields = {"employee_id", "department", "title", "phone", "email"}
    required_fields = {"username", "display_name"}
    for field in optional_fields.intersection(updates):
        updates[field] = _optional_text(updates[field])
    for field in required_fields.intersection(updates):
        updates[field] = _required_text(updates[field])

    if updates.get("status") == "locked" and user.status != "locked":
        updates["locked_at"] = datetime.utcnow()
    elif "status" in updates and updates["status"] != "locked":
        updates["locked_at"] = None
        if updates["status"] == "active":
            updates["failed_attempts"] = 0

    for field, value in updates.items():
        setattr(user, field, value)
    user.updated_at = func.now()


@router.get("/", response_model=schemas.UserManagementSnapshot)
def get_user_management_snapshot(db: Session = Depends(get_db)):
    counts = _role_counts(db)
    role_order = {"system_admin": 0, "technologist": 1, "service_engineer": 2}
    roles = sorted(
        db.query(models.UserRole).all(),
        key=lambda role: (role_order.get(role.code, 99), role.name),
    )
    users = db.query(models.UserAccount).order_by(models.UserAccount.id.asc()).all()
    return {
        "users": [_serialize_user(user) for user in users],
        "roles": [_serialize_role(role, counts.get(role.code, 0)) for role in roles],
    }


@router.get("/next-user-code", response_model=schemas.GeneratedUserCode)
def get_next_user_code(db: Session = Depends(get_db)):
    return {"code": _generate_user_code(db)}


@router.post("/users", response_model=schemas.UserAccount, status_code=status.HTTP_201_CREATED)
def create_user(payload: schemas.UserAccountCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    account_code = _optional_text(data.get("username")) or _optional_text(data.get("employee_id")) or _generate_user_code(db)
    data["username"] = _required_text(account_code)
    data["employee_id"] = data["username"]
    data["display_name"] = _required_text(data["display_name"])
    for field in ("department", "title", "phone", "email"):
        data[field] = _optional_text(data.get(field))

    _get_role_or_404(db, data["role_code"])
    _check_unique_user_fields(db, username=data["username"], employee_id=data.get("employee_id"))
    if data["status"] == "locked":
        data["locked_at"] = datetime.utcnow()

    user = models.UserAccount(**data)
    db.add(user)
    db.flush()
    _audit(db, "user_created", "User account created", {"user_id": user.id, "username": user.username})
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.put("/users/{user_id}", response_model=schemas.UserAccount)
def update_user(user_id: int, payload: schemas.UserAccountUpdate, db: Session = Depends(get_db)):
    user = db.query(models.UserAccount).filter(models.UserAccount.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return _serialize_user(user)

    if "username" in updates or "employee_id" in updates:
        account_code = (
            _optional_text(updates.get("username"))
            or _optional_text(updates.get("employee_id"))
            or user.username
        )
        updates["username"] = _required_text(account_code)
        updates["employee_id"] = updates["username"]

    if "role_code" in updates:
        _get_role_or_404(db, updates["role_code"])

    next_username = _required_text(updates["username"]) if "username" in updates and updates["username"] is not None else None
    next_employee_id = _optional_text(updates["employee_id"]) if "employee_id" in updates else None
    _check_unique_user_fields(db, username=next_username, employee_id=next_employee_id, exclude_id=user_id)
    _ensure_admin_remains(db, user, updates)

    _apply_user_update(user, updates)
    _audit(db, "user_updated", "User account updated", {"user_id": user.id, "username": user.username})
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.UserAccount).filter(models.UserAccount.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    _ensure_admin_remains(db, user, {"status": "disabled", "login_allowed": False})
    username = user.username
    db.delete(user)
    _audit(db, "user_deleted", "User account deleted", {"user_id": user_id, "username": username})
    db.commit()


@router.post("/users/{user_id}/reset-password", response_model=schemas.UserAccount)
def reset_user_password(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.UserAccount).filter(models.UserAccount.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    user.password_reset_required = True
    user.credential_version = (user.credential_version or 1) + 1
    user.password_updated_at = datetime.utcnow()
    user.updated_at = func.now()
    _audit(db, "user_password_reset", "User credential reset requested", {"user_id": user.id, "username": user.username})
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.put("/roles/{role_code}", response_model=schemas.UserRole)
def update_role(role_code: str, payload: schemas.UserRoleUpdate, db: Session = Depends(get_db)):
    role = db.query(models.UserRole).filter(models.UserRole.code == role_code).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="role not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"] is not None:
        role.name = _required_text(updates["name"])
    if "description" in updates:
        role.description = _optional_text(updates["description"])
    if "permissions" in updates and updates["permissions"] is not None:
        role.permissions = json.dumps(sorted(set(updates["permissions"])), ensure_ascii=False)
    role.updated_at = func.now()
    _audit(db, "role_updated", "User role updated", {"role_code": role.code})
    db.commit()
    db.refresh(role)
    return _serialize_role(role, _role_counts(db).get(role.code, 0))
