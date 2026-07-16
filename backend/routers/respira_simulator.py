from __future__ import annotations

import asyncio
import json
import math
import random
import time

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect


router = APIRouter(tags=["respira-simulator"])

ENGINE_IO_PING_INTERVAL_S = 20.0
ENGINE_IO_PING_TIMEOUT_S = 10.0
SIMULATED_SAMPLE_INTERVAL_S = 0.08


@router.get("/health")
def respira_simulator_health():
    """本地原型专用 RespiraScope 兼容健康检查，不代表真实设备连接。"""
    return {
        "status": "ok",
        "service": "wt32-respirascope-simulator",
        "simulated": True,
    }


@router.post("/startReceive")
def start_simulated_respira_receive():
    """保持与 RespiraScope 客户端契约一致；波形由 WebSocket 按连接生成。"""
    return {
        "status": "started",
        "service": "wt32-respirascope-simulator",
        "simulated": True,
    }


def _socket_event(payload_type: str, data) -> str:
    event = ["breath", {"type": payload_type, "data": data, "simulated": True}]
    return f"42/breath,{json.dumps(event, ensure_ascii=False, separators=(',', ':'))}"


@router.websocket("/socket.io/")
async def respira_simulator_socket(websocket: WebSocket):
    if websocket.query_params.get("EIO") != "4" or websocket.query_params.get("transport") != "websocket":
        raise HTTPException(status_code=400, detail="Engine.IO 4 WebSocket transport is required")

    await websocket.accept()
    await websocket.send_text(
        "0" + json.dumps(
            {
                "sid": f"wt32-sim-{int(time.time() * 1000)}",
                "upgrades": [],
                "pingInterval": int(ENGINE_IO_PING_INTERVAL_S * 1000),
                "pingTimeout": int(ENGINE_IO_PING_TIMEOUT_S * 1000),
                "maxPayload": 1000000,
            },
            separators=(",", ":"),
        )
    )

    namespace_connected = False
    sequence = 0
    started_at = time.monotonic()
    last_metrics_sequence = -1
    next_ping_at = started_at + ENGINE_IO_PING_INTERVAL_S
    ping_sent_at: float | None = None

    try:
        while True:
            now = time.monotonic()
            if (
                ping_sent_at is not None
                and now - ping_sent_at >= ENGINE_IO_PING_TIMEOUT_S
            ):
                await websocket.close(code=1001, reason="Engine.IO pong timeout")
                return

            deadlines = [now + SIMULATED_SAMPLE_INTERVAL_S]
            if ping_sent_at is None:
                deadlines.append(next_ping_at)
            else:
                deadlines.append(ping_sent_at + ENGINE_IO_PING_TIMEOUT_S)
            receive_timeout = max(0.001, min(deadlines) - now)
            try:
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=receive_timeout,
                )
                if message.startswith("40/breath"):
                    namespace_connected = True
                    await websocket.send_text("40/breath,{}")
                elif message == "3" and ping_sent_at is not None:
                    ping_sent_at = None
                    next_ping_at = time.monotonic() + ENGINE_IO_PING_INTERVAL_S
                elif message == "2":
                    # 兼容只会主动 ping 的简化客户端；标准 Engine.IO 4 心跳由服务端发起。
                    await websocket.send_text("3")
            except asyncio.TimeoutError:
                pass

            now = time.monotonic()
            if ping_sent_at is None and now >= next_ping_at:
                await websocket.send_text("2")
                ping_sent_at = now

            if not namespace_connected:
                continue

            elapsed = time.monotonic() - started_at
            cycle = math.sin(elapsed * (2 * math.pi / 4.2))
            filtered = 500.0 + cycle * 205.0 + math.sin(elapsed * 0.21) * 18.0
            raw = filtered + random.uniform(-10.0, 10.0)
            await websocket.send_text(_socket_event("raw", [[sequence, round(raw, 3)]]))
            await websocket.send_text(_socket_event("filtered", [[sequence, round(filtered, 3)]]))

            metrics_bucket = sequence // 12
            if metrics_bucket != last_metrics_sequence:
                last_metrics_sequence = metrics_bucket
                await websocket.send_text(
                    _socket_event(
                        "metrics",
                        {
                            "bpm": 14.3,
                            "quality": "simulated_stable",
                            "breath_count": max(0, int(elapsed / 4.2)),
                            "interval_cv": 0.04,
                        },
                    )
                )
                await websocket.send_text(
                    _socket_event(
                        "signal_quality",
                        {
                            "sequence": sequence,
                            "value": round(filtered, 3),
                            "quality": "simulated",
                            "details": {"source": "WT32 local simulator"},
                        },
                    )
                )
            sequence += 1
    except WebSocketDisconnect:
        return
