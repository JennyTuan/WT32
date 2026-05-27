from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import socket
import time
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator


DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "dicom_settings.json"

DicomNodeRole = Literal["archive", "storage", "worklist", "printer"]
DicomNodeStatus = Literal["unknown", "online", "offline"]
TransferSyntax = Literal[
    "explicit_vr_little_endian",
    "implicit_vr_little_endian",
    "jpeg_lossless",
    "jpeg_2000_lossless",
]
CompressionMode = Literal["none", "lossless", "lossy_reference"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DicomLocalSettings(BaseModel):
    ae_title: str = Field(default="WT32_CT", min_length=1, max_length=16)
    bind_host: str = Field(default="0.0.0.0", min_length=1, max_length=255)
    port: int = Field(default=104, ge=1, le=65535)
    receive_enabled: bool = True
    max_associations: int = Field(default=4, ge=1, le=32)
    implementation_name: str = Field(default="WT32 Prototype", min_length=1, max_length=64)
    storage_path: str = Field(default="backend/data/dicom_in", min_length=1, max_length=260)

    @field_validator("ae_title")
    @classmethod
    def clean_ae_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("AE title is required")
        return cleaned


class DicomRemoteNode(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    ae_title: str = Field(min_length=1, max_length=16)
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    role: DicomNodeRole = "archive"
    enabled: bool = True
    tls: bool = False
    description: Optional[str] = Field(default=None, max_length=160)
    last_status: DicomNodeStatus = "unknown"
    last_checked_at: Optional[str] = None

    @field_validator("ae_title", "name", "host")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("value is required")
        return cleaned


class DicomRoutingSettings(BaseModel):
    default_destination_id: Optional[str] = None
    auto_send_on_scan_complete: bool = True
    require_operator_confirm: bool = True
    include_dose_report: bool = True
    include_localizer: bool = True
    anonymize_before_send: bool = False
    retry_count: int = Field(default=3, ge=0, le=10)
    retry_interval_sec: int = Field(default=30, ge=5, le=3600)


class DicomTransferSettings(BaseModel):
    preferred_transfer_syntax: TransferSyntax = "explicit_vr_little_endian"
    compression: CompressionMode = "lossless"
    max_pdu_kb: int = Field(default=16, ge=4, le=128)
    association_timeout_sec: int = Field(default=15, ge=3, le=120)
    dimse_timeout_sec: int = Field(default=30, ge=5, le=300)


class DicomReceiveSettings(BaseModel):
    accept_unknown_sources: bool = False
    store_incoming: bool = True
    reject_duplicate_instances: bool = True
    import_to_patient_list: bool = False
    retention_days: int = Field(default=30, ge=1, le=3650)
    allowed_modalities: list[str] = Field(default_factory=lambda: ["CT", "OT", "SR"])


class DicomSettingsSnapshot(BaseModel):
    updated_at: str = Field(default_factory=_now_iso)
    local: DicomLocalSettings = Field(default_factory=DicomLocalSettings)
    nodes: list[DicomRemoteNode] = Field(default_factory=list)
    routing: DicomRoutingSettings = Field(default_factory=DicomRoutingSettings)
    transfer: DicomTransferSettings = Field(default_factory=DicomTransferSettings)
    receive: DicomReceiveSettings = Field(default_factory=DicomReceiveSettings)

    @model_validator(mode="after")
    def validate_node_references(self) -> "DicomSettingsSnapshot":
        node_ids = [node.id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("DICOM node ids must be unique")
        if self.routing.default_destination_id and self.routing.default_destination_id not in set(node_ids):
            raise ValueError("Default destination must reference an existing DICOM node")
        return self


class DicomConnectionTestRequest(BaseModel):
    node: DicomRemoteNode
    timeout_sec: float = Field(default=1.5, ge=0.2, le=10)


class DicomConnectionTestResult(BaseModel):
    ok: bool
    status: DicomNodeStatus
    checked_at: str
    latency_ms: Optional[float] = None
    message: str


router = APIRouter(
    prefix="/dicom-settings",
    tags=["dicom-settings"],
)


def _default_settings() -> DicomSettingsSnapshot:
    return DicomSettingsSnapshot(
        nodes=[
            DicomRemoteNode(
                id="main-pacs",
                name="Main PACS",
                ae_title="PACS_ARCHIVE",
                host="127.0.0.1",
                port=104,
                role="archive",
                enabled=True,
                description="Default archive destination",
            ),
            DicomRemoteNode(
                id="rt-workstation",
                name="RT Workstation",
                ae_title="RT_STATION",
                host="192.168.1.80",
                port=104,
                role="storage",
                enabled=False,
                description="Reference workstation",
            ),
        ],
        routing=DicomRoutingSettings(default_destination_id="main-pacs"),
    )


def _read_settings() -> DicomSettingsSnapshot:
    if not DATA_FILE.exists():
        return _default_settings()
    try:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return DicomSettingsSnapshot.model_validate(raw)
    except Exception as exc:  # pragma: no cover - defensive for hand-edited JSON
        raise HTTPException(status_code=500, detail=f"Failed to load DICOM settings: {exc}") from exc


def _write_settings(settings: DicomSettingsSnapshot) -> DicomSettingsSnapshot:
    updated = settings.model_copy(update={"updated_at": _now_iso()})
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = DATA_FILE.with_suffix(".json.tmp")
    temp_file.write_text(
        json.dumps(updated.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp_file.replace(DATA_FILE)
    return updated


@router.get("/", response_model=DicomSettingsSnapshot)
def get_dicom_settings():
    return _read_settings()


@router.put("/", response_model=DicomSettingsSnapshot)
def update_dicom_settings(payload: DicomSettingsSnapshot):
    return _write_settings(payload)


@router.post("/reset", response_model=DicomSettingsSnapshot)
def reset_dicom_settings():
    return _write_settings(_default_settings())


@router.post("/test-node", response_model=DicomConnectionTestResult)
def test_dicom_node(payload: DicomConnectionTestRequest):
    started = time.perf_counter()
    checked_at = _now_iso()
    try:
        with socket.create_connection((payload.node.host, payload.node.port), timeout=payload.timeout_sec):
            latency_ms = round((time.perf_counter() - started) * 1000, 1)
            return DicomConnectionTestResult(
                ok=True,
                status="online",
                checked_at=checked_at,
                latency_ms=latency_ms,
                message="TCP port reachable. DICOM association was not performed in prototype mode.",
            )
    except OSError as exc:
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return DicomConnectionTestResult(
            ok=False,
            status="offline",
            checked_at=checked_at,
            latency_ms=latency_ms,
            message=str(exc),
        )
