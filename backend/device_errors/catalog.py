from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


CATALOG_PATH = Path(__file__).resolve().parent.parent / "resources" / "device_error_codes.json"
ERROR_CODE_PATTERN = re.compile(r"^(?:0[xX])?([0-9a-fA-F]{1,8})$")


def normalize_error_code(value: object) -> str:
    raw = str(value or "").strip()
    match = ERROR_CODE_PATTERN.fullmatch(raw)
    if not match:
        return raw.upper() or "UNKNOWN"
    return f"0x{match.group(1).upper().zfill(8)}"


@dataclass(frozen=True)
class DeviceErrorDefinition:
    code: str
    module: str
    severity: str
    professional_message: str
    source_ui_message: str = ""
    meaning: str = ""
    action: str = ""
    firmware_code: str = ""
    read_command: str = ""
    repair_command: str = ""
    repair_time: str = ""
    known: bool = True

    @property
    def has_hardware_detail(self) -> bool:
        return bool(self.read_command and self.read_command != "-")

    def to_public_dict(self) -> dict:
        return {
            "code": self.code,
            "known": self.known,
            "module": self.module,
            "severity": self.severity,
            "message": self.professional_message,
            "meaning": self.meaning,
            "action": self.action,
            "has_hardware_detail": self.has_hardware_detail,
        }


@lru_cache(maxsize=1)
def load_device_error_catalog() -> dict[str, DeviceErrorDefinition]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8-sig"))
    catalog: dict[str, DeviceErrorDefinition] = {}
    for item in payload.get("records", []):
        definition = DeviceErrorDefinition(
            code=normalize_error_code(item.get("code")),
            module=str(item.get("module") or "设备"),
            severity=str(item.get("severity") or "error"),
            professional_message=str(item.get("professional_message") or "设备状态异常，需要确认。"),
            source_ui_message=str(item.get("source_ui_message") or ""),
            meaning=str(item.get("meaning") or ""),
            action=str(item.get("action") or ""),
            firmware_code=str(item.get("firmware_code") or ""),
            read_command=str(item.get("read_command") or ""),
            repair_command=str(item.get("repair_command") or ""),
            repair_time=str(item.get("repair_time") or ""),
        )
        catalog[definition.code] = definition
    return catalog


def get_device_error(value: object) -> DeviceErrorDefinition:
    code = normalize_error_code(value)
    definition = load_device_error_catalog().get(code)
    if definition:
        return definition
    return DeviceErrorDefinition(
        code=code,
        module="未分类设备错误",
        severity="error",
        professional_message=f"检测到未收录的设备错误（{code}），需要工程人员确认。",
        meaning="错误码尚未收录到当前字典",
        action="记录原始数据并联系售后服务工程师",
        known=False,
    )
