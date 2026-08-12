from __future__ import annotations

import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.auth_utils import get_current_user
from backend.database import Base, get_db
from backend.routers import physician_workstation


class PhysicianOfflineAiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=self.engine)
        self.SessionTesting = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.app = FastAPI()
        self.app.include_router(physician_workstation.router, prefix="/api")
        self.app.dependency_overrides[get_db] = self._override_get_db
        self.app.dependency_overrides[get_current_user] = lambda: models.UserAccount(
            id=7, username="reviewer", display_name="Reviewer", role_code="user"
        )
        self.client = TestClient(self.app)
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "manifests").mkdir()
        self.patchers = (
            patch.object(physician_workstation, "AI_ARTIFACT_ROOT", self.root / "artifacts"),
            patch.object(physician_workstation, "_manifest_path", return_value=self.root / "manifests" / "sample.json"),
            patch.object(physician_workstation, "_load_manifest", return_value={
                "primarySeries": {"relativeDirectory": ".", "seriesInstanceUid": "1.2.3.4"},
            }),
            patch.object(physician_workstation, "_dicom_series_archive", return_value=b"dicom-series"),
        )
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self) -> None:
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temporary.cleanup()
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

    def _export_job(self) -> dict[str, object]:
        response = self.client.post("/api/physician/studies/lidc-idri-0314/ai-offline-jobs")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["content-type"], "application/zip")
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            self.assertEqual(sorted(archive.namelist()), ["job.json", "series.zip"])
            self.assertEqual(archive.read("series.zip"), b"dicom-series")
            return json.loads(archive.read("job.json"))

    def test_export_then_import_offline_result(self) -> None:
        job = self._export_job()
        result = {
            **job,
            "status": "succeeded",
            "stage": "five-lobe result ready",
            "provenance": {"model_package_version": "2.10.0"},
        }
        artifacts = {"lung_lobes": b"seg", "lung_lobe_surface": b"ply"}
        with patch.object(physician_workstation, "_offline_result_payloads", return_value=(result, artifacts)):
            response = self.client.post(
                "/api/physician/studies/lidc-idri-0314/ai-offline-results",
                content=b"result-zip",
                headers={"Content-Type": "application/zip"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["artifact_id"], f"ai-{job['run_id']}")
        self.assertEqual(len(list((self.root / "artifacts").iterdir())), 2)

    def test_import_rejects_result_for_another_study(self) -> None:
        job = self._export_job()
        result = {**job, "study_key": "another-study", "status": "succeeded"}
        artifacts = {"lung_lobes": b"seg", "lung_lobe_surface": b"ply"}
        with patch.object(physician_workstation, "_offline_result_payloads", return_value=(result, artifacts)):
            response = self.client.post(
                "/api/physician/studies/lidc-idri-0314/ai-offline-results",
                content=b"result-zip",
                headers={"Content-Type": "application/zip"},
            )

        self.assertEqual(response.status_code, 400, response.text)
        self.assertFalse((self.root / "artifacts").exists())

    def test_import_accepts_raw_totalsegmentator_nifti_bundle(self) -> None:
        result = {
            "format_version": 1,
            "study_key": "lidc-idri-0314",
            "status": "succeeded",
            "stage": "raw masks imported",
            "delivery": physician_workstation.RAW_TOTALSEG_DELIVERY,
            "provenance": {"model_package_version": "raw"},
        }
        artifacts = {"lung_lobe_surface": b"ply\nformat binary_little_endian 1.0\nend_header\n"}
        with patch.object(physician_workstation, "_imported_result_payloads", return_value=(result, artifacts)):
            response = self.client.post(
                "/api/physician/studies/lidc-idri-0314/ai-offline-results",
                content=b"raw-totalseg-zip",
                headers={"Content-Type": "application/zip"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["status"], "succeeded")
        self.assertTrue(body["artifact_id"].startswith("ai-"))
        written = list((self.root / "artifacts").iterdir())
        self.assertEqual(len(written), 1)
        self.assertTrue(written[0].name.endswith("-lung_lobe_surface.ply"))


if __name__ == "__main__":
    unittest.main()
