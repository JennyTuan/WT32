from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from .schemas import ReconstructionJob, ReconstructionJobCreate


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReconstructionJobStore:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._initialize()

    def _connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self):
        with closing(self._connect()) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS reconstruction_jobs (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    progress INTEGER NOT NULL,
                    request_json TEXT NOT NULL,
                    provider_job_id TEXT,
                    output_series_json TEXT,
                    error_code TEXT,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.commit()

    def create(self, job_id: str, request: ReconstructionJobCreate, provider_job_id: str, status: str, progress: int):
        now = utc_now()
        with self._lock, closing(self._connect()) as connection:
            connection.execute(
                """
                INSERT INTO reconstruction_jobs (
                    job_id, status, progress, request_json, provider_job_id,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    status,
                    progress,
                    request.model_dump_json(),
                    provider_job_id,
                    now.isoformat(),
                    now.isoformat(),
                ),
            )
            connection.commit()
        return self.get(job_id)

    def get(self, job_id: str) -> ReconstructionJob | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM reconstruction_jobs WHERE job_id = ?",
                (job_id,),
            ).fetchone()
        if row is None:
            return None
        return ReconstructionJob(
            job_id=row["job_id"],
            status=row["status"],
            progress=row["progress"],
            request=ReconstructionJobCreate.model_validate_json(row["request_json"]),
            provider_job_id=row["provider_job_id"],
            output_series=json.loads(row["output_series_json"]) if row["output_series_json"] else None,
            error_code=row["error_code"],
            error_message=row["error_message"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def list(self, scan_session_id: int | None = None) -> list[ReconstructionJob]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT job_id FROM reconstruction_jobs ORDER BY created_at DESC"
            ).fetchall()
        jobs = [self.get(row["job_id"]) for row in rows]
        return [
            job
            for job in jobs
            if job is not None and (scan_session_id is None or job.request.scan_session_id == scan_session_id)
        ]

    def update(self, job_id: str, *, status: str, progress: int, output_series=None, error_code=None, error_message=None):
        output_json = output_series.model_dump_json() if output_series is not None else None
        with self._lock, closing(self._connect()) as connection:
            connection.execute(
                """
                UPDATE reconstruction_jobs
                SET status = ?, progress = ?, output_series_json = ?, error_code = ?,
                    error_message = ?, updated_at = ?
                WHERE job_id = ?
                """,
                (
                    status,
                    progress,
                    output_json,
                    error_code,
                    error_message,
                    utc_now().isoformat(),
                    job_id,
                ),
            )
            connection.commit()
        return self.get(job_id)
