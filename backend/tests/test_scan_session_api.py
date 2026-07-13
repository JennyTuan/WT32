from __future__ import annotations

import unittest
import warnings
from datetime import date

warnings.filterwarnings(
    "ignore",
    message=r".*asyncio\.iscoroutinefunction.*",
    category=DeprecationWarning,
)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.database import Base, get_db
from backend.routers import protocols, scan_sessions


class ScanSessionApiTests(unittest.TestCase):
    def setUp(self) -> None:
        warnings.filterwarnings(
            "ignore",
            message=r".*asyncio\.iscoroutinefunction.*",
            category=DeprecationWarning,
        )
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(self.engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        Base.metadata.create_all(bind=self.engine)
        self.SessionTesting = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self._seed_scan_session_fixture()

        self.app = FastAPI()
        self.app.include_router(protocols.router, prefix="/api")
        self.app.include_router(scan_sessions.router, prefix="/api")
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

    def _seed_scan_session_fixture(self) -> None:
        db = self.SessionTesting()
        try:
            patient = models.Patient(
                name="Test Patient",
                patient_id="P-API-001",
                gender="male",
                age=46,
                birth_date=date(1980, 1, 1),
                height=170.0,
                weight=68.0,
            )
            protocol = models.Protocol(
                name="API Snapshot Protocol",
                body_part="HEAD",
                age_group="adult",
                patient_weight="50-90kg",
                patient_position="HFS",
                table_direction="in",
                acquisition_type="regular",
                scan_mode="plain",
                description="API test protocol",
            )
            series = models.Series(
                series_order=1,
                series_type="helical",
                series_label="Helical",
            )
            series.helical_param = models.HelicalParam(
                kv=120,
                ma=180,
                slice_thickness=1.0,
                pitch=0.8,
                rotation_time=0.5,
                scan_length=220.0,
                fov=260.0,
                collimator="128x0.6",
                scan_direction="OUT",
                dom="1",
                ctdi_vol=12.5,
                dlp=275.0,
                auto_ma=True,
                ma_min=80.0,
                ma_max=360.0,
            )
            series.recon_series.append(
                models.ReconSeries(
                    recon_name="Soft Tissue",
                    recon_type="soft",
                    kernel="B30",
                    matrix=512,
                    window_width=400,
                    window_level=40,
                    slice_thickness=1.0,
                    increment=0.7,
                    recon_fov=220.0,
                    center_x=3.5,
                    center_y=-4.5,
                )
            )
            protocol.series.append(series)
            db.add_all([patient, protocol])
            db.commit()
            self.patient_id = patient.id
            self.protocol_id = protocol.id
            self.template_series_id = series.id
            self.template_helical_param_id = series.helical_param.id
            self.template_recon_id = series.recon_series[0].id
        finally:
            db.close()

    def _create_scan_session(self) -> dict:
        response = self.client.post(
            "/api/scan-sessions/",
            json={
                "patient_id": self.patient_id,
                "protocol_id": self.protocol_id,
                "session_name": "Exam 001",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def _add_preceding_topogram(self, scan_session_id: int) -> tuple[int, int]:
        db = self.SessionTesting()
        try:
            helical = (
                db.query(models.ScanSessionSeries)
                .filter(
                    models.ScanSessionSeries.scan_session_id == scan_session_id,
                    models.ScanSessionSeries.series_type == "helical",
                )
                .one()
            )
            helical.series_order = 2
            topogram = models.ScanSessionSeries(
                scan_session_id=scan_session_id,
                series_order=1,
                series_type="topogram",
                series_label="Scout",
            )
            topogram.topogram_param = models.ScanSessionTopogramParam(
                kv=100,
                ma=30,
                scan_length=300.0,
                tube_angle=180.0,
                fov=300.0,
            )
            db.add(topogram)
            db.commit()
            return topogram.id, helical.id
        finally:
            db.close()

    def test_create_scan_session_clones_protocol_template_snapshot_through_api(self) -> None:
        scan_session = self._create_scan_session()

        self.assertEqual(scan_session["status"], "draft")
        self.assertEqual(scan_session["name"], "API Snapshot Protocol")
        self.assertEqual(scan_session["session_name"], "Exam 001")
        self.assertEqual(scan_session["acquisition_type"], "regular")
        self.assertEqual(scan_session["scan_mode"], "plain")

        self.assertEqual(len(scan_session["series"]), 1)
        session_series = scan_session["series"][0]
        self.assertEqual(session_series["template_series_id"], self.template_series_id)
        self.assertEqual(session_series["series_type"], "helical")
        self.assertEqual(session_series["series_label"], "Helical")
        self.assertEqual(session_series["execution_status"], "pending")
        self.assertFalse(session_series["range_confirmed"])

        helical = session_series["helical_param"]
        self.assertIsNotNone(helical)
        self.assertEqual(helical["template_param_id"], self.template_helical_param_id)
        self.assertEqual(helical["kv"], 120)
        self.assertEqual(helical["ma"], 180)
        self.assertEqual(helical["collimator"], "128x0.6")
        self.assertEqual(helical["scan_direction"], "OUT")
        self.assertEqual(helical["dom"], "1")
        self.assertTrue(helical["auto_ma"])
        self.assertEqual(helical["ma_min"], 80.0)
        self.assertEqual(helical["ma_max"], 360.0)

        recon = session_series["recon_series"][0]
        self.assertEqual(recon["template_recon_series_id"], self.template_recon_id)
        self.assertEqual(recon["recon_fov"], 220.0)
        self.assertEqual(recon["center_x"], 3.5)
        self.assertEqual(recon["center_y"], -4.5)

    def test_update_scan_session_helical_param_does_not_mutate_protocol_template(self) -> None:
        scan_session = self._create_scan_session()
        session_helical_id = scan_session["series"][0]["helical_param"]["id"]

        update_response = self.client.put(
            f"/api/scan-sessions/helical/{session_helical_id}",
            json={
                "ma": 260,
                "scan_length": 250.0,
                "ctdi_vol": 13.7,
                "auto_ma": False,
            },
        )
        self.assertEqual(update_response.status_code, 200, update_response.text)
        updated_helical = update_response.json()
        self.assertEqual(updated_helical["ma"], 260)
        self.assertEqual(updated_helical["scan_length"], 250.0)
        self.assertEqual(updated_helical["ctdi_vol"], 13.7)
        self.assertFalse(updated_helical["auto_ma"])

        session_response = self.client.get(f"/api/scan-sessions/{scan_session['id']}")
        self.assertEqual(session_response.status_code, 200, session_response.text)
        session_helical = session_response.json()["series"][0]["helical_param"]
        self.assertEqual(session_helical["ma"], 260)
        self.assertEqual(session_helical["scan_length"], 250.0)
        self.assertEqual(session_helical["ctdi_vol"], 13.7)

        protocol_response = self.client.get(f"/api/protocols/{self.protocol_id}")
        self.assertEqual(protocol_response.status_code, 200, protocol_response.text)
        template_helical = protocol_response.json()["series"][0]["helical_param"]
        self.assertEqual(template_helical["ma"], 180)
        self.assertEqual(template_helical["scan_length"], 220.0)
        self.assertEqual(template_helical["ctdi_vol"], 12.5)
        self.assertTrue(template_helical["auto_ma"])

    def test_duplicate_and_delete_scan_session_series_keep_contiguous_order(self) -> None:
        scan_session = self._create_scan_session()
        original_series = scan_session["series"][0]

        duplicate_response = self.client.post(
            f"/api/scan-sessions/series/{original_series['id']}/duplicate"
        )
        self.assertEqual(duplicate_response.status_code, 200, duplicate_response.text)
        duplicated_session = duplicate_response.json()
        self.assertEqual([series["series_order"] for series in duplicated_session["series"]], [1, 2])

        copied_series = duplicated_session["series"][1]
        self.assertEqual(copied_series["series_label"], "Helical Copy")
        self.assertEqual(copied_series["template_series_id"], self.template_series_id)
        self.assertEqual(copied_series["helical_param"]["template_param_id"], self.template_helical_param_id)
        self.assertEqual(copied_series["helical_param"]["ma"], 180)
        self.assertEqual(copied_series["helical_param"]["collimator"], "128x0.6")
        self.assertEqual(copied_series["recon_series"][0]["template_recon_series_id"], self.template_recon_id)

        delete_response = self.client.delete(f"/api/scan-sessions/series/{original_series['id']}")
        self.assertEqual(delete_response.status_code, 200, delete_response.text)
        remaining_session = delete_response.json()
        self.assertEqual(len(remaining_session["series"]), 1)
        self.assertEqual(remaining_session["series"][0]["series_order"], 1)
        self.assertEqual(remaining_session["series"][0]["series_label"], "Helical Copy")

    def test_dependent_helical_scan_is_blocked_until_topogram_image_and_range_are_ready(self) -> None:
        scan_session = self._create_scan_session()
        topogram_id, helical_id = self._add_preceding_topogram(scan_session["id"])

        blocked = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(blocked.status_code, 409, blocked.text)

        self.assertEqual(
            self.client.put(
                f"/api/scan-sessions/series/{topogram_id}/execution",
                json={"execution_status": "running"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.put(
                f"/api/scan-sessions/series/{topogram_id}/execution",
                json={"execution_status": "image_ready"},
            ).status_code,
            200,
        )

        missing_range = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(missing_range.status_code, 409, missing_range.text)

        confirmed = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={"range_confirmed": True},
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertTrue(confirmed.json()["range_confirmed"])

        allowed = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(allowed.status_code, 200, allowed.text)
        self.assertEqual(allowed.json()["execution_status"], "running")

    def test_failed_topogram_clears_range_and_cannot_confirm_it(self) -> None:
        scan_session = self._create_scan_session()
        topogram_id, _ = self._add_preceding_topogram(scan_session["id"])

        failed = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={"execution_status": "failed", "failure_reason": "Image reconstruction failed"},
        )
        self.assertEqual(failed.status_code, 200, failed.text)
        self.assertEqual(failed.json()["failure_reason"], "Image reconstruction failed")
        self.assertFalse(failed.json()["range_confirmed"])

        confirm = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={"range_confirmed": True},
        )
        self.assertEqual(confirm.status_code, 409, confirm.text)

    def test_series_without_preceding_topogram_keeps_existing_execution_path(self) -> None:
        scan_session = self._create_scan_session()
        helical_id = scan_session["series"][0]["id"]
        response = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(response.status_code, 200, response.text)


if __name__ == "__main__":
    unittest.main()
