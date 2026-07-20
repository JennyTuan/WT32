from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..file_backed_documents import ORGANIZATION_INFO_KEY
from ..persistent_documents import load_document, save_document

InstitutionType = Literal["hospital", "clinic", "imaging_center", "research", "other"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class InstitutionInfo(BaseModel):
    name: str = Field(default="示例第一人民医院", min_length=1, max_length=120)
    short_name: str = Field(default="示例一院", max_length=60)
    code: str = Field(default="HOSP-0001", max_length=40)
    type: InstitutionType = "hospital"
    license_number: str = Field(default="", max_length=80)
    website: str = Field(default="", max_length=255)
    logo_url: str = Field(default="", max_length=512)
    stamp_url: str = Field(default="", max_length=512)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("机构名称不能为空")
        return cleaned


class ContactInfo(BaseModel):
    address: str = Field(default="", max_length=255)
    city: str = Field(default="", max_length=80)
    postal_code: str = Field(default="", max_length=20)
    phone: str = Field(default="", max_length=40)
    fax: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=120)
    emergency_phone: str = Field(default="", max_length=40)


class DepartmentInfo(BaseModel):
    name: str = Field(default="放射科", max_length=80)
    code: str = Field(default="RAD", max_length=20)
    head: str = Field(default="", max_length=40)
    head_title: str = Field(default="主任", max_length=40)
    phone: str = Field(default="", max_length=40)
    room: str = Field(default="", max_length=40)


class ReportDisplay(BaseModel):
    header_text: str = Field(default="", max_length=160)
    footer_text: str = Field(default="", max_length=160)
    show_logo: bool = True
    show_stamp: bool = False
    show_qr_code: bool = False
    confidential_label: str = Field(default="仅供医疗使用", max_length=40)


class OrganizationInfoSnapshot(BaseModel):
    updated_at: str = Field(default_factory=_now_iso)
    institution: InstitutionInfo = Field(default_factory=InstitutionInfo)
    contact: ContactInfo = Field(default_factory=ContactInfo)
    department: DepartmentInfo = Field(default_factory=DepartmentInfo)
    report: ReportDisplay = Field(default_factory=ReportDisplay)


router = APIRouter(prefix="/organization-info", tags=["organization-info"])


def _default_settings() -> OrganizationInfoSnapshot:
    return OrganizationInfoSnapshot()


def _read_settings(db: Session) -> OrganizationInfoSnapshot:
    try:
        raw = load_document(db, ORGANIZATION_INFO_KEY, _default_settings().model_dump())
        return OrganizationInfoSnapshot.model_validate(raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load organization info: {exc}") from exc


def _write_settings(db: Session, settings: OrganizationInfoSnapshot) -> OrganizationInfoSnapshot:
    updated = settings.model_copy(update={"updated_at": _now_iso()})
    save_document(db, ORGANIZATION_INFO_KEY, updated.model_dump())
    return updated


@router.get("/", response_model=OrganizationInfoSnapshot)
def get_organization_info(db: Session = Depends(get_db)):
    return _read_settings(db)


@router.put("/", response_model=OrganizationInfoSnapshot)
def update_organization_info(payload: OrganizationInfoSnapshot, db: Session = Depends(get_db)):
    return _write_settings(db, payload)


@router.post("/reset", response_model=OrganizationInfoSnapshot)
def reset_organization_info(db: Session = Depends(get_db)):
    return _write_settings(db, _default_settings())
