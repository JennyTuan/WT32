from __future__ import annotations

import json
import unittest
import warnings

warnings.filterwarnings("ignore", message=r".*asyncio\.iscoroutinefunction.*", category=DeprecationWarning)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.database import Base, get_db
from backend.file_backed_documents import DISK_MANAGER_KEY
from backend.routers import disk_manager, system_settings


class PersistentDocumentApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=self.engine)
        self.SessionTesting = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.app = FastAPI()
        self.app.include_router(system_settings.router, prefix="/api")
        self.app.include_router(disk_manager.router, prefix="/api")
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

    def test_system_settings_are_saved_in_a_database_document(self) -> None:
        response = self.client.get("/api/system-settings/")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        payload["general"]["language"] = "en-US"

        response = self.client.put("/api/system-settings/", json=payload)
        self.assertEqual(response.status_code, 200, response.text)

        with self.SessionTesting() as db:
            row = db.get(models.PersistentDocument, "system_settings")
            self.assertIsNotNone(row)
            self.assertEqual(json.loads(row.payload)["general"]["language"], "en-US")

    def test_disk_operations_update_database_document_and_audit(self) -> None:
        state = {
            "config": {"retention_days": 7, "retention_time": "00:00", "auto_cleanup": False},
            "partitions": [{"id": "data", "name": "Data", "threshold": 80}],
            "files": [{"id": "series-1", "partition": "data", "file_size_mb": 12, "active_recon_jobs": 0, "status": "ACQUIRED", "is_locked": False, "retain_until": None}],
            "audit": [],
        }
        with self.SessionTesting.begin() as db:
            db.add(models.PersistentDocument(key=DISK_MANAGER_KEY, payload=json.dumps(state)))

        response = self.client.post("/api/disk-manager/files/reserve", json={"partition": "data", "file_ids": ["series-1"]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["updated"], ["series-1"])

        with self.SessionTesting() as db:
            stored = json.loads(db.get(models.PersistentDocument, DISK_MANAGER_KEY).payload)
            self.assertEqual(stored["files"][0]["status"], "RESERVED")
            self.assertEqual(stored["audit"][0]["action"], "RESERVE")


if __name__ == "__main__":
    unittest.main()
