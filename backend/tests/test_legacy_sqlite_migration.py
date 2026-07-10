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


class LegacySqliteMigrationTests(unittest.TestCase):
    def test_cli_copies_relational_data_into_empty_migrated_database(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "source.db"
            target_path = Path(temp_dir) / "target.db"
            self._upgrade_database(source_path)
            self._upgrade_database(target_path)
            self._seed_source(source_path)

            env = os.environ.copy()
            env["DATABASE_URL"] = f"sqlite:///{target_path.as_posix()}"
            dry_run = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "backend.migrate_legacy_sqlite",
                    "--source",
                    str(source_path),
                    "--dry-run",
                ],
                cwd=PROJECT_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(dry_run.returncode, 0, dry_run.stderr)
            connection = sqlite3.connect(target_path)
            try:
                self.assertEqual(
                    connection.execute("SELECT COUNT(*) FROM patients").fetchone()[0],
                    0,
                )
            finally:
                connection.close()

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "backend.migrate_legacy_sqlite",
                    "--source",
                    str(source_path),
                ],
                cwd=PROJECT_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)

            connection = sqlite3.connect(target_path)
            try:
                patient = connection.execute(
                    "SELECT id, name, patient_id FROM patients"
                ).fetchone()
                protocol = connection.execute(
                    "SELECT id, name FROM protocols"
                ).fetchone()
                scan_session = connection.execute(
                    "SELECT id, patient_id, protocol_id FROM scan_sessions"
                ).fetchone()
            finally:
                connection.close()

            self.assertEqual(patient, (11, "Migration Patient", "P-MIGRATION-001"))
            self.assertEqual(protocol, (21, "Migration Protocol"))
            self.assertEqual(scan_session, (31, 11, 21))

    def _upgrade_database(self, database_path: Path) -> None:
        env = os.environ.copy()
        env["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "alembic",
                "-c",
                str(ALEMBIC_INI),
                "upgrade",
                "head",
            ],
            cwd=PROJECT_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def _seed_source(self, database_path: Path) -> None:
        connection = sqlite3.connect(database_path)
        try:
            connection.execute(
                "INSERT INTO patients "
                "(id, name, patient_id, gender, age) "
                "VALUES (11, 'Migration Patient', 'P-MIGRATION-001', 'other', 40)"
            )
            connection.execute(
                "INSERT INTO protocols "
                "(id, name, body_part, age_group, patient_weight, patient_position, "
                "table_direction, acquisition_type, scan_mode, is_4d, is_enhance, "
                "is_factory, is_enabled) "
                "VALUES (21, 'Migration Protocol', 'test', 'adult', '50-90kg', 'HFS', "
                "'in', 'regular', 'plain', 0, 0, 0, 1)"
            )
            connection.execute(
                "INSERT INTO scan_sessions "
                "(id, patient_id, protocol_id, status, name, body_part, age_group, "
                "patient_weight, patient_position, table_direction, acquisition_type, scan_mode) "
                "VALUES (31, 11, 21, 'draft', 'Migration Session', 'test', 'adult', "
                "'50-90kg', 'HFS', 'in', 'regular', 'plain')"
            )
            connection.commit()
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
