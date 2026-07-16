from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = PROJECT_ROOT / "alembic.ini"


class DatabaseMigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_fresh_database(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "migration-test.db"
            env = os.environ.copy()
            env["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"

            upgrade = self._run_alembic("upgrade", "head", env=env)
            self.assertEqual(upgrade.returncode, 0, upgrade.stderr)

            connection = sqlite3.connect(database_path)
            try:
                tables = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    )
                }
                fourd_result_columns = {
                    row[1]
                    for row in connection.execute(
                        "PRAGMA table_info('scan_session_fourd_results')"
                    )
                }
                fourd_result_foreign_keys = {
                    (row[3], row[2], row[4], row[6])
                    for row in connection.execute(
                        "PRAGMA foreign_key_list('scan_session_fourd_results')"
                    )
                }
                series_columns = {
                    row[1]
                    for row in connection.execute(
                        "PRAGMA table_info('scan_session_series')"
                    )
                }
            finally:
                connection.close()
            self.assertTrue(
                {
                    "alembic_version",
                    "patients",
                    "protocols",
                    "scan_sessions",
                    "scan_session_fourd_results",
                    "scan_session_series_attempts",
                    "user_accounts",
                }.issubset(tables),
                tables,
            )
            self.assertTrue(
                {
                    "image_source_id",
                    "image_source_version",
                    "source_attempt_id",
                }.issubset(fourd_result_columns),
                fourd_result_columns,
            )
            self.assertIn(
                (
                    "source_attempt_id",
                    "scan_session_series_attempts",
                    "id",
                    "SET NULL",
                ),
                fourd_result_foreign_keys,
            )
            self.assertTrue(
                {"image_source_id", "image_source_version"}.issubset(series_columns),
                series_columns,
            )

            schema_check = self._run_alembic("check", env=env)
            self.assertEqual(schema_check.returncode, 0, schema_check.stderr)

            downgrade = self._run_alembic("downgrade", "base", env=env)
            self.assertEqual(downgrade.returncode, 0, downgrade.stderr)

            connection = sqlite3.connect(database_path)
            try:
                remaining_user_tables = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master "
                        "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
                        "AND name != 'alembic_version'"
                    )
                }
            finally:
                connection.close()
            self.assertEqual(remaining_user_tables, set())

    def test_fourd_provenance_migration_backfills_existing_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "fourd-provenance-migration.db"
            env = os.environ.copy()
            env["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"

            upgrade_to_previous = self._run_alembic(
                "upgrade",
                "20260716_0004",
                env=env,
            )
            self.assertEqual(
                upgrade_to_previous.returncode,
                0,
                upgrade_to_previous.stderr,
            )

            connection = sqlite3.connect(database_path)
            try:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute(
                    "INSERT INTO patients (id, name, patient_id, gender, age) "
                    "VALUES (1, 'Migration Patient', 'MIG-4D-001', 'other', 40)"
                )
                connection.execute(
                    "INSERT INTO protocols "
                    "(id, name, body_part, age_group, patient_weight, "
                    "patient_position, table_direction, acquisition_type, "
                    "scan_mode, is_4d, is_enhance, is_factory, is_enabled) "
                    "VALUES (1, 'Migration 4D', 'CHEST', 'adult', '50-90kg', "
                    "'HFS', 'in', 'four_d', '4d', 1, 0, 0, 1)"
                )
                connection.execute(
                    "INSERT INTO scan_sessions "
                    "(id, patient_id, protocol_id, status, name, body_part, "
                    "age_group, patient_weight, patient_position, table_direction, "
                    "acquisition_type, scan_mode) "
                    "VALUES (1, 1, 1, 'in_progress', 'Migration Session', "
                    "'CHEST', 'adult', '50-90kg', 'HFS', 'in', 'four_d', '4d')"
                )
                connection.execute(
                    "INSERT INTO scan_session_series "
                    "(id, scan_session_id, series_order, series_type, series_label, "
                    "execution_status, range_confirmed) "
                    "VALUES (1, 1, 1, '4d', 'Migration Target', 'running', 0)"
                )
                connection.execute(
                    "INSERT INTO scan_session_series_attempts "
                    "(id, scan_session_id, scan_session_series_id, attempt_number, "
                    "started_at) VALUES (1, 1, 1, 1, CURRENT_TIMESTAMP)"
                )
                connection.execute(
                    "INSERT INTO scan_session_fourd_results "
                    "(id, scan_session_id, target_series_id, version, workflow_stage, "
                    "source_kind, scan_result_json) "
                    "VALUES (1, 1, 1, 1, 'acquired', 'simulation', '{}')"
                )
                connection.commit()
            finally:
                connection.close()

            upgrade_to_head = self._run_alembic("upgrade", "head", env=env)
            self.assertEqual(upgrade_to_head.returncode, 0, upgrade_to_head.stderr)

            connection = sqlite3.connect(database_path)
            try:
                provenance = connection.execute(
                    "SELECT image_source_id, image_source_version, source_attempt_id "
                    "FROM scan_session_fourd_results WHERE id = 1"
                ).fetchone()
                self.assertEqual(provenance, ("fourd-engineer", 1, 1))
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE scan_session_fourd_results "
                        "SET image_source_version = 2 WHERE id = 1"
                    )
            finally:
                connection.close()

            downgrade = self._run_alembic(
                "downgrade",
                "20260716_0004",
                env=env,
            )
            self.assertEqual(downgrade.returncode, 0, downgrade.stderr)

            connection = sqlite3.connect(database_path)
            try:
                columns_after_downgrade = {
                    row[1]
                    for row in connection.execute(
                        "PRAGMA table_info('scan_session_fourd_results')"
                    )
                }
                remaining_result_count = connection.execute(
                    "SELECT COUNT(*) FROM scan_session_fourd_results"
                ).fetchone()[0]
            finally:
                connection.close()
            self.assertNotIn("image_source_id", columns_after_downgrade)
            self.assertNotIn("image_source_version", columns_after_downgrade)
            self.assertNotIn("source_attempt_id", columns_after_downgrade)
            self.assertEqual(remaining_result_count, 1)

    def test_series_image_source_migration_is_constrained_and_reversible(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "series-image-source-migration.db"
            env = os.environ.copy()
            env["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"

            upgrade_to_previous = self._run_alembic(
                "upgrade",
                "20260716_0005",
                env=env,
            )
            self.assertEqual(
                upgrade_to_previous.returncode,
                0,
                upgrade_to_previous.stderr,
            )

            connection = sqlite3.connect(database_path)
            try:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute(
                    "INSERT INTO patients (id, name, patient_id, gender, age) "
                    "VALUES (1, 'Migration Patient', 'MIG-SOURCE-001', 'other', 40)"
                )
                connection.execute(
                    "INSERT INTO protocols "
                    "(id, name, body_part, age_group, patient_weight, "
                    "patient_position, table_direction, acquisition_type, "
                    "scan_mode, is_4d, is_enhance, is_factory, is_enabled) "
                    "VALUES (1, 'Migration Source', 'HEAD', 'adult', '50-90kg', "
                    "'HFS', 'in', 'regular', 'plain', 0, 0, 0, 1)"
                )
                connection.execute(
                    "INSERT INTO scan_sessions "
                    "(id, patient_id, protocol_id, status, name, body_part, "
                    "age_group, patient_weight, patient_position, table_direction, "
                    "acquisition_type, scan_mode) "
                    "VALUES (1, 1, 1, 'in_progress', 'Migration Session', "
                    "'HEAD', 'adult', '50-90kg', 'HFS', 'in', 'regular', 'plain')"
                )
                connection.execute(
                    "INSERT INTO scan_session_series "
                    "(id, scan_session_id, series_order, series_type, series_label, "
                    "execution_status, range_confirmed) "
                    "VALUES (1, 1, 1, 'helical', 'Migration Target', "
                    "'image_ready', 0)"
                )
                connection.commit()
            finally:
                connection.close()

            upgrade_to_head = self._run_alembic("upgrade", "head", env=env)
            self.assertEqual(upgrade_to_head.returncode, 0, upgrade_to_head.stderr)

            connection = sqlite3.connect(database_path)
            try:
                self.assertEqual(
                    connection.execute(
                        "SELECT image_source_id, image_source_version "
                        "FROM scan_session_series WHERE id = 1"
                    ).fetchone(),
                    (None, None),
                )
                connection.execute(
                    "UPDATE scan_session_series "
                    "SET image_source_id = 'brain-helical-demo', "
                    "image_source_version = 1 WHERE id = 1"
                )
                connection.commit()

                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE scan_session_series "
                        "SET image_source_id = 'arbitrary-path' WHERE id = 1"
                    )
                connection.rollback()
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE scan_session_series "
                        "SET image_source_version = NULL WHERE id = 1"
                    )
                connection.rollback()
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE scan_session_series "
                        "SET image_source_version = 2 WHERE id = 1"
                    )
                connection.rollback()
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE scan_session_series "
                        "SET image_source_id = 'head-stroke-topogram', "
                        "image_source_version = 1 WHERE id = 1"
                    )
                connection.rollback()
            finally:
                connection.close()

            downgrade = self._run_alembic(
                "downgrade",
                "20260716_0005",
                env=env,
            )
            self.assertEqual(downgrade.returncode, 0, downgrade.stderr)

            connection = sqlite3.connect(database_path)
            try:
                columns_after_downgrade = {
                    row[1]
                    for row in connection.execute(
                        "PRAGMA table_info('scan_session_series')"
                    )
                }
                remaining_series_count = connection.execute(
                    "SELECT COUNT(*) FROM scan_session_series"
                ).fetchone()[0]
            finally:
                connection.close()
            self.assertNotIn("image_source_id", columns_after_downgrade)
            self.assertNotIn("image_source_version", columns_after_downgrade)
            self.assertEqual(remaining_series_count, 1)

    def _run_alembic(
        self,
        *arguments: str,
        env: dict[str, str],
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                "-m",
                "alembic",
                "-c",
                str(ALEMBIC_INI),
                *arguments,
            ],
            cwd=PROJECT_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )


if __name__ == "__main__":
    unittest.main()
