from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Response, status


router = APIRouter(prefix="/reconstruction", tags=["reconstruction"])


def _service_base_url() -> str:
    return os.environ.get("WT32_RECONSTRUCTION_SERVICE_URL", "http://127.0.0.1:8010").rstrip("/")


def _service_request(method: str, path: str, payload: dict | None = None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        f"{_service_base_url()}{path}",
        data=body,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    timeout = float(os.environ.get("WT32_RECONSTRUCTION_SERVICE_TIMEOUT_SECONDS", "5"))
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("detail")
        except (ValueError, UnicodeDecodeError):
            detail = None
        raise HTTPException(
            status_code=exc.code,
            detail=detail or {
                "code": "RECONSTRUCTION_SERVICE_ERROR",
                "message": "重建服务返回异常。",
            },
        ) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "RECONSTRUCTION_SERVICE_UNAVAILABLE",
                "message": "重建服务当前不可用，请确认服务已启动并完成引擎配置。",
            },
        ) from exc


@router.get("/capabilities")
def get_capabilities():
    _, body = _service_request("GET", "/api/v1/reconstruction/capabilities")
    return body


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED)
def create_job(payload: dict, response: Response):
    upstream_status, body = _service_request("POST", "/api/v1/reconstruction/jobs", payload)
    response.status_code = upstream_status
    return body


@router.get("/jobs")
def list_jobs(scan_session_id: int | None = None):
    query = f"?scan_session_id={scan_session_id}" if scan_session_id is not None else ""
    _, body = _service_request("GET", f"/api/v1/reconstruction/jobs{query}")
    return body


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    _, body = _service_request("GET", f"/api/v1/reconstruction/jobs/{job_id}")
    return body


@router.delete("/jobs/{job_id}")
def cancel_job(job_id: str):
    _, body = _service_request("DELETE", f"/api/v1/reconstruction/jobs/{job_id}")
    return body
