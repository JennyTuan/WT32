from __future__ import annotations

import unittest
import warnings

warnings.filterwarnings(
    "ignore",
    message=r".*asyncio\.iscoroutinefunction.*",
    category=DeprecationWarning,
)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.database import Base
from backend.device_errors.catalog import get_device_error, load_device_error_catalog, normalize_error_code
from backend.device_errors.service import build_device_error_event, extract_protocol_error_inputs, record_device_error_event
from backend.websocket import scan_ws


class DeviceErrorCatalogTests(unittest.TestCase):
    def test_catalog_resolves_normalized_error_code_with_professional_copy(self) -> None:
        definition = get_device_error("0x02010003")

        self.assertTrue(definition.known)
        self.assertEqual(definition.code, "0x02010003")
        self.assertEqual(definition.module, "高压错误码")
        self.assertEqual(definition.severity, "fatal")
        self.assertNotIn("报错", definition.professional_message)
        self.assertNotIn("联络", definition.professional_message)

    def test_catalog_normalizes_short_acq_recon_code(self) -> None:
        self.assertEqual(normalize_error_code("0xB030001"), "0x0B030001")
        self.assertTrue(get_device_error("0xB030001").known)

    def test_catalog_contains_only_actionable_professional_messages(self) -> None:
        catalog = load_device_error_catalog()

        self.assertGreaterEqual(len(catalog), 500)
        for definition in catalog.values():
            self.assertIn(definition.severity, {"fatal", "error", "warning"})
            self.assertTrue(definition.professional_message.endswith(("。", "！", "？", "；")))
            for colloquial in ("报错", "有问题", "联络", "点击"):
                self.assertNotIn(colloquial, definition.professional_message)

    def test_unknown_error_code_has_safe_fallback(self) -> None:
        definition = get_device_error("0xDEADBEEF")

        self.assertFalse(definition.known)
        self.assertEqual(definition.severity, "error")
        self.assertIn("需要工程人员确认", definition.professional_message)


class DeviceErrorDispatchTests(unittest.TestCase):
    def test_extracts_all_four_protocol_error_sources(self) -> None:
        self.assertEqual(
            extract_protocol_error_inputs({"Command": "0x12", "Result": 0, "ErrorCode": "0x01010001"})[0]["source"],
            "command_response",
        )
        self.assertEqual(
            extract_protocol_error_inputs({"Command": "0xFF", "ErrorCode": "0x02010003"})[0]["source"],
            "status_report",
        )
        self.assertEqual(
            extract_protocol_error_inputs({"Command": "0xF1", "ErrorCode": "0x04010001"})[0]["source"],
            "hardware_detail",
        )
        history = extract_protocol_error_inputs(
            {
                "Command": "0xF3",
                "Result": 1,
                "listData": [{"ErrorCode": "0x01010001"}, {"ErrorCode": "0x02010003"}],
            }
        )
        self.assertEqual([item["source"] for item in history], ["history", "history"])
        self.assertEqual(extract_protocol_error_inputs({"Command": "0x12", "Result": 1}), [])

    def test_records_structured_device_error_in_system_log(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        session_factory = sessionmaker(bind=engine)
        db = session_factory()
        try:
            event = build_device_error_event(
                "0x02010003",
                source="status_report",
                command="0xFF",
                raw_payload={"Command": "0xFF", "ErrorCode": "0x02010003"},
            )
            record_device_error_event(db, event)
            db.commit()

            row = db.query(models.SystemLog).one()
            self.assertEqual(row.level, "CRITICAL")
            self.assertEqual(row.source, "device_protocol")
            self.assertEqual(row.event, "device_error_raised")
            self.assertIn("0x02010003", row.details or "")
        finally:
            db.close()
            engine.dispose()


class DeviceErrorWebSocketTests(unittest.TestCase):
    def test_simulated_error_can_be_acknowledged_and_cleared(self) -> None:
        app = FastAPI()
        app.include_router(scan_ws.router)
        persisted: list[dict] = []
        original_persist = scan_ws._persist_device_error
        scan_ws._persist_device_error = persisted.append
        try:
            with TestClient(app).websocket_connect("/ws/scan-control") as websocket:
                for _ in range(3):
                    websocket.receive_json()

                websocket.send_json({"command": "INJECT_DEVICE_ERROR", "error_code": "0x02010003"})
                raised = websocket.receive_json()
                blocked = websocket.receive_json()
                self.assertEqual(raised["event"], "DEVICE_ERROR")
                self.assertEqual(raised["occurrence"], "raised")
                self.assertEqual(blocked["status"], "blocked")

                websocket.send_json({"command": "ACKNOWLEDGE_DEVICE_ERROR", "error_code": "0x02010003"})
                self.assertEqual(websocket.receive_json()["occurrence"], "acknowledged")

                websocket.send_json({"command": "CLEAR_DEVICE_ERROR", "error_code": "0x02010003"})
                self.assertEqual(websocket.receive_json()["occurrence"], "cleared")

            self.assertEqual([item["occurrence"] for item in persisted], ["raised", "acknowledged", "cleared"])
        finally:
            scan_ws._persist_device_error = original_persist


if __name__ == "__main__":
    unittest.main()
