from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["scan-websocket"])


def _mock_event(event_type: str, **payload):
    return {
        "event": event_type,
        "timestamp": datetime.utcnow().isoformat(),
        **payload,
    }


@router.websocket("/ws/scan-control")
async def scan_control_ws(websocket: WebSocket):
    await websocket.accept()
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
            command = message.get("command", "UNKNOWN")

            if command == "START_SCAN":
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
        return
