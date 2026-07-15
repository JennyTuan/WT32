from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from reconstruction_service.main import create_app
from reconstruction_service.providers import ProviderJobUpdate, ProviderSubmission, UnconfiguredReconstructionProvider
from reconstruction_service.schemas import ReconstructionCapabilities, ReconstructionOutputSeries
from reconstruction_service.store import ReconstructionJobStore


class CompletingProvider:
    def __init__(self):
        self.poll_count = 0

    def capabilities(self):
        return ReconstructionCapabilities(
            service_ready=True,
            provider_name="test-provider",
            supports_metal_artifact_reduction=True,
        )

    def submit(self, request):
        self.request = request
        return ProviderSubmission(provider_job_id="provider-job-1")

    def get_status(self, provider_job_id):
        self.poll_count += 1
        if self.poll_count == 1:
            return ProviderJobUpdate(status="running", progress=45)
        return ProviderJobUpdate(
            status="completed",
            progress=100,
            output_series=ReconstructionOutputSeries(
                series_id="derived-mar-1",
                series_description="Brain MAR",
                image_urls=["/dicom-derived/001.dcm", "/dicom-derived/002.dcm"],
                image_count=2,
                kernel="FC21",
                slice_thickness=1.0,
                slice_spacing=0.8,
                fov=240,
                matrix=512,
                window_width=100,
                window_level=35,
                metal_artifact_reduction=True,
            ),
        )

    def cancel(self, provider_job_id):
        return ProviderJobUpdate(status="cancelled", progress=0)


def request_payload():
    return {
        "scan_session_id": 1,
        "source_series": {
            "series_id": "brain-thick",
            "image_urls": ["/dicom/source/001.dcm"],
        },
        "parameters": {
            "slice_thickness": 1.0,
            "slice_spacing": 0.8,
            "kernel": "FC21",
            "fov": 240,
            "matrix": 512,
            "metal_artifact_reduction": True,
        },
    }


class ReconstructionServiceApiTests(unittest.TestCase):
    def make_client(self, provider):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        store = ReconstructionJobStore(Path(temp_dir.name) / "jobs.db")
        client = TestClient(create_app(provider=provider, store=store))
        self.addCleanup(client.close)
        return client

    def test_unconfigured_provider_rejects_submission(self):
        client = self.make_client(UnconfiguredReconstructionProvider())
        response = client.post("/api/v1/reconstruction/jobs", json=request_payload())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "RECONSTRUCTION_ENGINE_NOT_CONFIGURED")

    def test_job_progresses_and_returns_output_series(self):
        client = self.make_client(CompletingProvider())
        created = client.post("/api/v1/reconstruction/jobs", json=request_payload())
        self.assertEqual(created.status_code, 202)
        job_id = created.json()["job_id"]

        running = client.get(f"/api/v1/reconstruction/jobs/{job_id}")
        self.assertEqual(running.json()["status"], "running")
        self.assertEqual(running.json()["progress"], 45)

        completed = client.get(f"/api/v1/reconstruction/jobs/{job_id}")
        body = completed.json()
        self.assertEqual(body["status"], "completed")
        self.assertEqual(body["output_series"]["series_id"], "derived-mar-1")
        self.assertTrue(body["output_series"]["metal_artifact_reduction"])

        history = client.get("/api/v1/reconstruction/jobs?scan_session_id=1")
        self.assertEqual(history.status_code, 200)
        self.assertEqual([item["job_id"] for item in history.json()], [job_id])


if __name__ == "__main__":
    unittest.main()
