from __future__ import annotations

import unittest
import warnings
from datetime import date
from unittest.mock import patch

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
                rotation_time=0.75,
                scan_length=220.0,
                fov=260.0,
                collimator="128x0.6",
                scan_direction="HEAD_TO_FOOT",
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

    def _add_axial_with_preceding_topogram(self, scan_session_id: int) -> tuple[int, int]:
        db = self.SessionTesting()
        try:
            topogram = models.ScanSessionSeries(
                scan_session_id=scan_session_id,
                series_order=2,
                series_type="topogram",
                series_label="Axial Scout",
            )
            topogram.topogram_param = models.ScanSessionTopogramParam(
                kv=100,
                ma=30,
                scan_length=300.0,
                tube_angle=180.0,
                fov=300.0,
            )
            axial = models.ScanSessionSeries(
                scan_session_id=scan_session_id,
                series_order=3,
                series_type="axial",
                series_label="Axial",
            )
            db.add_all([topogram, axial])
            db.commit()
            return topogram.id, axial.id
        finally:
            db.close()

    def _add_four_d_with_preceding_topogram(self, scan_session_id: int) -> tuple[int, int]:
        db = self.SessionTesting()
        try:
            topogram = models.ScanSessionSeries(
                scan_session_id=scan_session_id,
                series_order=2,
                series_type="topogram",
                series_label="4D Scout",
            )
            topogram.topogram_param = models.ScanSessionTopogramParam(
                kv=100,
                ma=30,
                scan_length=300.0,
                tube_angle=180.0,
                fov=300.0,
            )
            four_d = models.ScanSessionSeries(
                scan_session_id=scan_session_id,
                series_order=3,
                series_type="4d",
                series_label="4D Diagnostic",
            )
            db.add_all([topogram, four_d])
            db.commit()
            return topogram.id, four_d.id
        finally:
            db.close()

    def _add_mutation_guard_entities(self, scan_session_id: int) -> dict[str, int]:
        db = self.SessionTesting()
        try:
            scan_session = db.get(models.ScanSession, scan_session_id)
            helical = next(
                series
                for series in scan_session.series
                if series.series_type == "helical"
            )
            scan_session.contrast_config = models.ScanSessionContrastConfig(
                contrast_agent="Simulation only",
                concentration=300.0,
                total_volume=60.0,
                injection_rate=3.0,
                saline_volume=20.0,
                saline_rate=3.0,
            )
            topogram = models.ScanSessionSeries(
                series_order=2,
                series_type="topogram",
                series_label="Mutation guard topogram",
            )
            topogram.topogram_param = models.ScanSessionTopogramParam(
                kv=100,
                ma=30,
                scan_length=300.0,
                tube_angle=180.0,
                fov=300.0,
            )
            axial = models.ScanSessionSeries(
                series_order=3,
                series_type="axial",
                series_label="Mutation guard axial",
            )
            axial.axial_param = models.ScanSessionAxialParam(
                kv=120,
                ma=150,
                slice_thickness=2.0,
                slice_interval=2.0,
                rotation_time=0.75,
                scan_length=200.0,
                fov=300.0,
                auto_ma=False,
            )
            four_d = models.ScanSessionSeries(
                series_order=4,
                series_type="4d",
                series_label="Mutation guard 4D",
            )
            four_d.fourd_config = models.ScanSessionFourDConfig(
                breathing_mode="free_breathing",
                phase_count=10,
                acquisition_time=30.0,
            )
            four_d.fourd_config.breathing_training_param = (
                models.ScanSessionBreathingTrainingParam(
                    training_duration=20.0,
                    target_amplitude=10.0,
                    tolerance_range=2.0,
                )
            )
            scan_session.series.extend([topogram, axial, four_d])
            db.commit()
            return {
                "contrast_id": scan_session.contrast_config.id,
                "helical_id": helical.id,
                "helical_param_id": helical.helical_param.id,
                "recon_id": helical.recon_series[0].id,
                "topogram_id": topogram.id,
                "topogram_param_id": topogram.topogram_param.id,
                "axial_id": axial.id,
                "axial_param_id": axial.axial_param.id,
                "fourd_id": four_d.id,
                "fourd_config_id": four_d.fourd_config.id,
                "training_id": four_d.fourd_config.breathing_training_param.id,
            }
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
        self.assertIsNone(session_series["image_source_id"])
        self.assertIsNone(session_series["image_source_version"])
        self.assertEqual(session_series["scan_planning"]["scan_direction"], "HEAD_TO_FOOT")
        self.assertIsNone(session_series["scan_planning"]["range_min_position_mm"])
        self.assertIsNone(session_series["scan_planning"]["range_max_position_mm"])

        helical = session_series["helical_param"]
        self.assertIsNotNone(helical)
        self.assertEqual(helical["template_param_id"], self.template_helical_param_id)
        self.assertEqual(helical["kv"], 120)
        self.assertEqual(helical["ma"], 180)
        self.assertEqual(helical["collimator"], "128x0.6")
        self.assertEqual(helical["scan_direction"], "HEAD_TO_FOOT")
        self.assertEqual(helical["dom"], "1")
        self.assertTrue(helical["auto_ma"])
        self.assertEqual(helical["ma_min"], 80.0)
        self.assertEqual(helical["ma_max"], 360.0)

        recon = session_series["recon_series"][0]
        self.assertEqual(recon["template_recon_series_id"], self.template_recon_id)
        self.assertEqual(recon["recon_fov"], 220.0)
        self.assertEqual(recon["center_x"], 3.5)
        self.assertEqual(recon["center_y"], -4.5)

    def test_scan_planning_binds_a_diagnostic_series_to_its_preceding_topogram(self) -> None:
        scan_session = self._create_scan_session()
        target_series = scan_session["series"][0]

        db = self.SessionTesting()
        try:
            topogram = models.ScanSessionSeries(
                scan_session_id=scan_session["id"],
                series_order=0,
                series_type="topogram",
                series_label="Scout",
            )
            topogram.scan_planning = models.ScanSessionScanPlanning(
                range_min_position_mm=320.0,
                range_max_position_mm=780.0,
                scan_direction="HEAD_TO_FOOT",
            )
            db.add(topogram)
            db.commit()
            topogram_id = topogram.id
        finally:
            db.close()

        response = self.client.put(
            f"/api/scan-sessions/series/{target_series['id']}/planning",
            json={
                "source_topogram_series_id": topogram_id,
                "range_min_position_mm": 410.0,
                "range_max_position_mm": 520.0,
                "scan_direction": "FOOT_TO_HEAD",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        planning = response.json()
        self.assertEqual(planning["source_topogram_series_id"], topogram_id)
        self.assertEqual(planning["range_min_position_mm"], 410.0)
        self.assertEqual(planning["range_max_position_mm"], 520.0)
        self.assertEqual(planning["scan_direction"], "FOOT_TO_HEAD")

        refreshed = self.client.get(f"/api/scan-sessions/{scan_session['id']}")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        target = next(item for item in refreshed.json()["series"] if item["id"] == target_series["id"])
        self.assertEqual(target["helical_param"]["scan_length"], 110.0)
        self.assertEqual(target["helical_param"]["scan_direction"], "FOOT_TO_HEAD")

    def test_scan_planning_rejects_reversed_range_and_missing_topogram_reference(self) -> None:
        scan_session = self._create_scan_session()
        target_series = scan_session["series"][0]

        reversed_range = self.client.put(
            f"/api/scan-sessions/series/{target_series['id']}/planning",
            json={
                "range_min_position_mm": 520.0,
                "range_max_position_mm": 410.0,
                "scan_direction": "HEAD_TO_FOOT",
            },
        )
        self.assertEqual(reversed_range.status_code, 422)

        missing_source = self.client.put(
            f"/api/scan-sessions/series/{target_series['id']}/planning",
            json={
                "range_min_position_mm": 410.0,
                "range_max_position_mm": 520.0,
                "scan_direction": "HEAD_TO_FOOT",
            },
        )
        self.assertEqual(missing_source.status_code, 422)

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

    def test_parameter_change_invalidates_previously_confirmed_topogram_range(self) -> None:
        scan_session = self._create_scan_session()
        topogram_id, _ = self._add_preceding_topogram(scan_session["id"])
        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)

        for payload in (
            {"execution_status": "running"},
            {"execution_status": "image_ready"},
            {"range_confirmed": True},
        ):
            response = self.client.put(
                f"/api/scan-sessions/series/{topogram_id}/execution",
                json=payload,
            )
            self.assertEqual(response.status_code, 200, response.text)

        detail = self.client.get(f"/api/scan-sessions/{scan_session['id']}").json()
        helical = next(series for series in detail["series"] if series["series_type"] == "helical")

        replay = self.client.put(
            f"/api/scan-sessions/helical/{helical['helical_param']['id']}",
            json={"ma": helical["helical_param"]["ma"]},
        )
        self.assertEqual(replay.status_code, 200, replay.text)
        unchanged = self.client.get(f"/api/scan-sessions/{scan_session['id']}").json()
        unchanged_topogram = next(series for series in unchanged["series"] if series["id"] == topogram_id)
        self.assertTrue(unchanged_topogram["range_confirmed"])

        changed = self.client.put(
            f"/api/scan-sessions/helical/{helical['helical_param']['id']}",
            json={"ma": helical["helical_param"]["ma"] + 1},
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        refreshed = self.client.get(f"/api/scan-sessions/{scan_session['id']}").json()
        refreshed_topogram = next(series for series in refreshed["series"] if series["id"] == topogram_id)
        self.assertFalse(refreshed_topogram["range_confirmed"])

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

    def test_create_series_normalizes_order_after_structure_guard_loaded_series(self) -> None:
        scan_session = self._create_scan_session()
        created = self.client.post(
            f"/api/scan-sessions/{scan_session['id']}/series",
            json={
                "series_order": 0,
                "series_type": "axial",
                "series_label": "Inserted Axial",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        series = created.json()["series"]
        self.assertEqual([item["series_order"] for item in series], [1, 2])
        self.assertEqual(series[0]["series_label"], "Inserted Axial")

    def test_dependent_helical_scan_is_blocked_until_topogram_image_and_range_are_ready(self) -> None:
        scan_session = self._create_scan_session()
        topogram_id, helical_id = self._add_preceding_topogram(scan_session["id"])
        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)

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
        topogram_ready = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={
                "execution_status": "image_ready",
                "image_source_id": "head-stroke-topogram",
                "image_source_version": 1,
            },
        )
        self.assertEqual(topogram_ready.status_code, 200, topogram_ready.text)
        self.assertEqual(topogram_ready.json()["image_source_id"], "head-stroke-topogram")

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

    def test_dependent_axial_scan_uses_the_same_topogram_prerequisite(self) -> None:
        scan_session = self._create_scan_session()
        topogram_id, axial_id = self._add_axial_with_preceding_topogram(scan_session["id"])
        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)

        blocked = self.client.put(
            f"/api/scan-sessions/series/{axial_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(blocked.status_code, 409, blocked.text)

        for payload in (
            {"execution_status": "running"},
            {"execution_status": "image_ready"},
            {"range_confirmed": True},
        ):
            response = self.client.put(
                f"/api/scan-sessions/series/{topogram_id}/execution",
                json=payload,
            )
            self.assertEqual(response.status_code, 200, response.text)

        allowed = self.client.put(
            f"/api/scan-sessions/series/{axial_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(allowed.status_code, 200, allowed.text)

    def test_dependent_four_d_scan_uses_the_same_topogram_prerequisite(self) -> None:
        scan_session = self._create_scan_session()
        topogram_id, four_d_id = self._add_four_d_with_preceding_topogram(scan_session["id"])
        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)

        blocked = self.client.put(
            f"/api/scan-sessions/series/{four_d_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(blocked.status_code, 409, blocked.text)

        for payload in (
            {"execution_status": "running"},
            {"execution_status": "image_ready"},
        ):
            response = self.client.put(
                f"/api/scan-sessions/series/{topogram_id}/execution",
                json=payload,
            )
            self.assertEqual(response.status_code, 200, response.text)

        missing_range = self.client.put(
            f"/api/scan-sessions/series/{four_d_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(missing_range.status_code, 409, missing_range.text)

        confirmed = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={"range_confirmed": True},
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)

        allowed = self.client.put(
            f"/api/scan-sessions/series/{four_d_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(allowed.status_code, 200, allowed.text)

    def test_failed_topogram_clears_range_and_cannot_confirm_it(self) -> None:
        scan_session = self._create_scan_session()
        topogram_id, _ = self._add_preceding_topogram(scan_session["id"])
        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)
        running = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(running.status_code, 200, running.text)

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
        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)
        response = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(response.status_code, 200, response.text)

    def test_execution_state_machine_rejects_shortcuts_and_reuses_running_attempt(self) -> None:
        scan_session = self._create_scan_session()
        series_id = scan_session["series"][0]["id"]

        draft_running = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(draft_running.status_code, 409, draft_running.text)
        for invalid_status in ("image_ready", "failed", "interrupted"):
            response = self.client.put(
                f"/api/scan-sessions/series/{series_id}/execution",
                json={"execution_status": invalid_status},
            )
            self.assertEqual(response.status_code, 409, response.text)

        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)
        for _ in range(2):
            running = self.client.put(
                f"/api/scan-sessions/series/{series_id}/execution",
                json={"execution_status": "running"},
            )
            self.assertEqual(running.status_code, 200, running.text)

        direct_reset = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={"execution_status": "pending"},
        )
        self.assertEqual(direct_reset.status_code, 409, direct_reset.text)
        ready = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={"execution_status": "image_ready"},
        )
        self.assertEqual(ready.status_code, 200, ready.text)
        for invalid_status in ("running", "failed", "interrupted", "pending"):
            response = self.client.put(
                f"/api/scan-sessions/series/{series_id}/execution",
                json={"execution_status": invalid_status},
            )
            self.assertEqual(response.status_code, 409, response.text)

        db = self.SessionTesting()
        try:
            attempts = (
                db.query(models.ScanSessionSeriesAttempt)
                .filter(models.ScanSessionSeriesAttempt.scan_session_series_id == series_id)
                .all()
            )
            self.assertEqual(len(attempts), 1)
            self.assertEqual(attempts[0].outcome, "image_ready")
            self.assertIsNotNone(attempts[0].ended_at)
        finally:
            db.close()

    def test_series_image_source_is_allowlisted_paired_and_registered_at_ready(self) -> None:
        scan_session = self._create_scan_session()
        series_id = scan_session["series"][0]["id"]

        wrong_state = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={
                "image_source_id": "brain-helical-demo",
                "image_source_version": 1,
            },
        )
        self.assertEqual(wrong_state.status_code, 409, wrong_state.text)

        for invalid_source in (
            {"image_source_id": "brain-helical-demo"},
            {"image_source_version": 1},
            {
                "image_source_id": "arbitrary-file-path",
                "image_source_version": 1,
            },
            {
                "image_source_id": "brain-helical-demo",
                "image_source_version": 2,
            },
            {
                "image_source_id": "head-stroke-topogram",
                "image_source_version": 1,
            },
        ):
            response = self.client.put(
                f"/api/scan-sessions/series/{series_id}/execution",
                json={"execution_status": "image_ready", **invalid_source},
            )
            self.assertEqual(response.status_code, 422, response.text)

        self.assertEqual(
            self.client.post(f"/api/scan-sessions/{scan_session['id']}/start").status_code,
            200,
        )
        self.assertEqual(
            self.client.put(
                f"/api/scan-sessions/series/{series_id}/execution",
                json={"execution_status": "running"},
            ).status_code,
            200,
        )
        ready = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={
                "execution_status": "image_ready",
                "image_source_id": "brain-helical-demo",
                "image_source_version": 1,
            },
        )
        self.assertEqual(ready.status_code, 200, ready.text)
        self.assertEqual(ready.json()["image_source_id"], "brain-helical-demo")
        self.assertEqual(ready.json()["image_source_version"], 1)

        overwrite = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={
                "execution_status": "image_ready",
                "image_source_id": "limbs-helical-demo",
                "image_source_version": 1,
            },
        )
        self.assertEqual(overwrite.status_code, 409, overwrite.text)
        refreshed = self.client.get(f"/api/scan-sessions/{scan_session['id']}")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        source_series = next(
            item for item in refreshed.json()["series"] if item["id"] == series_id
        )
        self.assertEqual(source_series["image_source_id"], "brain-helical-demo")
        self.assertEqual(source_series["image_source_version"], 1)

    def test_ready_without_registered_source_remains_explicitly_unavailable(self) -> None:
        scan_session = self._create_scan_session()
        series_id = scan_session["series"][0]["id"]
        self.assertEqual(
            self.client.post(f"/api/scan-sessions/{scan_session['id']}/start").status_code,
            200,
        )
        self.assertEqual(
            self.client.put(
                f"/api/scan-sessions/series/{series_id}/execution",
                json={"execution_status": "running"},
            ).status_code,
            200,
        )
        ready = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={"execution_status": "image_ready"},
        )
        self.assertEqual(ready.status_code, 200, ready.text)
        self.assertIsNone(ready.json()["image_source_id"])
        self.assertIsNone(ready.json()["image_source_version"])

    def test_failed_execution_clears_stale_series_image_source(self) -> None:
        scan_session = self._create_scan_session()
        series_id = scan_session["series"][0]["id"]
        self.assertEqual(
            self.client.post(f"/api/scan-sessions/{scan_session['id']}/start").status_code,
            200,
        )
        self.assertEqual(
            self.client.put(
                f"/api/scan-sessions/series/{series_id}/execution",
                json={"execution_status": "running"},
            ).status_code,
            200,
        )
        db = self.SessionTesting()
        try:
            series = db.get(models.ScanSessionSeries, series_id)
            series.image_source_id = "qin-lung-helical-demo"
            series.image_source_version = 1
            db.commit()
        finally:
            db.close()

        failed = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={
                "execution_status": "failed",
                "failure_reason": "Simulated reconstruction failure",
            },
        )
        self.assertEqual(failed.status_code, 200, failed.text)
        self.assertIsNone(failed.json()["image_source_id"])
        self.assertIsNone(failed.json()["image_source_version"])

    def test_failed_series_requires_explicit_retry_action_before_any_new_execution(self) -> None:
        scan_session = self._create_scan_session()
        series_id = scan_session["series"][0]["id"]
        self.assertEqual(
            self.client.post(f"/api/scan-sessions/{scan_session['id']}/start").status_code,
            200,
        )
        self.assertEqual(
            self.client.put(
                f"/api/scan-sessions/series/{series_id}/execution",
                json={"execution_status": "running"},
            ).status_code,
            200,
        )
        failed = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={"execution_status": "failed", "failure_reason": "Simulated failure"},
        )
        self.assertEqual(failed.status_code, 200, failed.text)
        replay = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={"execution_status": "failed", "failure_reason": "Simulated failure"},
        )
        self.assertEqual(replay.status_code, 200, replay.text)
        changed_replay = self.client.put(
            f"/api/scan-sessions/series/{series_id}/execution",
            json={"execution_status": "failed", "failure_reason": "Different failure"},
        )
        self.assertEqual(changed_replay.status_code, 409, changed_replay.text)
        for invalid_status in ("pending", "running", "image_ready", "interrupted"):
            response = self.client.put(
                f"/api/scan-sessions/series/{series_id}/execution",
                json={"execution_status": invalid_status},
            )
            self.assertEqual(response.status_code, 409, response.text)

    def test_complete_requires_in_progress_session_and_all_planned_series_image_ready(self) -> None:
        scan_session = self._create_scan_session()
        topogram_id, helical_id = self._add_preceding_topogram(scan_session["id"])

        draft_complete = self.client.post(f"/api/scan-sessions/{scan_session['id']}/complete")
        self.assertEqual(draft_complete.status_code, 409, draft_complete.text)

        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)

        topogram_running = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(topogram_running.status_code, 200, topogram_running.text)
        topogram_ready = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={"execution_status": "image_ready"},
        )
        self.assertEqual(topogram_ready.status_code, 200, topogram_ready.text)

        pending_series = self.client.post(f"/api/scan-sessions/{scan_session['id']}/complete")
        self.assertEqual(pending_series.status_code, 409, pending_series.text)

        confirmed = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={"range_confirmed": True},
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        helical_running = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(helical_running.status_code, 200, helical_running.text)
        failed_series = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={"execution_status": "failed", "failure_reason": "Reconstruction failed"},
        )
        self.assertEqual(failed_series.status_code, 200, failed_series.text)
        failed_complete = self.client.post(f"/api/scan-sessions/{scan_session['id']}/complete")
        self.assertEqual(failed_complete.status_code, 409, failed_complete.text)

        helical_ready = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={"execution_status": "image_ready"},
        )
        self.assertEqual(helical_ready.status_code, 409, helical_ready.text)

        successful_session = self._create_scan_session()
        successful_series_id = successful_session["series"][0]["id"]
        self.assertEqual(
            self.client.post(
                f"/api/scan-sessions/{successful_session['id']}/start"
            ).status_code,
            200,
        )
        for execution_status in ("running", "image_ready"):
            response = self.client.put(
                f"/api/scan-sessions/series/{successful_series_id}/execution",
                json={"execution_status": execution_status},
            )
            self.assertEqual(response.status_code, 200, response.text)
        completed = self.client.post(
            f"/api/scan-sessions/{successful_session['id']}/complete"
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(completed.json()["status"], "completed")

    def test_completed_session_is_idempotent_without_duplicate_logs(self) -> None:
        scan_session = self._create_scan_session()
        helical_id = scan_session["series"][0]["id"]

        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)
        for execution_status in ("running", "image_ready"):
            response = self.client.put(
                f"/api/scan-sessions/series/{helical_id}/execution",
                json={"execution_status": execution_status},
            )
            self.assertEqual(response.status_code, 200, response.text)

        first_complete = self.client.post(f"/api/scan-sessions/{scan_session['id']}/complete")
        self.assertEqual(first_complete.status_code, 200, first_complete.text)
        self.assertEqual(first_complete.json()["status"], "completed")

        db = self.SessionTesting()
        try:
            first_completion_log_count = (
                db.query(models.SystemLog)
                .filter(
                    models.SystemLog.scan_session_id == scan_session["id"],
                    models.SystemLog.event == "scan_completed",
                )
                .count()
            )
            first_dose_log_count = (
                db.query(models.DoseLog)
                .filter(models.DoseLog.scan_session_id == scan_session["id"])
                .count()
            )
        finally:
            db.close()
        self.assertEqual(first_completion_log_count, 1)
        self.assertEqual(first_dose_log_count, 1)

        repeated_complete = self.client.post(f"/api/scan-sessions/{scan_session['id']}/complete")
        self.assertEqual(repeated_complete.status_code, 200, repeated_complete.text)
        self.assertEqual(repeated_complete.json()["status"], "completed")

        db = self.SessionTesting()
        try:
            repeated_completion_log_count = (
                db.query(models.SystemLog)
                .filter(
                    models.SystemLog.scan_session_id == scan_session["id"],
                    models.SystemLog.event == "scan_completed",
                )
                .count()
            )
            repeated_dose_log_count = (
                db.query(models.DoseLog)
                .filter(models.DoseLog.scan_session_id == scan_session["id"])
                .count()
            )
        finally:
            db.close()
        self.assertEqual(repeated_completion_log_count, first_completion_log_count)
        self.assertEqual(repeated_dose_log_count, first_dose_log_count)

    def test_complete_rejects_session_without_planned_series(self) -> None:
        scan_session = self._create_scan_session()
        series_id = scan_session["series"][0]["id"]
        deleted = self.client.delete(f"/api/scan-sessions/series/{series_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(deleted.json()["series"], [])

        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)
        complete = self.client.post(f"/api/scan-sessions/{scan_session['id']}/complete")
        self.assertEqual(complete.status_code, 409, complete.text)

    def test_four_d_result_must_use_atomic_finalize_path(self) -> None:
        scan_session = self._create_scan_session()
        topogram_id, four_d_id = self._add_four_d_with_preceding_topogram(
            scan_session["id"]
        )
        db = self.SessionTesting()
        try:
            entity = db.get(models.ScanSession, scan_session["id"])
            entity.acquisition_type = "four_d"
            entity.scan_mode = "4d"
            db.commit()
        finally:
            db.close()

        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)
        for execution_status in ("running", "image_ready"):
            response = self.client.put(
                f"/api/scan-sessions/series/{topogram_id}/execution",
                json={"execution_status": execution_status},
            )
            self.assertEqual(response.status_code, 200, response.text)
        confirmed = self.client.put(
            f"/api/scan-sessions/series/{topogram_id}/execution",
            json={"range_confirmed": True},
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        running = self.client.put(
            f"/api/scan-sessions/series/{four_d_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(running.status_code, 200, running.text)

        db = self.SessionTesting()
        try:
            db.add(
                models.ScanSessionFourDResult(
                    scan_session_id=scan_session["id"],
                    target_series_id=four_d_id,
                    workflow_stage="acquired",
                    scan_result_json="{}",
                )
            )
            db.commit()
        finally:
            db.close()

        direct_ready = self.client.put(
            f"/api/scan-sessions/series/{four_d_id}/execution",
            json={"execution_status": "image_ready"},
        )
        self.assertEqual(direct_ready.status_code, 409, direct_ready.text)
        self.assertIn("fourd-result/finalize", direct_ready.text)

        direct_complete = self.client.post(
            f"/api/scan-sessions/{scan_session['id']}/complete"
        )
        self.assertEqual(direct_complete.status_code, 409, direct_complete.text)
        self.assertIn("fourd-result/finalize", direct_complete.text)

        db = self.SessionTesting()
        try:
            target = db.get(models.ScanSessionSeries, four_d_id)
            self.assertEqual(target.execution_status, "running")
            attempt = (
                db.query(models.ScanSessionSeriesAttempt)
                .filter(
                    models.ScanSessionSeriesAttempt.scan_session_series_id == four_d_id
                )
                .one()
            )
            self.assertIsNone(attempt.ended_at)
        finally:
            db.close()

    def test_cancelled_session_cannot_be_completed(self) -> None:
        scan_session = self._create_scan_session()
        cancelled = self.client.post(f"/api/scan-sessions/{scan_session['id']}/cancel")
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")

        complete = self.client.post(f"/api/scan-sessions/{scan_session['id']}/complete")
        self.assertEqual(complete.status_code, 409, complete.text)

        refreshed = self.client.get(f"/api/scan-sessions/{scan_session['id']}")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(refreshed.json()["status"], "cancelled")

    def test_terminal_scan_session_cannot_restart_series_or_confirm_range(self) -> None:
        for terminal_action, expected_status in (("complete", "completed"), ("cancel", "cancelled")):
            with self.subTest(terminal_action=terminal_action):
                scan_session = self._create_scan_session()
                topogram_id, helical_id = self._add_preceding_topogram(scan_session["id"])
                started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
                self.assertEqual(started.status_code, 200, started.text)
                for execution_status in ("running", "image_ready"):
                    response = self.client.put(
                        f"/api/scan-sessions/series/{topogram_id}/execution",
                        json={"execution_status": execution_status},
                    )
                    self.assertEqual(response.status_code, 200, response.text)

                if terminal_action == "complete":
                    confirmed = self.client.put(
                        f"/api/scan-sessions/series/{topogram_id}/execution",
                        json={"range_confirmed": True},
                    )
                    self.assertEqual(confirmed.status_code, 200, confirmed.text)
                    for execution_status in ("running", "image_ready"):
                        response = self.client.put(
                            f"/api/scan-sessions/series/{helical_id}/execution",
                            json={"execution_status": execution_status},
                        )
                        self.assertEqual(response.status_code, 200, response.text)

                terminal = self.client.post(f"/api/scan-sessions/{scan_session['id']}/{terminal_action}")
                self.assertEqual(terminal.status_code, 200, terminal.text)
                self.assertEqual(terminal.json()["status"], expected_status)

                restart_session = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
                self.assertEqual(restart_session.status_code, 409, restart_session.text)

                restart = self.client.put(
                    f"/api/scan-sessions/series/{helical_id}/execution",
                    json={"execution_status": "running"},
                )
                self.assertEqual(restart.status_code, 409, restart.text)

                confirm_range = self.client.put(
                    f"/api/scan-sessions/series/{topogram_id}/execution",
                    json={"range_confirmed": True},
                )
                self.assertEqual(confirm_range.status_code, 409, confirm_range.text)

                refreshed = self.client.get(f"/api/scan-sessions/{scan_session['id']}")
                self.assertEqual(refreshed.status_code, 200, refreshed.text)
                self.assertEqual(refreshed.json()["status"], expected_status)
                refreshed_by_id = {series["id"]: series for series in refreshed.json()["series"]}
                expected_series_status = "image_ready" if terminal_action == "complete" else "pending"
                self.assertEqual(refreshed_by_id[helical_id]["execution_status"], expected_series_status)
                self.assertEqual(
                    refreshed_by_id[topogram_id]["range_confirmed"],
                    terminal_action == "complete",
                )

    def test_running_series_must_be_settled_before_session_terminal_transition(self) -> None:
        scan_session = self._create_scan_session()
        helical_id = scan_session["series"][0]["id"]
        started = self.client.post(f"/api/scan-sessions/{scan_session['id']}/start")
        self.assertEqual(started.status_code, 200, started.text)
        running = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(running.status_code, 200, running.text)

        for terminal_action in ("complete", "cancel"):
            blocked = self.client.post(f"/api/scan-sessions/{scan_session['id']}/{terminal_action}")
            self.assertEqual(blocked.status_code, 409, blocked.text)

        settled = self.client.put(
            f"/api/scan-sessions/series/{helical_id}/execution",
            json={
                "execution_status": "failed",
                "failure_reason": "Simulated scan terminated before completion",
            },
        )
        self.assertEqual(settled.status_code, 200, settled.text)
        cancelled = self.client.post(f"/api/scan-sessions/{scan_session['id']}/cancel")
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.assertEqual(cancelled.json()["series"][0]["execution_status"], "failed")

    def test_generic_update_cannot_change_scan_session_lifecycle_status(self) -> None:
        scan_session = self._create_scan_session()
        blocked_start = self.client.put(
            f"/api/scan-sessions/{scan_session['id']}",
            json={"status": "in_progress"},
        )
        self.assertEqual(blocked_start.status_code, 409, blocked_start.text)

        cancelled = self.client.post(f"/api/scan-sessions/{scan_session['id']}/cancel")
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        blocked_reopen = self.client.put(
            f"/api/scan-sessions/{scan_session['id']}",
            json={"status": "draft"},
        )
        self.assertEqual(blocked_reopen.status_code, 409, blocked_reopen.text)

    def test_non_pending_series_rejects_structure_metadata_and_configuration_mutations(self) -> None:
        scan_session = self._create_scan_session()
        ids = self._add_mutation_guard_entities(scan_session["id"])

        db = self.SessionTesting()
        try:
            db.get(
                models.ScanSessionSeries,
                ids["helical_id"],
            ).execution_status = "running"
            db.get(
                models.ScanSessionSeries,
                ids["topogram_id"],
            ).execution_status = "image_ready"
            db.get(
                models.ScanSessionSeries,
                ids["axial_id"],
            ).execution_status = "image_ready"
            db.get(
                models.ScanSessionSeries,
                ids["fourd_id"],
            ).execution_status = "running"
            db.commit()
        finally:
            db.close()

        blocked_requests = (
            (
                "put",
                f"/api/scan-sessions/{scan_session['id']}",
                {"description": "Blocked while a series is running"},
            ),
            (
                "put",
                f"/api/scan-sessions/contrast-configs/{ids['contrast_id']}",
                {"total_volume": 65.0},
            ),
            (
                "post",
                f"/api/scan-sessions/{scan_session['id']}/series",
                {"series_order": 5, "series_type": "axial", "series_label": "Blocked"},
            ),
            (
                "put",
                f"/api/scan-sessions/series/{ids['helical_id']}",
                {"series_label": "Blocked"},
            ),
            (
                "put",
                f"/api/scan-sessions/series/{ids['topogram_id']}",
                {"series_label": "Blocked"},
            ),
            ("post", f"/api/scan-sessions/series/{ids['helical_id']}/duplicate", None),
            ("delete", f"/api/scan-sessions/series/{ids['helical_id']}", None),
            (
                "put",
                f"/api/scan-sessions/topogram/{ids['topogram_param_id']}",
                {"ma": 40},
            ),
            (
                "put",
                f"/api/scan-sessions/helical/{ids['helical_param_id']}",
                {"ma": 200},
            ),
            (
                "put",
                f"/api/scan-sessions/axial/{ids['axial_param_id']}",
                {"ma": 200},
            ),
            (
                "post",
                f"/api/scan-sessions/series/{ids['helical_id']}/recon-series",
                {},
            ),
            (
                "put",
                f"/api/scan-sessions/recon-series/{ids['recon_id']}",
                {"kernel": "BLOCKED"},
            ),
            ("delete", f"/api/scan-sessions/recon-series/{ids['recon_id']}", None),
            (
                "put",
                f"/api/scan-sessions/fourd-configs/{ids['fourd_config_id']}",
                {"phase_count": 8},
            ),
            (
                "put",
                f"/api/scan-sessions/breathing-training/{ids['training_id']}",
                {"training_duration": 25.0},
            ),
        )
        for method, path, payload in blocked_requests:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, json=payload)
                self.assertEqual(response.status_code, 409, response.text)

        db = self.SessionTesting()
        try:
            db.get(
                models.ScanSessionSeries,
                ids["helical_id"],
            ).execution_status = "failed"
            db.get(
                models.ScanSessionSeries,
                ids["fourd_id"],
            ).execution_status = "interrupted"
            db.commit()
        finally:
            db.close()

        for path, payload in (
            (
                f"/api/scan-sessions/series/{ids['helical_id']}",
                {"series_label": "Still requires recovery"},
            ),
            (
                f"/api/scan-sessions/helical/{ids['helical_param_id']}",
                {"ma": 210},
            ),
            (
                f"/api/scan-sessions/fourd-configs/{ids['fourd_config_id']}",
                {"phase_count": 9},
            ),
        ):
            with self.subTest(path=path):
                response = self.client.put(path, json=payload)
                self.assertEqual(response.status_code, 409, response.text)
                self.assertIn("recovery action", response.text)

        # 所有运行中序列妥善结束后，会话级元数据可继续编辑。
        session_metadata = self.client.put(
            f"/api/scan-sessions/{scan_session['id']}",
            json={"description": "Mutable after running work is settled"},
        )
        self.assertEqual(session_metadata.status_code, 200, session_metadata.text)
        contrast = self.client.put(
            f"/api/scan-sessions/contrast-configs/{ids['contrast_id']}",
            json={"total_volume": 65.0},
        )
        self.assertEqual(contrast.status_code, 200, contrast.text)

    def test_persisted_four_d_result_freezes_series_structure_and_metadata(self) -> None:
        scan_session = self._create_scan_session()
        ids = self._add_mutation_guard_entities(scan_session["id"])
        db = self.SessionTesting()
        try:
            db.add(
                models.ScanSessionFourDResult(
                    scan_session_id=scan_session["id"],
                    target_series_id=ids["fourd_id"],
                    workflow_stage="acquired",
                    scan_result_json="{}",
                )
            )
            db.commit()
        finally:
            db.close()

        blocked_requests = (
            (
                "post",
                f"/api/scan-sessions/{scan_session['id']}/series",
                {"series_order": 5, "series_type": "axial", "series_label": "Blocked"},
            ),
            ("post", f"/api/scan-sessions/series/{ids['helical_id']}/duplicate", None),
            ("delete", f"/api/scan-sessions/series/{ids['helical_id']}", None),
            (
                "put",
                f"/api/scan-sessions/series/{ids['fourd_id']}",
                {"series_label": "Blocked"},
            ),
        )
        for method, path, payload in blocked_requests:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, json=payload)
                self.assertEqual(response.status_code, 409, response.text)

    def test_mutation_checks_terminal_state_returned_after_lock(self) -> None:
        scan_session = self._create_scan_session()
        original_lock = scan_sessions._lock_scan_session_and_series

        def simulate_terminal_commit_before_lock_returns(scan_session_id, db):
            locked = original_lock(scan_session_id, db)
            locked.status = "cancelled"
            return locked

        with patch.object(
            scan_sessions,
            "_lock_scan_session_and_series",
            side_effect=simulate_terminal_commit_before_lock_returns,
        ) as lock_mock:
            blocked = self.client.put(
                f"/api/scan-sessions/{scan_session['id']}",
                json={"description": "must not cross terminal boundary"},
            )

        self.assertEqual(blocked.status_code, 409, blocked.text)
        lock_mock.assert_called_once()
        refreshed = self.client.get(f"/api/scan-sessions/{scan_session['id']}")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(refreshed.json()["status"], "draft")

    def test_terminal_session_rejects_all_existing_structure_and_parameter_crud(self) -> None:
        scan_session = self._create_scan_session()
        helical = scan_session["series"][0]
        helical_id = helical["id"]
        helical_param_id = helical["helical_param"]["id"]
        recon_id = helical["recon_series"][0]["id"]

        db = self.SessionTesting()
        try:
            entity = db.get(models.ScanSession, scan_session["id"])
            entity.contrast_config = models.ScanSessionContrastConfig(
                contrast_agent="Simulation only",
                concentration=300.0,
                total_volume=60.0,
                injection_rate=3.0,
                saline_volume=20.0,
                saline_rate=3.0,
            )
            topogram = models.ScanSessionSeries(
                series_order=2,
                series_type="topogram",
                series_label="Terminal guard topogram",
            )
            topogram.topogram_param = models.ScanSessionTopogramParam(
                kv=100,
                ma=30,
                scan_length=300.0,
                tube_angle=180.0,
                fov=300.0,
            )
            axial = models.ScanSessionSeries(
                series_order=3,
                series_type="axial",
                series_label="Terminal guard axial",
            )
            axial.axial_param = models.ScanSessionAxialParam(
                kv=120,
                ma=150,
                slice_thickness=2.0,
                slice_interval=2.0,
                rotation_time=0.75,
                scan_length=200.0,
                fov=300.0,
                auto_ma=False,
            )
            four_d = models.ScanSessionSeries(
                series_order=4,
                series_type="4d",
                series_label="Terminal guard 4D",
            )
            four_d.fourd_config = models.ScanSessionFourDConfig(
                breathing_mode="free_breathing",
                phase_count=10,
                acquisition_time=30.0,
            )
            four_d.fourd_config.breathing_training_param = (
                models.ScanSessionBreathingTrainingParam(
                    training_duration=20.0,
                    target_amplitude=10.0,
                    tolerance_range=2.0,
                )
            )
            entity.series.extend([topogram, axial, four_d])
            db.commit()
            contrast_id = entity.contrast_config.id
            topogram_param_id = topogram.topogram_param.id
            axial_param_id = axial.axial_param.id
            fourd_config_id = four_d.fourd_config.id
            training_id = four_d.fourd_config.breathing_training_param.id
        finally:
            db.close()

        cancelled = self.client.post(f"/api/scan-sessions/{scan_session['id']}/cancel")
        self.assertEqual(cancelled.status_code, 200, cancelled.text)

        blocked_requests = (
            ("put", f"/api/scan-sessions/{scan_session['id']}", {"description": "blocked"}),
            ("put", f"/api/scan-sessions/contrast-configs/{contrast_id}", {"total_volume": 70.0}),
            (
                "post",
                f"/api/scan-sessions/{scan_session['id']}/series",
                {"series_order": 5, "series_type": "axial", "series_label": "Blocked"},
            ),
            ("put", f"/api/scan-sessions/series/{helical_id}", {"series_label": "Blocked"}),
            ("post", f"/api/scan-sessions/series/{helical_id}/duplicate", None),
            ("delete", f"/api/scan-sessions/series/{helical_id}", None),
            ("put", f"/api/scan-sessions/topogram/{topogram_param_id}", {"ma": 40}),
            ("put", f"/api/scan-sessions/helical/{helical_param_id}", {"ma": 200}),
            ("put", f"/api/scan-sessions/axial/{axial_param_id}", {"ma": 200}),
            ("post", f"/api/scan-sessions/series/{helical_id}/recon-series", {}),
            ("put", f"/api/scan-sessions/recon-series/{recon_id}", {"kernel": "BLOCKED"}),
            ("delete", f"/api/scan-sessions/recon-series/{recon_id}", None),
            ("put", f"/api/scan-sessions/fourd-configs/{fourd_config_id}", {"phase_count": 8}),
            ("put", f"/api/scan-sessions/breathing-training/{training_id}", {"training_duration": 25.0}),
        )
        for method, path, payload in blocked_requests:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, json=payload)
                self.assertEqual(response.status_code, 409, response.text)

        refreshed = self.client.get(f"/api/scan-sessions/{scan_session['id']}")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(refreshed.json()["status"], "cancelled")
        self.assertEqual(len(refreshed.json()["series"]), 4)

    def test_protocol_dose_reference_returns_only_estimation_fields(self) -> None:
        response = self.client.get("/api/protocols/dose-reference")
        self.assertEqual(response.status_code, 200, response.text)

        protocol = response.json()[0]
        self.assertEqual(protocol["name"], "API Snapshot Protocol")
        self.assertEqual(len(protocol["series"]), 1)

        series = protocol["series"][0]
        self.assertEqual(series["series_type"], "helical")
        self.assertNotIn("recon_series", series)
        self.assertEqual(
            series["helical_param"],
            {
                "ma": 180.0,
                "kv": 120.0,
                "rotation_time": 0.75,
                "pitch": 0.8,
                "scan_length": 220.0,
                "ctdi_vol": 12.5,
                "dlp": 275.0,
            },
        )


if __name__ == "__main__":
    unittest.main()
