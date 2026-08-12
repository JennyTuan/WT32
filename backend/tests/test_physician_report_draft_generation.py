from __future__ import annotations

import json
import os
import unittest
import warnings
from unittest.mock import patch

warnings.filterwarnings("ignore", message=r".*asyncio\.iscoroutinefunction.*", category=DeprecationWarning)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.auth_utils import get_current_user
from backend.database import Base, get_db
from backend.routers import physician_workstation


class _ProviderResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return json.dumps({"choices": [{"message": {"content": "【研究原型草稿，需人工确认】\\n供人工复核。"}}]}).encode("utf-8")


class PhysicianReportDraftGenerationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=self.engine)
        self.SessionTesting = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.app = FastAPI()
        self.app.include_router(physician_workstation.router, prefix="/api")
        self.app.dependency_overrides[get_db] = self._override_get_db
        self.app.dependency_overrides[get_current_user] = lambda: models.UserAccount(id=7, username="reviewer", display_name="Reviewer", role_code="user")
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

    @patch("backend.routers.physician_workstation.urlopen", return_value=_ProviderResponse())
    @patch("backend.routers.physician_workstation._load_manifest")
    def test_report_generation_uses_text_context_and_returns_editable_draft(self, load_manifest, urlopen) -> None:
        load_manifest.return_value = {
            "manualReferenceSegmentations": [{"key": "manual-1", "label": "Reference mask"}],
        }
        with patch.dict(os.environ, {"WT32_AI_BASE_URL": "https://api.omniakey.com", "WT32_AI_API_KEY": "test-key", "WT32_AI_MODEL": "deepseek-v4-pro"}):
            response = self.client.post(
                "/api/physician/studies/lidc-idri-0314/report-draft/generate",
                json={"artifact_id": "manual-1", "content": "Existing physician note"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["model"], "deepseek-v4-pro")
        self.assertIn("研究原型草稿", response.json()["content"])
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.omniakey.com/v1/chat/completions")
        request_body = json.loads(request.data.decode("utf-8"))
        self.assertNotIn("DICOM", request_body["messages"][1]["content"])
        self.assertIn("Existing physician note", request_body["messages"][1]["content"])


if __name__ == "__main__":
    unittest.main()
