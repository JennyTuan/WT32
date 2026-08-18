from __future__ import annotations

import copy
import json
import unittest
import warnings
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.database import Base, get_db
from backend.routers import scan_results, scan_sessions


warnings.filterwarnings(
    "ignore",
    message=r".*asyncio\.iscoroutinefunction.*",
    category=DeprecationWarning,
)


class ScanResultsApiTests(unittest.TestCase):
    def setUp(self) -> None:
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
        self.SessionTesting = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=self.engine,
        )
        self._seed_fixture()

        self.app = FastAPI()
        self.app.include_router(scan_sessions.router, prefix="/api")
        self.app.include_router(scan_results.router, prefix="/api")
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

    @staticmethod
    def _build_session(
        patient: models.Patient,
        protocol: models.Protocol,
        *,
        status: str,
        label: str,
        series_specs: tuple[tuple[str, str], ...] = (("4d", "running"),),
        acquisition_type: str = "four_d",
    ) -> models.ScanSession:
        scan_session = models.ScanSession(
            patient=patient,
            protocol=protocol,
            status=status,
            session_name=label,
            name="4D Result Test Snapshot",
            body_part="CHEST",
            age_group="adult",
            patient_weight="50-90kg",
            patient_position="HFS",
            table_direction="in",
            acquisition_type=acquisition_type,
            scan_mode="4d" if acquisition_type == "four_d" else "plain",
            description="Simulation-only API persistence fixture",
        )
        scan_session.series.extend(
            models.ScanSessionSeries(
                series_order=index,
                series_type=series_type,
                series_label=f"{label} {series_type} {index}",
                execution_status=execution_status,
            )
            for index, (series_type, execution_status) in enumerate(
                series_specs,
                start=1,
            )
        )
        return scan_session

    @staticmethod
    def _add_open_attempt(
        db,
        scan_session: models.ScanSession,
        target: models.ScanSessionSeries,
        *,
        attempt_number: int = 1,
    ) -> models.ScanSessionSeriesAttempt:
        attempt = models.ScanSessionSeriesAttempt(
            scan_session_id=scan_session.id,
            scan_session_series_id=target.id,
            attempt_number=attempt_number,
        )
        db.add(attempt)
        db.flush()
        return attempt

    def _seed_fixture(self) -> None:
        db = self.SessionTesting()
        try:
            patient = models.Patient(
                name="4D Test Patient",
                patient_id="P-4D-RESULT-001",
                gender="female",
                age=52,
            )
            other_patient = models.Patient(
                name="Other Test Patient",
                patient_id="P-4D-RESULT-002",
                gender="male",
                age=44,
            )
            protocol = models.Protocol(
                name="4D Result Test Protocol",
                body_part="CHEST",
                age_group="adult",
                patient_weight="50-90kg",
                patient_position="HFS",
                table_direction="in",
                acquisition_type="four_d",
                scan_mode="4d",
                is_4d=True,
                description="Simulation-only API persistence fixture",
            )
            db.add_all([patient, other_patient, protocol])
            db.flush()

            active = self._build_session(
                patient,
                protocol,
                status="in_progress",
                label="Active",
            )
            no_attempt = self._build_session(
                patient,
                protocol,
                status="in_progress",
                label="No Attempt",
            )
            pending = self._build_session(
                patient,
                protocol,
                status="in_progress",
                label="Pending",
                series_specs=(("4d", "pending"),),
            )
            draft = self._build_session(
                patient,
                protocol,
                status="draft",
                label="Draft",
            )
            multi_target = self._build_session(
                patient,
                protocol,
                status="in_progress",
                label="Multiple Targets",
                series_specs=(("4d", "running"), ("4d", "running")),
            )
            other_session = self._build_session(
                patient,
                protocol,
                status="in_progress",
                label="Other Session",
            )
            incomplete_other = self._build_session(
                patient,
                protocol,
                status="in_progress",
                label="Incomplete Other",
                series_specs=(("topogram", "pending"), ("4d", "running")),
            )
            regular = self._build_session(
                patient,
                protocol,
                status="in_progress",
                label="Regular",
                acquisition_type="regular",
            )
            completed = self._build_session(
                patient,
                protocol,
                status="completed",
                label="Completed",
                series_specs=(("4d", "image_ready"),),
            )
            cancelled = self._build_session(
                patient,
                protocol,
                status="cancelled",
                label="Cancelled",
            )
            db.add_all(
                [
                    active,
                    no_attempt,
                    pending,
                    draft,
                    multi_target,
                    other_session,
                    incomplete_other,
                    regular,
                    completed,
                    cancelled,
                ]
            )
            db.flush()

            active_attempt = self._add_open_attempt(db, active, active.series[0])
            self._add_open_attempt(db, other_session, other_session.series[0])
            self._add_open_attempt(db, incomplete_other, incomplete_other.series[1])
            db.commit()

            self.patient_id = patient.id
            self.other_patient_id = other_patient.id
            self.active_session_id = active.id
            self.target_series_id = active.series[0].id
            self.source_attempt_id = active_attempt.id
            self.no_attempt_session_id = no_attempt.id
            self.no_attempt_target_id = no_attempt.series[0].id
            self.pending_session_id = pending.id
            self.pending_target_id = pending.series[0].id
            self.draft_session_id = draft.id
            self.draft_target_id = draft.series[0].id
            self.multi_session_id = multi_target.id
            self.multi_target_id = multi_target.series[0].id
            self.other_session_id = other_session.id
            self.other_target_id = other_session.series[0].id
            self.incomplete_session_id = incomplete_other.id
            self.incomplete_other_series_id = incomplete_other.series[0].id
            self.incomplete_target_id = incomplete_other.series[1].id
            self.regular_session_id = regular.id
            self.regular_target_id = regular.series[0].id
            self.completed_session_id = completed.id
            self.completed_target_id = completed.series[0].id
            self.cancelled_session_id = cancelled.id
            self.cancelled_target_id = cancelled.series[0].id
        finally:
            db.close()

    def _new_active_session(self, label: str) -> tuple[int, int, int]:
        db = self.SessionTesting()
        try:
            patient = db.get(models.Patient, self.patient_id)
            protocol = db.query(models.Protocol).one()
            scan_session = self._build_session(
                patient,
                protocol,
                status="in_progress",
                label=label,
            )
            db.add(scan_session)
            db.flush()
            attempt = self._add_open_attempt(db, scan_session, scan_session.series[0])
            db.commit()
            return scan_session.id, scan_session.series[0].id, attempt.id
        finally:
            db.close()

    def _payload(
        self,
        *,
        target_series_id: int | None = None,
        expected_version: int = 0,
        workflow_stage: str = "acquired",
        with_rescan: bool = False,
    ) -> dict:
        return {
            "patient_id": self.patient_id,
            "target_series_id": target_series_id or self.target_series_id,
            "expected_version": expected_version,
            "workflow_stage": workflow_stage,
            "scan_result": {
                "bed_count": 2,
                "phase_count": 2,
                "scan_length": 165.0,
                "phase_matrix": [
                    [
                        {"frame_count": 1, "selected_frame": 0},
                        {"frame_count": 2, "selected_frame": 0},
                    ],
                    [
                        {"frame_count": 1, "selected_frame": 0},
                        {"frame_count": 1, "selected_frame": 0},
                    ],
                ],
                "rescan_occurred": with_rescan,
                "rescan_bed_range": [0, 0] if with_rescan else None,
            },
            "data_review": None,
            "rescan_choices": None,
            "phase_selections": None,
        }

    def _put(self, scan_session_id: int, payload: dict):
        return self.client.put(
            f"/api/scan-sessions/{scan_session_id}/fourd-result",
            json=payload,
        )

    def _create_result(
        self,
        *,
        scan_session_id: int | None = None,
        target_series_id: int | None = None,
        with_rescan: bool = False,
    ) -> dict:
        response = self._put(
            scan_session_id or self.active_session_id,
            self._payload(
                target_series_id=target_series_id,
                with_rescan=with_rescan,
            ),
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_four_d_target_cannot_bypass_atomic_finalize_without_a_result(self) -> None:
        response = self.client.put(
            f"/api/scan-sessions/series/{self.target_series_id}/execution",
            json={"execution_status": "image_ready"},
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("fourd-result/finalize", response.json()["detail"])

        db = self.SessionTesting()
        try:
            target = db.get(models.ScanSessionSeries, self.target_series_id)
            self.assertEqual(target.execution_status, "running")
            self.assertEqual(db.query(models.ScanSessionFourDResult).count(), 0)
        finally:
            db.close()

    def _phase_selected_payload(
        self,
        *,
        target_series_id: int,
        expected_version: int,
        with_rescan: bool = False,
        rescan_choice: str = "first",
    ) -> dict:
        payload = self._payload(
            target_series_id=target_series_id,
            expected_version=expected_version,
            workflow_stage="phase_selected",
            with_rescan=with_rescan,
        )
        payload["data_review"] = self._data_review(payload["scan_result"])
        payload["phase_selections"] = {"0-1": 1}
        if with_rescan:
            payload["rescan_choices"] = {"0": rescan_choice}
        return payload

    def _data_review(self, scan_result: dict) -> dict:
        return {
            "bed_selections": {
                str(bed_index): {
                    "candidate_id": f"reference-{bed_index}",
                    "waveform_points": [
                        {"id": 1, "kind": "valley", "t": 0.05, "value": 20},
                        {"id": 2, "kind": "peak", "t": 0.30, "value": 80},
                        {"id": 3, "kind": "valley", "t": 0.55, "value": 20},
                        {"id": 4, "kind": "peak", "t": 0.80, "value": 80},
                    ],
                    "disabled_cycle_ids": [],
                }
                for bed_index in range(scan_result["bed_count"])
            },
            "phase_matrix": scan_result["phase_matrix"],
        }

    def _advance_data_review(
        self,
        scan_session_id: int,
        target_series_id: int,
        expected_version: int,
        *,
        with_rescan: bool = False,
    ) -> dict:
        payload = self._payload(
            target_series_id=target_series_id,
            expected_version=expected_version,
            workflow_stage="data_reviewed",
            with_rescan=with_rescan,
        )
        payload["data_review"] = self._data_review(payload["scan_result"])
        response = self._put(scan_session_id, payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _finalize(
        self,
        scan_session_id: int,
        target_series_id: int,
        expected_version: int,
        *,
        patient_id: int | None = None,
    ):
        return self.client.post(
            f"/api/scan-sessions/{scan_session_id}/fourd-result/finalize",
            json={
                "patient_id": patient_id or self.patient_id,
                "target_series_id": target_series_id,
                "expected_version": expected_version,
            },
        )

    def test_create_and_get_persist_immutable_simulation_provenance(self) -> None:
        created = self._create_result()
        self.assertEqual(created["version"], 1)
        self.assertEqual(created["workflow_stage"], "acquired")
        self.assertEqual(created["source_kind"], "simulation")
        self.assertEqual(created["image_source_id"], "fourd-engineer")
        self.assertEqual(created["image_source_version"], 1)
        self.assertEqual(created["source_attempt_id"], self.source_attempt_id)

        fetched = self.client.get(
            f"/api/scan-sessions/{self.active_session_id}/fourd-result",
            params={
                "patient_id": self.patient_id,
                "target_series_id": self.target_series_id,
            },
        )
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.json(), created)

        db = self.SessionTesting()
        try:
            stored = db.query(models.ScanSessionFourDResult).one()
            self.assertEqual(stored.image_source_id, "fourd-engineer")
            self.assertEqual(stored.image_source_version, 1)
            self.assertEqual(stored.source_attempt_id, self.source_attempt_id)
            self.assertEqual(db.query(models.DoseLog).count(), 0)
        finally:
            db.close()

    def test_create_requires_acquired_in_progress_unique_running_target(self) -> None:
        phase_create = self._phase_selected_payload(
            target_series_id=self.target_series_id,
            expected_version=0,
        )
        ready_create = copy.deepcopy(phase_create)
        ready_create["workflow_stage"] = "ready"

        cases = [
            (
                "new result must start acquired",
                self.active_session_id,
                phase_create,
            ),
            (
                "PUT cannot create ready",
                self.active_session_id,
                ready_create,
            ),
            (
                "session must be in progress",
                self.draft_session_id,
                self._payload(target_series_id=self.draft_target_id),
            ),
            (
                "target must be running",
                self.pending_session_id,
                self._payload(target_series_id=self.pending_target_id),
            ),
            (
                "target must be unique",
                self.multi_session_id,
                self._payload(target_series_id=self.multi_target_id),
            ),
            (
                "create version must be zero",
                self.active_session_id,
                self._payload(expected_version=1),
            ),
        ]
        for label, session_id, payload in cases:
            with self.subTest(label=label):
                response = self._put(session_id, copy.deepcopy(payload))
                self.assertEqual(response.status_code, 409, response.text)

        db = self.SessionTesting()
        try:
            self.assertEqual(db.query(models.ScanSessionFourDResult).count(), 0)
        finally:
            db.close()

    def test_patient_session_target_and_acquisition_binding_are_enforced(self) -> None:
        cases = [
            (
                self.active_session_id,
                {**self._payload(), "patient_id": self.other_patient_id},
                409,
            ),
            (
                self.active_session_id,
                self._payload(target_series_id=self.other_target_id),
                409,
            ),
            (
                self.regular_session_id,
                self._payload(target_series_id=self.regular_target_id),
                409,
            ),
            (999999, self._payload(), 404),
        ]
        for session_id, payload, expected_status in cases:
            response = self._put(session_id, payload)
            self.assertEqual(response.status_code, expected_status, response.text)

    def test_scan_result_snapshot_cannot_change_after_acquisition(self) -> None:
        self._create_result()
        changed = self._phase_selected_payload(
            target_series_id=self.target_series_id,
            expected_version=1,
        )
        changed["scan_result"]["scan_length"] = 166.0
        response = self._put(self.active_session_id, changed)
        self.assertEqual(response.status_code, 409, response.text)

        db = self.SessionTesting()
        try:
            result = db.query(models.ScanSessionFourDResult).one()
            self.assertEqual(result.version, 1)
            self.assertEqual(json.loads(result.scan_result_json)["scan_length"], 165.0)
        finally:
            db.close()

    def test_data_review_is_required_before_phase_selection(self) -> None:
        self._create_result()
        skipped = self._put(
            self.active_session_id,
            self._phase_selected_payload(
                target_series_id=self.target_series_id,
                expected_version=1,
            ),
        )
        self.assertEqual(skipped.status_code, 409, skipped.text)
        reviewed = self._advance_data_review(self.active_session_id, self.target_series_id, 1)
        updated = self._put(
            self.active_session_id,
            self._phase_selected_payload(
                target_series_id=self.target_series_id,
                expected_version=reviewed["version"],
            ),
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["workflow_stage"], "phase_selected")
        self.assertEqual(updated.json()["version"], 3)

    def test_rescan_selection_can_be_edited_before_phase_selection(self) -> None:
        self._create_result(with_rescan=True)

        first = self._payload(
            expected_version=1,
            workflow_stage="rescan_selected",
            with_rescan=True,
        )
        first["data_review"] = self._data_review(first["scan_result"])
        first["rescan_choices"] = {"0": "first"}
        first_update = self._put(self.active_session_id, first)
        self.assertEqual(first_update.status_code, 200, first_update.text)
        self.assertEqual(first_update.json()["version"], 2)

        edited = copy.deepcopy(first)
        edited["expected_version"] = 2
        edited["rescan_choices"] = {"0": "rescan"}
        second_update = self._put(self.active_session_id, edited)
        self.assertEqual(second_update.status_code, 200, second_update.text)
        self.assertEqual(second_update.json()["version"], 3)
        self.assertEqual(second_update.json()["rescan_choices"], {"0": "rescan"})

        phase_selected = self._put(
            self.active_session_id,
            self._phase_selected_payload(
                target_series_id=self.target_series_id,
                expected_version=3,
                with_rescan=True,
                rescan_choice="rescan",
            ),
        )
        self.assertEqual(phase_selected.status_code, 200, phase_selected.text)
        self.assertEqual(phase_selected.json()["workflow_stage"], "phase_selected")

    def test_illegal_stage_transitions_and_direct_ready_put_are_rejected(self) -> None:
        self._create_result()
        same_acquired = self._payload(expected_version=1)
        no_rescan_to_rescan = self._payload(
            expected_version=1,
            workflow_stage="rescan_selected",
        )
        direct_ready = self._phase_selected_payload(
            target_series_id=self.target_series_id,
            expected_version=1,
        )
        direct_ready["workflow_stage"] = "ready"

        for payload in (same_acquired, no_rescan_to_rescan, direct_ready):
            response = self._put(self.active_session_id, payload)
            self.assertEqual(response.status_code, 409, response.text)

        session_id, target_id, _ = self._new_active_session("Rescan Skip")
        self._create_result(
            scan_session_id=session_id,
            target_series_id=target_id,
            with_rescan=True,
        )
        skip_rescan = self._phase_selected_payload(
            target_series_id=target_id,
            expected_version=1,
            with_rescan=True,
        )
        skipped = self._put(session_id, skip_rescan)
        self.assertEqual(skipped.status_code, 409, skipped.text)

        reviewed = self._advance_data_review(self.active_session_id, self.target_series_id, 1)
        selected = self._put(
            self.active_session_id,
            self._phase_selected_payload(
                target_series_id=self.target_series_id,
                expected_version=reviewed["version"],
            ),
        )
        self.assertEqual(selected.status_code, 200, selected.text)
        edited_selection_payload = self._phase_selected_payload(
            target_series_id=self.target_series_id,
            expected_version=selected.json()["version"],
        )
        edited_selection_payload["phase_selections"] = {"0-1": 0}
        edited_selection = self._put(
            self.active_session_id,
            edited_selection_payload,
        )
        self.assertEqual(edited_selection.status_code, 200, edited_selection.text)
        self.assertEqual(edited_selection.json()["version"], 4)
        self.assertEqual(edited_selection.json()["phase_selections"], {"0-1": 0})

    def test_stale_version_is_rejected_without_mutating_state(self) -> None:
        self._create_result()
        stale = self._put(
            self.active_session_id,
            self._phase_selected_payload(
                target_series_id=self.target_series_id,
                expected_version=99,
            ),
        )
        self.assertEqual(stale.status_code, 409, stale.text)

        db = self.SessionTesting()
        try:
            result = db.query(models.ScanSessionFourDResult).one()
            self.assertEqual(result.version, 1)
            self.assertEqual(result.workflow_stage, "acquired")
        finally:
            db.close()

    def test_result_cannot_follow_a_different_series_attempt(self) -> None:
        self._create_result()
        db = self.SessionTesting()
        try:
            first_attempt = db.get(models.ScanSessionSeriesAttempt, self.source_attempt_id)
            first_attempt.ended_at = datetime.now(timezone.utc)
            first_attempt.outcome = "interrupted"
            replacement = models.ScanSessionSeriesAttempt(
                scan_session_id=self.active_session_id,
                scan_session_series_id=self.target_series_id,
                attempt_number=2,
            )
            db.add(replacement)
            db.commit()
        finally:
            db.close()

        response = self._put(
            self.active_session_id,
            self._phase_selected_payload(
                target_series_id=self.target_series_id,
                expected_version=1,
            ),
        )
        self.assertEqual(response.status_code, 409, response.text)

    def test_missing_attempt_is_recorded_as_unknown_without_fabrication(self) -> None:
        created = self._create_result(
            scan_session_id=self.no_attempt_session_id,
            target_series_id=self.no_attempt_target_id,
        )
        self.assertIsNone(created["source_attempt_id"])
        self.assertEqual(created["image_source_id"], "fourd-engineer")
        self.assertEqual(created["image_source_version"], 1)

    def test_finalize_atomically_closes_result_target_session_and_attempt(self) -> None:
        self._create_result()
        reviewed = self._advance_data_review(self.active_session_id, self.target_series_id, 1)
        phase_selected = self._put(
            self.active_session_id,
            self._phase_selected_payload(
                target_series_id=self.target_series_id,
                expected_version=reviewed["version"],
            ),
        )
        self.assertEqual(phase_selected.status_code, 200, phase_selected.text)

        finalized = self._finalize(
            self.active_session_id,
            self.target_series_id,
            expected_version=phase_selected.json()["version"],
        )
        self.assertEqual(finalized.status_code, 200, finalized.text)
        body = finalized.json()
        self.assertFalse(body["replayed"])
        self.assertEqual(body["result"]["workflow_stage"], "ready")
        self.assertEqual(body["result"]["version"], 4)
        self.assertEqual(body["scan_session"]["status"], "completed")
        target = next(
            series
            for series in body["scan_session"]["series"]
            if series["id"] == self.target_series_id
        )
        self.assertEqual(target["execution_status"], "image_ready")

        db = self.SessionTesting()
        try:
            result = db.query(models.ScanSessionFourDResult).one()
            session = db.get(models.ScanSession, self.active_session_id)
            series = db.get(models.ScanSessionSeries, self.target_series_id)
            attempt = db.get(models.ScanSessionSeriesAttempt, self.source_attempt_id)
            self.assertEqual(result.workflow_stage, "ready")
            self.assertEqual(session.status, "completed")
            self.assertIsNotNone(session.completed_at)
            self.assertEqual(series.execution_status, "image_ready")
            self.assertIsNotNone(attempt.ended_at)
            self.assertEqual(attempt.outcome, "image_ready")
            self.assertEqual(db.query(models.DoseLog).count(), 0)
            self.assertEqual(
                db.query(models.SystemLog)
                .filter(models.SystemLog.event == "fourd_result_finalized")
                .count(),
                1,
            )
        finally:
            db.close()

    def test_four_d_finalize_does_not_emit_dose_logs_from_ready_topogram(self) -> None:
        db = self.SessionTesting()
        try:
            topogram = (
                db.query(models.ScanSessionSeries)
                .filter(
                    models.ScanSessionSeries.scan_session_id
                    == self.incomplete_session_id,
                    models.ScanSessionSeries.series_type == "topogram",
                )
                .one()
            )
            topogram.execution_status = "image_ready"
            topogram.topogram_param = models.ScanSessionTopogramParam(
                kv=120,
                ma=30,
                scan_length=80.0,
                fov=500.0,
                ctdi_vol=0.42,
                dlp=12.5,
            )
            db.commit()
        finally:
            db.close()

        self._create_result(
            scan_session_id=self.incomplete_session_id,
            target_series_id=self.incomplete_target_id,
        )
        reviewed = self._advance_data_review(self.incomplete_session_id, self.incomplete_target_id, 1)
        selected = self._put(
            self.incomplete_session_id,
            self._phase_selected_payload(
                target_series_id=self.incomplete_target_id,
                expected_version=reviewed["version"],
            ),
        )
        self.assertEqual(selected.status_code, 200, selected.text)
        finalized = self._finalize(
            self.incomplete_session_id,
            self.incomplete_target_id,
            expected_version=selected.json()["version"],
        )
        self.assertEqual(finalized.status_code, 200, finalized.text)

        db = self.SessionTesting()
        try:
            self.assertEqual(
                db.query(models.DoseLog)
                .filter(models.DoseLog.scan_session_id == self.incomplete_session_id)
                .count(),
                0,
            )
            log = (
                db.query(models.SystemLog)
                .filter(
                    models.SystemLog.scan_session_id == self.incomplete_session_id,
                    models.SystemLog.event == "fourd_result_finalized",
                )
                .one()
            )
            self.assertEqual(
                json.loads(log.details)["dose_log_disposition"],
                "not_emitted_no_formal_4d_dose_model",
            )
        finally:
            db.close()

    def test_finalize_rolls_back_when_other_series_is_not_ready(self) -> None:
        self._create_result(
            scan_session_id=self.incomplete_session_id,
            target_series_id=self.incomplete_target_id,
        )
        reviewed = self._advance_data_review(self.incomplete_session_id, self.incomplete_target_id, 1)
        phase_selected = self._put(
            self.incomplete_session_id,
            self._phase_selected_payload(
                target_series_id=self.incomplete_target_id,
                expected_version=reviewed["version"],
            ),
        )
        self.assertEqual(phase_selected.status_code, 200, phase_selected.text)

        blocked = self._finalize(
            self.incomplete_session_id,
            self.incomplete_target_id,
            expected_version=phase_selected.json()["version"],
        )
        self.assertEqual(blocked.status_code, 409, blocked.text)

        db = self.SessionTesting()
        try:
            result = (
                db.query(models.ScanSessionFourDResult)
                .filter(
                    models.ScanSessionFourDResult.scan_session_id
                    == self.incomplete_session_id
                )
                .one()
            )
            session = db.get(models.ScanSession, self.incomplete_session_id)
            target = db.get(models.ScanSessionSeries, self.incomplete_target_id)
            attempt = (
                db.query(models.ScanSessionSeriesAttempt)
                .filter(
                    models.ScanSessionSeriesAttempt.scan_session_series_id
                    == self.incomplete_target_id
                )
                .one()
            )
            self.assertEqual(result.workflow_stage, "phase_selected")
            self.assertEqual(result.version, 3)
            self.assertEqual(session.status, "in_progress")
            self.assertEqual(target.execution_status, "running")
            self.assertIsNone(attempt.ended_at)
            self.assertEqual(db.query(models.SystemLog).count(), 0)
            self.assertEqual(db.query(models.DoseLog).count(), 0)
        finally:
            db.close()

    def test_finalize_rejects_stale_version_without_partial_commit(self) -> None:
        self._create_result()
        reviewed = self._advance_data_review(self.active_session_id, self.target_series_id, 1)
        selected = self._put(
            self.active_session_id,
            self._phase_selected_payload(
                target_series_id=self.target_series_id,
                expected_version=reviewed["version"],
            ),
        )
        self.assertEqual(selected.status_code, 200, selected.text)

        stale = self._finalize(
            self.active_session_id,
            self.target_series_id,
            expected_version=1,
        )
        self.assertEqual(stale.status_code, 409, stale.text)

        db = self.SessionTesting()
        try:
            result = db.query(models.ScanSessionFourDResult).one()
            session = db.get(models.ScanSession, self.active_session_id)
            series = db.get(models.ScanSessionSeries, self.target_series_id)
            self.assertEqual(result.workflow_stage, "phase_selected")
            self.assertEqual(session.status, "in_progress")
            self.assertEqual(series.execution_status, "running")
        finally:
            db.close()

    def test_completed_finalize_replay_is_idempotent_after_lost_response(self) -> None:
        self._create_result()
        reviewed = self._advance_data_review(self.active_session_id, self.target_series_id, 1)
        selected = self._put(
            self.active_session_id,
            self._phase_selected_payload(
                target_series_id=self.target_series_id,
                expected_version=reviewed["version"],
            ),
        )
        self.assertEqual(selected.status_code, 200, selected.text)
        first = self._finalize(
            self.active_session_id,
            self.target_series_id,
            expected_version=selected.json()["version"],
        )
        self.assertEqual(first.status_code, 200, first.text)

        replay = self._finalize(
            self.active_session_id,
            self.target_series_id,
            expected_version=selected.json()["version"],
        )
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertTrue(replay.json()["replayed"])
        self.assertEqual(replay.json()["result"]["version"], 4)

        wrong_patient = self._finalize(
            self.active_session_id,
            self.target_series_id,
            expected_version=selected.json()["version"],
            patient_id=self.other_patient_id,
        )
        self.assertEqual(wrong_patient.status_code, 409, wrong_patient.text)

        db = self.SessionTesting()
        try:
            self.assertEqual(
                db.query(models.SystemLog)
                .filter(models.SystemLog.event == "fourd_result_finalized")
                .count(),
                1,
            )
            self.assertEqual(db.query(models.DoseLog).count(), 0)
        finally:
            db.close()

    def test_terminal_sessions_cannot_create_or_update_results(self) -> None:
        for session_id, target_id in (
            (self.completed_session_id, self.completed_target_id),
            (self.cancelled_session_id, self.cancelled_target_id),
        ):
            response = self._put(
                session_id,
                self._payload(target_series_id=target_id),
            )
            self.assertEqual(response.status_code, 409, response.text)

    def test_request_schema_is_strict_and_forbids_dose_or_source_fields(self) -> None:
        extra_source = self._payload()
        extra_source["image_source_id"] = "fourd-engineer"
        coerced_version = self._payload()
        coerced_version["expected_version"] = "0"
        dose_field = self._payload()
        dose_field["scan_result"]["ctdi_vol"] = None
        malformed_matrix = self._payload()
        malformed_matrix["scan_result"]["phase_matrix"] = malformed_matrix[
            "scan_result"
        ]["phase_matrix"][:1]

        for payload in (
            extra_source,
            coerced_version,
            dose_field,
            malformed_matrix,
        ):
            response = self._put(self.active_session_id, payload)
            self.assertEqual(response.status_code, 422, response.text)

    def test_deleting_target_cascades_persisted_result(self) -> None:
        self._create_result()
        db = self.SessionTesting()
        try:
            target = db.get(models.ScanSessionSeries, self.target_series_id)
            db.delete(target)
            db.commit()
            self.assertEqual(db.query(models.ScanSessionFourDResult).count(), 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
