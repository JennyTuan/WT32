"""Authentication helpers: password hashing + current-user dependency."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from . import models
from .database import get_db

# bcrypt has a 72-byte input limit; passlib handles that for us.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return _pwd_context.verify(password, hashed)
    except Exception:
        return False


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> models.UserAccount:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    user = db.query(models.UserAccount).filter(models.UserAccount.id == user_id).first()
    if not user or not user.login_allowed or user.status != "active":
        # Session is no longer valid; clear it.
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session expired")
    return user


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> models.UserAccount | None:
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    return db.query(models.UserAccount).filter(models.UserAccount.id == user_id).first()
