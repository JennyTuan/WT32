from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class DatabaseConfigurationTests(unittest.TestCase):
    def test_postgresql_database_url_uses_psycopg_driver(self) -> None:
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://wt32_user:p%40ss@localhost:5432/wt32"

        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "from backend.database import engine; print(engine.url.drivername)",
            ],
            cwd=PROJECT_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "postgresql+psycopg")

    def test_unencoded_at_sign_in_password_reports_configuration_error(self) -> None:
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://wt32_user:p@ss@localhost:5432/wt32"

        result = subprocess.run(
            [sys.executable, "-c", "import backend.database"],
            cwd=PROJECT_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("%40", result.stderr)

    def test_alembic_requires_explicit_database_url(self) -> None:
        env = os.environ.copy()
        env["DATABASE_URL"] = " "

        result = subprocess.run(
            [sys.executable, "-m", "alembic", "current"],
            cwd=PROJECT_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DATABASE_URL", result.stderr)


if __name__ == "__main__":
    unittest.main()
