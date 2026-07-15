from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy.orm import Session

from .catalog import get_device_error


DeviceErrorSource = Literal["command_response", "status_report", "hardware_detail", "history", "simulation"]
DeviceErrorOccurrence = Literal["raised", "acknowledged", "cleared"]

LOG_LEVELS = {
    "fatal": "CRITICAL",
    "error": "ERROR",
    "warning": "WARNING",
}


def build_device_error_event(
    error_code: object,
    *,
    source: DeviceErrorSource,
    occurrence: DeviceErrorOccurrence = "raised",
    command: str | None = None,
    scan_session_id: int | None = None,
    raw_payload: dict | None = None,
) -> dict:
    definition = get_device_error(error_code)
    return {
        "event": "DEVICE_ERROR",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "occurrence": occurrence,
        "source": source,
        "command": command,
        "scan_session_id": scan_session_id,
        "error": definition.to_public_dict(),
        "raw_payload": raw_payload or {},
    }


def record_device_error_event(db: Session, event: dict) -> None:
    from ..routers.logs import write_system_log

    error = event["error"]
    occurrence = event["occurrence"]
    level = LOG_LEVELS.get(error["severity"], "ERROR")
    if occurrence in {"acknowledged", "cleared"}:
        level = "INFO"

    write_system_log(
        db,
        level=level,
        source="device_protocol",
        event=f"device_error_{occurrence}",
        message=error["message"],
        details=json.dumps(
            {
                "error": error,
                "source": event["source"],
                "command": event.get("command"),
                "occurrence": occurrence,
                "raw_payload": event.get("raw_payload") or {},
            },
            ensure_ascii=False,
        ),
        scan_session_id=event.get("scan_session_id"),
    )


def _error_code_from(payload: dict) -> object | None:
    return payload.get("ErrorCode", payload.get("errorCode", payload.get("error_code")))


def extract_protocol_error_inputs(payload: dict) -> list[dict]:
    """将协议失败响应、0xFF 主错误、0xF1 子错误和 0xF3 历史记录统一为输入项。"""
    command = str(payload.get("Command", payload.get("command", ""))).strip().upper()
    scan_session_id = payload.get("scan_session_id")

    if command == "0XF3":
        results: list[dict] = []
        for item in payload.get("listData") or []:
            if not isinstance(item, dict):
                continue
            code = _error_code_from(item)
            if code:
                results.append(
                    {
                        "error_code": code,
                        "source": "history",
                        "command": command,
                        "scan_session_id": scan_session_id,
                        "raw_payload": item,
                    }
                )
        return results

    source: DeviceErrorSource | None = None
    if command == "0XFF":
        source = "status_report"
    elif command == "0XF1":
        source = "hardware_detail"
    elif payload.get("Result") in {0, "0", False}:
        source = "command_response"

    code = _error_code_from(payload)
    if not source or not code:
        return []
    return [
        {
            "error_code": code,
            "source": source,
            "command": command or None,
            "scan_session_id": scan_session_id,
            "raw_payload": payload,
        }
    ]
