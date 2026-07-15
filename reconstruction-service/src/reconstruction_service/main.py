from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, status

from .providers import ReconstructionProvider, ReconstructionProviderError, load_provider
from .schemas import ReconstructionCapabilities, ReconstructionJob, ReconstructionJobCreate
from .store import ReconstructionJobStore


def _default_database_path() -> Path:
    configured = os.environ.get("WT32_RECONSTRUCTION_DB", "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "data" / "reconstruction_jobs.db"


def create_app(
    provider: ReconstructionProvider | None = None,
    store: ReconstructionJobStore | None = None,
) -> FastAPI:
    application = FastAPI(
        title="WT32 Reconstruction Service",
        version="0.1.0",
        description="Vendor-neutral reconstruction job orchestration. It does not implement a CT reconstruction algorithm.",
    )
    active_provider = provider or load_provider()
    job_store = store or ReconstructionJobStore(_default_database_path())

    def provider_error(exc: ReconstructionProviderError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    @application.get("/health")
    def health():
        capabilities = active_provider.capabilities()
        return {"status": "ready" if capabilities.service_ready else "not_configured"}

    @application.get("/api/v1/reconstruction/capabilities", response_model=ReconstructionCapabilities)
    def capabilities():
        return active_provider.capabilities()

    @application.post(
        "/api/v1/reconstruction/jobs",
        response_model=ReconstructionJob,
        status_code=status.HTTP_202_ACCEPTED,
    )
    def create_job(payload: ReconstructionJobCreate):
        try:
            submission = active_provider.submit(payload)
        except ReconstructionProviderError as exc:
            provider_error(exc)
        job_id = f"recon-{uuid4()}"
        return job_store.create(
            job_id,
            payload,
            submission.provider_job_id,
            submission.status,
            submission.progress,
        )

    @application.get("/api/v1/reconstruction/jobs", response_model=list[ReconstructionJob])
    def list_jobs(scan_session_id: int | None = None):
        return job_store.list(scan_session_id=scan_session_id)

    @application.get("/api/v1/reconstruction/jobs/{job_id}", response_model=ReconstructionJob)
    def get_job(job_id: str):
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail={"code": "RECONSTRUCTION_JOB_NOT_FOUND", "message": "重建任务不存在。"})
        if job.status in {"queued", "running"} and job.provider_job_id:
            try:
                update = active_provider.get_status(job.provider_job_id)
            except ReconstructionProviderError as exc:
                provider_error(exc)
            job = job_store.update(
                job_id,
                status=update.status,
                progress=update.progress,
                output_series=update.output_series,
                error_code=update.error_code,
                error_message=update.error_message,
            )
        return job

    @application.delete("/api/v1/reconstruction/jobs/{job_id}", response_model=ReconstructionJob)
    def cancel_job(job_id: str):
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail={"code": "RECONSTRUCTION_JOB_NOT_FOUND", "message": "重建任务不存在。"})
        if job.status not in {"queued", "running"} or not job.provider_job_id:
            return job
        try:
            update = active_provider.cancel(job.provider_job_id)
        except ReconstructionProviderError as exc:
            provider_error(exc)
        return job_store.update(
            job_id,
            status=update.status,
            progress=update.progress,
            output_series=update.output_series,
            error_code=update.error_code,
            error_message=update.error_message,
        )

    return application


app = create_app()
