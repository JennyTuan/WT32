from __future__ import annotations

import json
import unittest
import warnings
from datetime import date, datetime, timezone
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.database import Base, get_db
from backend.routers import scan_results, scan_sessions, scan_workflow_actions


class ScanWorkflowActionsApiTests(unittest.TestCase):
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
        self.SessionTesting = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=self.engine,
        )
        self.scan_session_id, self.topogram_id, self.target_series_id = self._seed_fixture()

        self.app = FastAPI()
        self.app.include_router(scan_sessions.router, prefix="/api")
        self.app.include_router(scan_workflow_actions.router, prefix="/api")
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

    def _seed_fixture(self) -> tuple[int, int, int]:
        db = self.SessionTesting()
        try:
            patient = models.Patient(
                name="Workflow Test Patient",
                patient_id="P-WORKFLOW-001",
                gender="female",
                age=40,
                birth_date=date(1986, 1, 1),
                height=165.0,
                weight=60.0,
            )
            protocol = models.Protocol(
                name="Workflow Action Protocol",
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

            scan_session = models.ScanSession(
                patient_id=patient.id,
                protocol_id=protocol.id,
                status="in_progress",
                session_name="Workflow Action Test",
                name=protocol.name,
                body_part=protocol.body_part,
                age_group=protocol.age_group,
                patient_weight=protocol.patient_weight,
                patient_position=protocol.patient_position,
                table_direction=protocol.table_direction,
                acquisition_type=protocol.acquisition_type,
                scan_mode=protocol.scan_mode,
                started_at=datetime.now(timezone.utc),
            )
            topogram = models.ScanSessionSeries(
                series_order=1,
                series_type="topogram",
                series_label="Topogram",
                execution_status="image_ready",
                range_confirmed=True,
            )
            target = models.ScanSessionSeries(
                series_order=2,
                series_type="helical",
                series_label="Helical",
                execution_status="pending",
            )
            scan_session.series.extend([topogram, target])
            db.add(scan_session)
            db.commit()
            return scan_session.id, topogram.id, target.id
        finally:
            db.close()

    def _execution(self, execution_status: str, failure_reason: str | None = None):
        payload = {"execution_status": execution_status}
        if failure_reason is not None:
            payload["failure_reason"] = failure_reason
        return self.client.put(
            f"/api/scan-sessions/series/{self.target_series_id}/execution",
            json=payload,
        )

    def _seed_stale_image_source(self) -> None:
        db = self.SessionTesting()
        try:
            target = db.get(models.ScanSessionSeries, self.target_series_id)
            target.image_source_id = "qin-lung-helical-demo"
            target.image_source_version = 1
            db.commit()
        finally:
            db.close()

    def _seed_failed_four_d_result(self) -> tuple[int, int, int, int, int]:
        db = self.SessionTesting()
        try:
            patient = models.Patient(
                name="4D Recovery Test Patient",
                patient_id="P-WORKFLOW-4D-001",
                gender="female",
                age=51,
            )
            protocol = models.Protocol(
                name="4D Recovery Protocol",
                body_part="CHEST",
                age_group="adult",
                patient_weight="50-90kg",
                patient_position="HFS",
                table_direction="in",
                acquisition_type="four_d",
                scan_mode="4d",
                is_4d=True,
            )
            db.add_all([patient, protocol])
            db.flush()

            scan_session = models.ScanSession(
                patient_id=patient.id,
                protocol_id=protocol.id,
                status="in_progress",
                session_name="4D recovery action test",
                name=protocol.name,
                body_part=protocol.body_part,
                age_group=protocol.age_group,
                patient_weight=protocol.patient_weight,
                patient_position=protocol.patient_position,
                table_direction=protocol.table_direction,
                acquisition_type="four_d",
                scan_mode="4d",
                started_at=datetime.now(timezone.utc),
            )
            target = models.ScanSessionSeries(
                series_order=1,
                series_type="4d",
                series_label="4D target",
                execution_status="failed",
                failure_reason="Simulated processing failure",
            )
            scan_session.series.append(target)
            db.add(scan_session)
            db.flush()

            old_attempt = models.ScanSessionSeriesAttempt(
                scan_session_id=scan_session.id,
                scan_session_series_id=target.id,
                attempt_number=1,
                started_at=datetime.now(timezone.utc),
                ended_at=datetime.now(timezone.utc),
                outcome="failed",
                end_reason="Simulated processing failure",
            )
            db.add(old_attempt)
            db.flush()
            old_result = models.ScanSessionFourDResult(
                scan_session_id=scan_session.id,
                target_series_id=target.id,
                version=1,
                workflow_stage="acquired",
                source_kind="simulation",
                image_source_id="fourd-engineer",
                image_source_version=1,
                source_attempt_id=old_attempt.id,
                scan_result_json=json.dumps(
                    {
                        "bed_count": 1,
                        "phase_count": 1,
                        "scan_length": 50.0,
                        "phase_matrix": [[{"frame_count": 1, "selected_frame": 0}]],
                        "rescan_occurred": False,
                        "rescan_bed_range": None,
                    }
                ),
            )
            db.add(old_result)
            db.commit()
            return (
                scan_session.id,
                patient.id,
                target.id,
                old_attempt.id,
                old_result.id,
            )
        finally:
            db.close()

    @staticmethod
    def _four_d_acquired_payload(patient_id: int, target_series_id: int) -> dict:
        return {
            "patient_id": patient_id,
            "target_series_id": target_series_id,
            "expected_version": 0,
            "workflow_stage": "acquired",
            "scan_result": {
                "bed_count": 1,
                "phase_count": 1,
                "scan_length": 50.0,
                "phase_matrix": [[{"frame_count": 1, "selected_frame": 0}]],
                "rescan_occurred": False,
                "rescan_bed_range": None,
            },
            "rescan_choices": None,
            "phase_selections": None,
        }

    def _action(
        self,
        action_id: str,
        action: str,
        *,
        reason: str,
        target_series_id: int | None = None,
    ):
        payload = {
            "action_id": action_id,
            "action": action,
            "reason": reason,
        }
        if target_series_id is not None:
            payload["target_series_id"] = target_series_id
        return self.client.post(
            f"/api/scan-sessions/{self.scan_session_id}/actions",
            json=payload,
        )

    def test_return_to_edit_is_atomic_audited_and_idempotent(self) -> None:
        running = self._execution("running")
        self.assertEqual(running.status_code, 200, running.text)
        self._seed_stale_image_source()

        first = self._action(
            "return-0001",
            "return_to_edit",
            reason="Operator requested parameter review",
            target_series_id=self.target_series_id,
        )
        self.assertEqual(first.status_code, 200, first.text)
        body = first.json()
        self.assertFalse(body["replayed"])
        self.assertEqual(body["action"]["next_entry"], "series_edit")
        self.assertEqual(body["action"]["dose_log_disposition"], "not_emitted")
        self.assertEqual(body["scan_session"]["status"], "in_progress")
        series_by_id = {series["id"]: series for series in body["scan_session"]["series"]}
        self.assertEqual(series_by_id[self.target_series_id]["execution_status"], "pending")
        self.assertIsNone(series_by_id[self.target_series_id]["image_source_id"])
        self.assertIsNone(series_by_id[self.target_series_id]["image_source_version"])
        self.assertFalse(series_by_id[self.topogram_id]["range_confirmed"])

        replay = self._action(
            "return-0001",
            "return_to_edit",
            reason="Operator requested parameter review",
            target_series_id=self.target_series_id,
        )
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertTrue(replay.json()["replayed"])

        actions = self.client.get(
            f"/api/scan-sessions/{self.scan_session_id}/actions"
        )
        self.assertEqual(actions.status_code, 200, actions.text)
        self.assertEqual(len(actions.json()), 1)

        attempts = self.client.get(
            f"/api/scan-sessions/{self.scan_session_id}/attempts",
            params={"target_series_id": self.target_series_id},
        )
        self.assertEqual(attempts.status_code, 200, attempts.text)
        self.assertEqual(len(attempts.json()), 1)
        self.assertEqual(attempts.json()[0]["outcome"], "returned_to_edit")
        self.assertEqual(
            attempts.json()[0]["end_reason"],
            "Operator requested parameter review",
        )

        db = self.SessionTesting()
        try:
            self.assertEqual(db.query(models.ScanSessionWorkflowAction).count(), 1)
            self.assertEqual(
                db.query(models.SystemLog)
                .filter(models.SystemLog.event == "workflow_return_to_edit")
                .count(),
                1,
            )
            self.assertEqual(db.query(models.DoseLog).count(), 0)
            log = (
                db.query(models.SystemLog)
                .filter(models.SystemLog.event == "workflow_return_to_edit")
                .one()
            )
            self.assertEqual(
                json.loads(log.details)["dose_log_disposition"],
                "not_emitted",
            )
        finally:
            db.close()

    def test_action_id_collision_with_different_payload_is_rejected(self) -> None:
        running = self._execution("running")
        self.assertEqual(running.status_code, 200, running.text)
        failed = self._execution("failed", "Simulated reconstruction failure")
        self.assertEqual(failed.status_code, 200, failed.text)
        first = self._action(
            "action-0002",
            "retry_series",
            reason="Retry after simulated failure",
            target_series_id=self.target_series_id,
        )
        self.assertEqual(first.status_code, 200, first.text)

        collision = self._action(
            "action-0002",
            "return_to_edit",
            reason="Different payload",
            target_series_id=self.target_series_id,
        )
        self.assertEqual(collision.status_code, 409, collision.text)
        self.assertEqual(collision.json()["detail"]["code"], "ACTION_ID_CONFLICT")

    def test_action_id_is_rechecked_after_waiting_for_the_session_lock(self) -> None:
        reason = "Retry already committed by the overlapping request"
        db = self.SessionTesting()
        try:
            db.add(
                models.ScanSessionWorkflowAction(
                    action_id="overlap-retry-0001",
                    scan_session_id=self.scan_session_id,
                    target_series_id=self.target_series_id,
                    action_type="retry_series",
                    reason=reason,
                    resulting_session_status="in_progress",
                    resulting_series_status="pending",
                    next_entry="series_confirm",
                    dose_log_disposition="not_emitted",
                )
            )
            db.commit()
        finally:
            db.close()

        original_find_action = scan_workflow_actions._find_action
        call_count = 0

        def hide_first_read(db, scan_session_id, action_id):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return None
            return original_find_action(db, scan_session_id, action_id)

        with patch.object(
            scan_workflow_actions,
            "_find_action",
            side_effect=hide_first_read,
        ):
            replay = self._action(
                "overlap-retry-0001",
                "retry_series",
                reason=reason,
                target_series_id=self.target_series_id,
            )

        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertTrue(replay.json()["replayed"])
        self.assertEqual(call_count, 2)

    def test_retry_requires_explicit_action_and_opens_a_new_attempt(self) -> None:
        self.assertEqual(self._execution("running").status_code, 200)
        failed = self._execution("failed", "Simulated detector timeout")
        self.assertEqual(failed.status_code, 200, failed.text)
        self._seed_stale_image_source()

        direct_restart = self._execution("running")
        self.assertEqual(direct_restart.status_code, 409, direct_restart.text)
        direct_reset = self._execution("pending")
        self.assertEqual(direct_reset.status_code, 409, direct_reset.text)

        retry = self._action(
            "retry-0003",
            "retry_series",
            reason="Retry after checking simulated timeout",
            target_series_id=self.target_series_id,
        )
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(
            next(
                series
                for series in retry.json()["scan_session"]["series"]
                if series["id"] == self.target_series_id
            )["execution_status"],
            "pending",
        )
        retried_target = next(
            series
            for series in retry.json()["scan_session"]["series"]
            if series["id"] == self.target_series_id
        )
        self.assertIsNone(retried_target["image_source_id"])
        self.assertIsNone(retried_target["image_source_version"])
        topogram = next(
            series
            for series in retry.json()["scan_session"]["series"]
            if series["id"] == self.topogram_id
        )
        self.assertTrue(topogram["range_confirmed"])

        restarted = self._execution("running")
        self.assertEqual(restarted.status_code, 200, restarted.text)
        attempts = self.client.get(
            f"/api/scan-sessions/{self.scan_session_id}/attempts",
            params={"target_series_id": self.target_series_id},
        )
        self.assertEqual(attempts.status_code, 200, attempts.text)
        self.assertEqual([item["attempt_number"] for item in attempts.json()], [1, 2])
        self.assertEqual(attempts.json()[0]["outcome"], "failed")
        self.assertEqual(attempts.json()[0]["end_reason"], "Simulated detector timeout")
        self.assertIsNone(attempts.json()[1]["outcome"])

    def test_four_d_retry_invalidates_old_result_and_binds_new_attempt(self) -> None:
        (
            scan_session_id,
            patient_id,
            target_series_id,
            old_attempt_id,
            old_result_id,
        ) = self._seed_failed_four_d_result()
        reason = "Retry the simulated 4D acquisition"
        retry = self.client.post(
            f"/api/scan-sessions/{scan_session_id}/actions",
            json={
                "action_id": "retry-four-d-0001",
                "action": "retry_series",
                "reason": reason,
                "target_series_id": target_series_id,
            },
        )
        self.assertEqual(retry.status_code, 200, retry.text)

        db = self.SessionTesting()
        try:
            self.assertIsNone(db.get(models.ScanSessionFourDResult, old_result_id))
            log = (
                db.query(models.SystemLog)
                .filter(
                    models.SystemLog.scan_session_id == scan_session_id,
                    models.SystemLog.event == "workflow_retry_series",
                )
                .one()
            )
            invalidated = json.loads(log.details)["invalidated_four_d_result"]
            self.assertEqual(invalidated["result_id"], old_result_id)
            self.assertEqual(invalidated["source_attempt_id"], old_attempt_id)
            self.assertEqual(
                invalidated["disposition"],
                "deleted_before_new_attempt",
            )
        finally:
            db.close()

        restarted = self.client.put(
            f"/api/scan-sessions/series/{target_series_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(restarted.status_code, 200, restarted.text)
        recreated = self.client.put(
            f"/api/scan-sessions/{scan_session_id}/fourd-result",
            json=self._four_d_acquired_payload(patient_id, target_series_id),
        )
        self.assertEqual(recreated.status_code, 200, recreated.text)
        self.assertNotEqual(recreated.json()["source_attempt_id"], old_attempt_id)

        attempts = self.client.get(
            f"/api/scan-sessions/{scan_session_id}/attempts",
            params={"target_series_id": target_series_id},
        )
        self.assertEqual(attempts.status_code, 200, attempts.text)
        self.assertEqual(
            [attempt["attempt_number"] for attempt in attempts.json()],
            [1, 2],
        )

    def test_four_d_return_to_edit_also_allows_result_recreation(self) -> None:
        (
            scan_session_id,
            patient_id,
            target_series_id,
            old_attempt_id,
            old_result_id,
        ) = self._seed_failed_four_d_result()
        returned = self.client.post(
            f"/api/scan-sessions/{scan_session_id}/actions",
            json={
                "action_id": "return-four-d-0001",
                "action": "return_to_edit",
                "reason": "Review the simulated 4D parameters",
                "target_series_id": target_series_id,
            },
        )
        self.assertEqual(returned.status_code, 200, returned.text)

        db = self.SessionTesting()
        try:
            self.assertIsNone(db.get(models.ScanSessionFourDResult, old_result_id))
        finally:
            db.close()

        restarted = self.client.put(
            f"/api/scan-sessions/series/{target_series_id}/execution",
            json={"execution_status": "running"},
        )
        self.assertEqual(restarted.status_code, 200, restarted.text)
        recreated = self.client.put(
            f"/api/scan-sessions/{scan_session_id}/fourd-result",
            json=self._four_d_acquired_payload(patient_id, target_series_id),
        )
        self.assertEqual(recreated.status_code, 200, recreated.text)
        self.assertNotEqual(recreated.json()["source_attempt_id"], old_attempt_id)

    def test_terminate_exam_settles_running_series_and_cancels_atomically(self) -> None:
        self.assertEqual(self._execution("running").status_code, 200)
        self._seed_stale_image_source()

        terminated = self._action(
            "terminate-0004",
            "terminate_exam",
            reason="Operator terminated the simulated exam",
            target_series_id=self.target_series_id,
        )
        self.assertEqual(terminated.status_code, 200, terminated.text)
        body = terminated.json()
        self.assertEqual(body["scan_session"]["status"], "cancelled")
        target = next(
            series
            for series in body["scan_session"]["series"]
            if series["id"] == self.target_series_id
        )
        self.assertEqual(target["execution_status"], "interrupted")
        self.assertEqual(target["failure_reason"], "Operator terminated the simulated exam")
        self.assertIsNone(target["image_source_id"])
        self.assertIsNone(target["image_source_version"])
        self.assertEqual(body["action"]["next_entry"], "patient_list")

        replay = self._action(
            "terminate-0004",
            "terminate_exam",
            reason="Operator terminated the simulated exam",
            target_series_id=self.target_series_id,
        )
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertTrue(replay.json()["replayed"])

        new_termination = self._action(
            "terminate-0005",
            "terminate_exam",
            reason="Duplicate terminal request",
        )
        self.assertEqual(new_termination.status_code, 409, new_termination.text)

        attempts = self.client.get(
            f"/api/scan-sessions/{self.scan_session_id}/attempts"
        )
        self.assertEqual(attempts.status_code, 200, attempts.text)
        self.assertEqual(attempts.json()[0]["outcome"], "interrupted")
        self.assertEqual(
            attempts.json()[0]["end_reason"],
            "Operator terminated the simulated exam",
        )

        db = self.SessionTesting()
        try:
            self.assertEqual(db.query(models.DoseLog).count(), 0)
            self.assertEqual(
                db.query(models.SystemLog)
                .filter(models.SystemLog.event == "workflow_terminate_exam")
                .count(),
                1,
            )
        finally:
            db.close()

    def test_finish_with_partial_is_explicitly_unavailable_and_has_no_side_effect(self) -> None:
        response = self._action(
            "partial-0006",
            "finish_with_partial",
            reason="Keep available images and end",
            target_series_id=self.target_series_id,
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(
            response.json()["detail"]["code"],
            "PARTIAL_RESULT_NOT_SUPPORTED",
        )

        refreshed = self.client.get(f"/api/scan-sessions/{self.scan_session_id}")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(refreshed.json()["status"], "in_progress")
        self.assertEqual(
            next(
                series
                for series in refreshed.json()["series"]
                if series["id"] == self.target_series_id
            )["execution_status"],
            "pending",
        )
        db = self.SessionTesting()
        try:
            self.assertEqual(db.query(models.ScanSessionWorkflowAction).count(), 0)
            self.assertEqual(db.query(models.SystemLog).count(), 0)
            self.assertEqual(db.query(models.DoseLog).count(), 0)
        finally:
            db.close()

    def test_invalid_action_does_not_partially_change_series(self) -> None:
        invalid_retry = self._action(
            "retry-0007",
            "retry_series",
            reason="Retry pending series",
            target_series_id=self.target_series_id,
        )
        self.assertEqual(invalid_retry.status_code, 409, invalid_retry.text)

        missing_target = self._action(
            "return-0008",
            "return_to_edit",
            reason="Missing target",
        )
        self.assertEqual(missing_target.status_code, 422, missing_target.text)

        db = self.SessionTesting()
        try:
            target = db.get(models.ScanSessionSeries, self.target_series_id)
            self.assertEqual(target.execution_status, "pending")
            self.assertEqual(db.query(models.ScanSessionWorkflowAction).count(), 0)
            self.assertEqual(db.query(models.SystemLog).count(), 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
