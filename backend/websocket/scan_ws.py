from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..database import SessionLocal
from ..device_errors import build_device_error_event, extract_protocol_error_inputs, normalize_error_code, record_device_error_event
from ..scan_protocol import validate_scan_plan

router = APIRouter(tags=["scan-websocket"])
_connections: set[WebSocket] = set()
_active_error_codes: set[str] = set()


def _mock_event(event_type: str, **payload):
    return {
        "event": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload,
    }


def _validate_scan_start_request(message: dict) -> str | None:
    plan = message.get("PlanScanStartInfo")
    if not isinstance(plan, dict) or not isinstance(plan.get("SeriesCollection"), list):
        return "missing PlanScanStartInfo.SeriesCollection"
    for series in plan["SeriesCollection"]:
        params = series.get("ScanParams") if isinstance(series, dict) else None
        if not isinstance(params, dict):
            return "missing SeriesCollection.ScanParams"
        try:
            validate_scan_plan({
                "kv": params.get("kV"), "ma": params.get("mA"),
                "focus_size": "large" if params.get("FocusSize") == 1 else "small",
                "bowtie_type": params.get("BowtieType", "medium"),
                "collimator": params.get("CollimatorType", "32*0.6"),
            })
        except ValueError as exc:
            return str(exc)
    return None


def _persist_device_error(event: dict) -> None:
    db = SessionLocal()
    try:
        record_device_error_event(db, event)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _broadcast_json(payload: dict) -> None:
    disconnected: list[WebSocket] = []
    for connection in list(_connections):
        try:
            await connection.send_json(payload)
        except Exception:
            disconnected.append(connection)
    for connection in disconnected:
        _connections.discard(connection)


@router.websocket("/ws/scan-control")
async def scan_control_ws(websocket: WebSocket):
    await websocket.accept()
    _connections.add(websocket)

    async def emit_device_error(event: dict) -> bool:
        code = normalize_error_code(event["error"]["code"])
        occurrence = event["occurrence"]
        if occurrence == "raised" and code in _active_error_codes:
            return False
        if occurrence == "raised":
            _active_error_codes.add(code)
        elif occurrence == "cleared":
            _active_error_codes.discard(code)

        _persist_device_error(event)
        await _broadcast_json(event)
        if occurrence == "raised" and event["error"]["severity"] == "fatal":
            await _broadcast_json(
                _mock_event(
                    "SCAN_STATUS",
                    status="blocked",
                    message="检测到 Fatal 级设备错误，当前界面流程已暂停，需要确认。",
                )
            )
        return True

    await websocket.send_json(
        _mock_event(
            "SCAN_STATUS",
            status="idle",
            message="Mock scan control channel connected",
        )
    )
    await websocket.send_json(
        _mock_event(
            "INJECTOR_READY",
            ready=True,
            message="Mock injector interface ready",
        )
    )
    await websocket.send_json(
        _mock_event(
            "BREATHING_PHASE",
            phase=0,
            total_phases=10,
            message="Mock breathing monitor initialized",
        )
    )

    try:
        while True:
            message = await websocket.receive_json()
            command = message.get("Command", message.get("command", "UNKNOWN"))

            protocol_errors = extract_protocol_error_inputs(message)
            if protocol_errors:
                for item in protocol_errors:
                    event = build_device_error_event(**item)
                    await emit_device_error(event)
                continue

            if command == "0x0B":
                reason = _validate_scan_start_request(message)
                if reason:
                    responses = [{"Command": "0x0C", "Result": 0, "ErrorCode": "0x01000001", "message": reason}]
                else:
                    responses = [
                        {"Command": "0x0D", "ScanInfo": 0},
                        {"Command": "0x0D", "ScanInfo": 7},
                        {"Command": "0x0D", "ScanInfo": 8},
                        {"Command": "0x0D", "ScanInfo": 11},
                        {"Command": "0x0C", "Result": 1, "ErrorCode": "0x00"},
                    ]
            elif command == "START_SCAN":
                responses = [
                    _mock_event("START_SCAN", accepted=True),
                    _mock_event("INJECTOR_START", started=True),
                    _mock_event("INJECTOR_STATUS", status="injecting", progress=35),
                    _mock_event("SCAN_PROGRESS", progress=20, current_series="Topogram"),
                    _mock_event("BREATHING_WAVE", amplitude=1.3, stable=True),
                    _mock_event("IMAGE_READY", series_label="Topogram", image_count=2),
                    _mock_event("SCAN_STATUS", status="running"),
                ]
            elif command == "PAUSE_SCAN":
                responses = [
                    _mock_event("PAUSE_SCAN", accepted=True),
                    _mock_event("SCAN_STATUS", status="paused"),
                ]
            elif command == "STOP_SCAN":
                responses = [
                    _mock_event("STOP_SCAN", accepted=True),
                    _mock_event("INJECTOR_STATUS", status="stopped", progress=100),
                    _mock_event("SCAN_STATUS", status="stopped"),
                ]
            elif command in {"INJECT_DEVICE_ERROR", "INJECT_HW_ERRORS"}:
                error_codes = message.get("error_codes") or [message.get("error_code")]
                source = "hardware_detail" if command == "INJECT_HW_ERRORS" else "simulation"
                for error_code in error_codes:
                    if not error_code:
                        continue
                    event = build_device_error_event(
                        error_code,
                        source=source,
                        command=command,
                        scan_session_id=message.get("scan_session_id"),
                        raw_payload=message,
                    )
                    await emit_device_error(event)
                responses = []
            elif command in {"ACKNOWLEDGE_DEVICE_ERROR", "CLEAR_DEVICE_ERROR"}:
                error_code = message.get("error_code")
                if not error_code:
                    responses = [_mock_event("DEVICE_ERROR_ACTION_REJECTED", reason="missing_error_code")]
                else:
                    occurrence = "acknowledged" if command == "ACKNOWLEDGE_DEVICE_ERROR" else "cleared"
                    event = build_device_error_event(
                        error_code,
                        source="simulation",
                        occurrence=occurrence,
                        command=command,
                        scan_session_id=message.get("scan_session_id"),
                        raw_payload=message,
                    )
                    await emit_device_error(event)
                    responses = []
            else:
                responses = [
                    _mock_event(
                        "SCAN_STATUS",
                        status="idle",
                        message=f"Unknown mock command: {command}",
                    )
                ]

            for response in responses:
                await websocket.send_json(response)
    except WebSocketDisconnect:
        pass
    finally:
        _connections.discard(websocket)
