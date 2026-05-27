from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator


DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "organization_info.json"

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


def _read_settings() -> OrganizationInfoSnapshot:
    if not DATA_FILE.exists():
        return _default_settings()
    try:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return OrganizationInfoSnapshot.model_validate(raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load organization info: {exc}") from exc


def _write_settings(settings: OrganizationInfoSnapshot) -> OrganizationInfoSnapshot:
    updated = settings.model_copy(update={"updated_at": _now_iso()})
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = DATA_FILE.with_suffix(".json.tmp")
    temp_file.write_text(
        json.dumps(updated.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp_file.replace(DATA_FILE)
    return updated


@router.get("/", response_model=OrganizationInfoSnapshot)
def get_organization_info():
    return _read_settings()


@router.put("/", response_model=OrganizationInfoSnapshot)
def update_organization_info(payload: OrganizationInfoSnapshot):
    return _write_settings(payload)


@router.post("/reset", response_model=OrganizationInfoSnapshot)
def reset_organization_info():
    return _write_settings(_default_settings())
