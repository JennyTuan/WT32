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
            finally:
                connection.close()
            self.assertTrue(
                {
                    "alembic_version",
                    "patients",
                    "protocols",
                    "scan_sessions",
                    "user_accounts",
                }.issubset(tables),
                tables,
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
