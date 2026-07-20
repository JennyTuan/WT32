from __future__ import annotations

import json
import unittest
import warnings
from datetime import datetime, timezone

warnings.filterwarnings("ignore", message=r".*asyncio\.iscoroutinefunction.*", category=DeprecationWarning)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.database import Base, get_db
from backend.file_backed_documents import DAILY_QA_KEY, DISK_MANAGER_KEY
from backend.routers import reports


class ReportsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=self.engine)
        self.SessionTesting = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self._seed_fixture()
        self.app = FastAPI()
        self.app.include_router(reports.router, prefix="/api")
        self.app.dependency_overrides[get_db] = self._override_get_db
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.client.close()
        self.app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def _override_get_db(self):
        db = self.SessionTesting()
        try:
            yield db
        finally:
            db.close()

    def _seed_fixture(self) -> None:
        completed_at = datetime(2026, 7, 20, 10, 30, tzinfo=timezone.utc)
        with self.SessionTesting.begin() as db:
            patient = models.Patient(name="报告测试患者", patient_id="REPORT-001", gender="female", age=42)
            protocol = models.Protocol(
                name="报告测试协议",
                body_part="CHEST",
                age_group="adult",
                patient_weight="50-90kg",
                patient_position="HFS",
                table_direction="in",
                acquisition_type="regular",
                scan_mode="plain",
            )
            db.add_all([patient, protocol])
            db.flush()
            session = models.ScanSession(
                patient_id=patient.id,
                protocol_id=protocol.id,
                status="completed",
                name="报告测试会话",
                body_part="CHEST",
                age_group="adult",
                patient_weight="50-90kg",
                patient_position="HFS",
                table_direction="in",
                acquisition_type="regular",
                scan_mode="plain",
                completed_at=completed_at,
            )
            db.add(session)
            db.flush()
            db.add(models.ScanSessionSeries(
                scan_session_id=session.id,
                series_order=1,
                series_type="helical",
                series_label="常规螺旋扫描",
            ))
            db.add(models.SystemLog(
                timestamp=completed_at,
                level="INFO",
                source="scan_sessions",
                event="scan_completed",
                message="扫描完成",
                scan_session_id=session.id,
            ))
            db.add(models.SystemLog(
                timestamp=completed_at,
                level="WARNING",
                source="main",
                event="test_warning",
                message="测试告警",
            ))
            db.add(models.PersistentDocument(
                key=DAILY_QA_KEY,
                payload=json.dumps([
                    {"id": "qa-1", "date": "2026-07-20", "time": "09:00", "operator": "质控技师", "phantomType": "水模", "judgment": "PASS"},
                    {"id": "qa-2", "date": "2026-07-19", "time": "09:00", "operator": "夜班技师", "phantomType": "气模", "judgment": "FAIL"},
                ], ensure_ascii=False),
            ))
            db.add(models.PersistentDocument(
                key=DISK_MANAGER_KEY,
                payload=json.dumps({
                    "config": {}, "partitions": [], "files": [],
                    "audit": [{"timestamp": "2026-07-20T11:00:00+00:00", "action": "RESERVE", "partition": "data", "file_ids": ["series-1"], "result": "success"}],
                }),
            ))

    def test_qa_report_filters_database_backed_records(self) -> None:
        response = self.client.get("/api/reports/qa", params={"date_from": "2026-07-20", "operator": "质控技师"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["items"][0]["id"], "qa-1")
        self.assertEqual(payload["operators"], ["夜班技师", "质控技师"])

    def test_runtime_stats_aggregate_completed_sessions_and_logs(self) -> None:
        response = self.client.get("/api/reports/runtime-stats", params={"date_from": "2026-07-20", "date_to": "2026-07-20"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["completed_scans"], 1)
        self.assertEqual(payload["completed_scans_all_time"], 1)
        self.assertEqual(payload["scan_mix"], {"helical": 1})
        self.assertEqual(payload["daily_scans"], [{"date": "2026-07-20", "count": 1}])
        self.assertEqual(payload["alerts"], {"errors": 0, "warnings": 1})
        self.assertIsNone(payload["telemetry"]["power_on_hours"])

    def test_audit_report_combines_system_and_disk_database_records(self) -> None:
        response = self.client.get("/api/reports/audit")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(len(payload["system_logs"]), 1)
        self.assertEqual(payload["system_logs"][0]["event"], "scan_completed")
        self.assertEqual(len(payload["disk_logs"]), 1)
        self.assertEqual(payload["disk_logs"][0]["action"], "RESERVE")


if __name__ == "__main__":
    unittest.main()
