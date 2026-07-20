from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..file_backed_documents import SYSTEM_SETTINGS_KEY
from ..persistent_documents import load_document, save_document

LanguageCode = Literal["zh-CN", "en-US"]
ThemeMode = Literal["light", "dark", "auto"]
TimeFormat = Literal["24h", "12h"]
DateFormat = Literal["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]
LengthUnit = Literal["mm", "cm"]
WeightUnit = Literal["kg", "lb"]
NetworkMode = Literal["dhcp", "static"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class GeneralSettings(BaseModel):
    language: LanguageCode = "zh-CN"
    theme: ThemeMode = "light"
    time_format: TimeFormat = "24h"
    date_format: DateFormat = "YYYY-MM-DD"
    length_unit: LengthUnit = "mm"
    weight_unit: WeightUnit = "kg"


class TimeSettings(BaseModel):
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    ntp_enabled: bool = True
    ntp_server: str = Field(default="ntp.aliyun.com", min_length=1, max_length=255)
    ntp_fallback: str = Field(default="pool.ntp.org", min_length=1, max_length=255)
    sync_interval_min: int = Field(default=60, ge=5, le=1440)


class NetworkSettings(BaseModel):
    hostname: str = Field(default="wt32-ct", min_length=1, max_length=63)
    mode: NetworkMode = "dhcp"
    ip_address: str = Field(default="192.168.1.50", max_length=45)
    netmask: str = Field(default="255.255.255.0", max_length=45)
    gateway: str = Field(default="192.168.1.1", max_length=45)
    dns_primary: str = Field(default="223.5.5.5", max_length=45)
    dns_secondary: str = Field(default="8.8.8.8", max_length=45)
    proxy_enabled: bool = False
    proxy_url: str = Field(default="", max_length=255)


class DevicePreferences(BaseModel):
    auto_lock_min: int = Field(default=10, ge=0, le=240)
    screensaver_min: int = Field(default=15, ge=0, le=240)
    beep_enabled: bool = True
    volume: int = Field(default=70, ge=0, le=100)
    brightness: int = Field(default=80, ge=10, le=100)
    show_patient_avatar: bool = True
    confirm_before_scan: bool = True


class MaintenanceSettings(BaseModel):
    auto_logout_min: int = Field(default=30, ge=0, le=480)
    boot_self_check: bool = True
    allow_remote_assist: bool = False
    crash_report_upload: bool = True
    daily_restart_enabled: bool = False
    daily_restart_time: str = Field(default="03:00", pattern=r"^\d{2}:\d{2}$")


class AboutInfo(BaseModel):
    device_model: str = "WT32-CT Prototype"
    serial_number: str = "WT32-2026-000123"
    software_version: str = "1.4.0-beta"
    firmware_version: str = "FW-3.1.7"
    license_status: Literal["valid", "expiring", "expired"] = "valid"
    license_expires_at: Optional[str] = "2027-01-01"


class SystemSettingsSnapshot(BaseModel):
    updated_at: str = Field(default_factory=_now_iso)
    general: GeneralSettings = Field(default_factory=GeneralSettings)
    time: TimeSettings = Field(default_factory=TimeSettings)
    network: NetworkSettings = Field(default_factory=NetworkSettings)
    device: DevicePreferences = Field(default_factory=DevicePreferences)
    maintenance: MaintenanceSettings = Field(default_factory=MaintenanceSettings)
    about: AboutInfo = Field(default_factory=AboutInfo)

    @field_validator("network")
    @classmethod
    def validate_network(cls, value: NetworkSettings) -> NetworkSettings:
        if value.mode == "static":
            for field_name, field_value in (
                ("ip_address", value.ip_address),
                ("netmask", value.netmask),
                ("gateway", value.gateway),
            ):
                if not field_value.strip():
                    raise ValueError(f"{field_name} is required when network mode is static")
        return value


class TimeSyncResult(BaseModel):
    ok: bool
    server: str
    server_time: str
    drift_ms: float
    message: str


router = APIRouter(prefix="/system-settings", tags=["system-settings"])


def _default_settings() -> SystemSettingsSnapshot:
    return SystemSettingsSnapshot()


def _read_settings(db: Session) -> SystemSettingsSnapshot:
    try:
        raw = load_document(db, SYSTEM_SETTINGS_KEY, _default_settings().model_dump())
        return SystemSettingsSnapshot.model_validate(raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load system settings: {exc}") from exc


def _write_settings(db: Session, settings: SystemSettingsSnapshot) -> SystemSettingsSnapshot:
    updated = settings.model_copy(update={"updated_at": _now_iso()})
    save_document(db, SYSTEM_SETTINGS_KEY, updated.model_dump())
    return updated


@router.get("/", response_model=SystemSettingsSnapshot)
def get_system_settings(db: Session = Depends(get_db)):
    return _read_settings(db)


@router.put("/", response_model=SystemSettingsSnapshot)
def update_system_settings(payload: SystemSettingsSnapshot, db: Session = Depends(get_db)):
    return _write_settings(db, payload)


@router.post("/reset", response_model=SystemSettingsSnapshot)
def reset_system_settings(db: Session = Depends(get_db)):
    return _write_settings(db, _default_settings())


@router.post("/time-sync", response_model=TimeSyncResult)
def sync_time(db: Session = Depends(get_db)):
    settings = _read_settings(db)
    now = datetime.now(timezone.utc)
    return TimeSyncResult(
        ok=True,
        server=settings.time.ntp_server,
        server_time=now.isoformat(),
        drift_ms=0.0,
        message="Prototype mode: returned local time without external NTP exchange.",
    )
