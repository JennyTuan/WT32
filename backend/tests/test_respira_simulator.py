from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.main import app
from backend.routers import respira_simulator


class RespiraSimulatorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health_and_start_are_explicitly_simulated(self) -> None:
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()["simulated"])

        started = self.client.post("/startReceive")
        self.assertEqual(started.status_code, 200)
        self.assertTrue(started.json()["simulated"])

    def test_engine_io_breath_namespace_emits_simulated_samples(self) -> None:
        with self.client.websocket_connect("/socket.io/?EIO=4&transport=websocket") as websocket:
            self.assertTrue(websocket.receive_text().startswith("0"))
            websocket.send_text("40/breath,")
            self.assertTrue(websocket.receive_text().startswith("40/breath,"))

            messages = [websocket.receive_text() for _ in range(4)]
            event_messages = [message for message in messages if message.startswith("42/breath,")]
            self.assertTrue(event_messages)
            payload = json.loads(event_messages[0].split(",", 1)[1])
            self.assertEqual(payload[0], "breath")
            self.assertTrue(payload[1]["simulated"])

    def test_engine_io_server_ping_accepts_pong_and_repeats(self) -> None:
        with (
            patch.object(respira_simulator, "ENGINE_IO_PING_INTERVAL_S", 0.01),
            patch.object(respira_simulator, "ENGINE_IO_PING_TIMEOUT_S", 0.2),
            self.client.websocket_connect(
                "/socket.io/?EIO=4&transport=websocket"
            ) as websocket,
        ):
            open_packet = json.loads(websocket.receive_text()[1:])
            self.assertEqual(open_packet["pingInterval"], 10)
            self.assertEqual(open_packet["pingTimeout"], 200)
            self.assertEqual(websocket.receive_text(), "2")
            websocket.send_text("3")
            self.assertEqual(websocket.receive_text(), "2")

    def test_engine_io_connection_closes_after_missing_pong(self) -> None:
        with (
            patch.object(respira_simulator, "ENGINE_IO_PING_INTERVAL_S", 0.01),
            patch.object(respira_simulator, "ENGINE_IO_PING_TIMEOUT_S", 0.02),
            self.client.websocket_connect(
                "/socket.io/?EIO=4&transport=websocket"
            ) as websocket,
        ):
            websocket.receive_text()
            self.assertEqual(websocket.receive_text(), "2")
            with self.assertRaises(WebSocketDisconnect):
                websocket.receive_text()


if __name__ == "__main__":
    unittest.main()
