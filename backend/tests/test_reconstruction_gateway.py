from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers import reconstruction


class ReconstructionGatewayTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(reconstruction.router, prefix="/api")
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    @patch("backend.routers.reconstruction._service_request")
    def test_create_job_forwards_payload(self, service_request):
        service_request.return_value = (202, {"job_id": "recon-1", "status": "queued"})
        payload = {
            "source_series": {"series_id": "series-1", "image_urls": []},
            "parameters": {
                "slice_thickness": 1.0,
                "slice_spacing": 0.8,
                "kernel": "FC21",
                "fov": 240,
                "matrix": 512,
            },
        }
        response = self.client.post("/api/reconstruction/jobs", json=payload)
        self.assertEqual(response.status_code, 202)
        service_request.assert_called_once_with("POST", "/api/v1/reconstruction/jobs", payload)

    @patch("backend.routers.reconstruction._service_request")
    def test_get_job_forwards_job_id(self, service_request):
        service_request.return_value = (200, {"job_id": "recon-1", "status": "completed"})
        response = self.client.get("/api/reconstruction/jobs/recon-1")
        self.assertEqual(response.status_code, 200)
        service_request.assert_called_once_with("GET", "/api/v1/reconstruction/jobs/recon-1")


if __name__ == "__main__":
    unittest.main()
