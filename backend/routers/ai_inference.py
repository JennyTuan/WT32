"""AI inference orchestration — fracture / future modalities.

Architecture:
    Frontend ─POST /api/ai/fracture/analyze─▶ create Job ──▶ background task
                                                              │
                                                              ▼
                                                      Provider (local mock | modal cloud)
                                                              │
                                                              ▼
    Frontend ─GET .../jobs/{id}/stream──────────────────  SSE progress + final result

The provider is selected by env var ``CT_AI_PROVIDER``:
    - "mock"  (default): runs a deterministic in-process simulator, no GPU needed.
    - "modal":          POSTs to ``CT_AI_MODAL_URL`` (the Modal-deployed webhook).

Both providers return the same JSON contract (``FractureReport``).
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/ai", tags=["ai"])


# ─── Contract ────────────────────────────────────────────────────────────────
# Mirrors the FractureFinding type on the frontend (ViewScreen.tsx).
class BBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class FractureFinding(BaseModel):
    id: str
    site: str
    type: str
    severity: Literal["high", "medium", "info"]
    confidence: float
    ao: str
    note: str
    keySlicePct: float = Field(ge=0.0, le=1.0)
    bbox: BBox
    teaching: str
    comparePct: float = Field(ge=0.0, le=1.0)
    # Which MPR plane bbox coords are expressed in.
    # axial = top-left panel; coronal = top-right; sagittal = bottom-left.
    keyPlane: Literal["axial", "coronal", "sagittal"] = "axial"


class FractureReport(BaseModel):
    findings: list[FractureFinding]
    summary_advice: str
    model_version: str
    elapsed_ms: int


class AnalyzeRequest(BaseModel):
    series_id: str | None = None
    series_key: str | None = None  # e.g. "thin-bone" for the limbs demo
    body_part: str | None = None


# ─── Job store (in-memory, single process) ───────────────────────────────────
JobStatus = Literal["queued", "running", "done", "error"]


@dataclass
class Job:
    id: str
    status: JobStatus = "queued"
    progress: int = 0
    stage: str = "queued"
    result: FractureReport | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    _event: asyncio.Event = field(default_factory=asyncio.Event)

    def update(self, *, progress: int | None = None, stage: str | None = None,
               status: JobStatus | None = None, result: FractureReport | None = None,
               error: str | None = None) -> None:
        if progress is not None:
            self.progress = progress
        if stage is not None:
            self.stage = stage
        if status is not None:
            self.status = status
        if result is not None:
            self.result = result
        if error is not None:
            self.error = error
        self._event.set()
        self._event.clear()


JOBS: dict[str, Job] = {}


def _drop_expired_jobs(ttl_s: float = 600) -> None:
    cutoff = time.time() - ttl_s
    expired = [jid for jid, job in JOBS.items() if job.created_at < cutoff]
    for jid in expired:
        JOBS.pop(jid, None)


# ─── Providers ───────────────────────────────────────────────────────────────
# A provider produces a FractureReport. The mock provider yields progress along
# the way so the SSE channel feels live.

async def _mock_fracture_provider(job: Job, body_part: str | None) -> FractureReport:
    """Deterministic mock matching the foot/ankle demo on the frontend."""
    stages = [
        (15, "体素重采样"),
        (40, "骨结构分割"),
        (70, "征象定位"),
        (90, "征象摘要生成"),
    ]
    for pct, label in stages:
        job.update(progress=pct, stage=label)
        await asyncio.sleep(0.5)

    # Bbox coordinates derived from rendering the limbs helical series (215
    # slices, 512×512) under bone window and visually locating the talus
    # fracture zone (slices 108-125, peak fragmentation at slice 115). The
    # primary region aligns with the talus area noted in the demo report.
    findings = [
        FractureFinding(
            id="f1",
            site="距骨体",
            type="局部骨皮质连续性略欠规则",
            severity="medium",
            confidence=0.78,
            ao="—",
            note="距骨体矢状面局部骨皮质边缘略不连续，可见细线样低密度影；邻近骨结构未见明显移位或游离骨片。",
            keySlicePct=0.54,
            keyPlane="sagittal",
            bbox=BBox(x=33, y=25, w=22, h=24),
            teaching="红框标在左下角「矢状面」——侧面看距骨皮质连续性较直观。正常骨皮质应呈连续光滑的高密度边缘；红框区域可见局部边缘略不连续及细线样低密度影。AI 仅标注这一影像征象，不判断疾病名称或处置级别。",
            comparePct=0.49,
        ),
        FractureFinding(
            id="f2",
            site="跟骨外侧骨皮质",
            type="骨皮质局部不规则",
            severity="info",
            confidence=0.72,
            ao="—",
            note="跟骨外侧缘骨皮质局部轻度凹凸，未见贯穿性低密度线或明显骨片分离。",
            keySlicePct=0.42,
            bbox=BBox(x=41, y=49, w=17, h=19),
            teaching="红框是跟骨外侧骨皮质：骨缘有轻度起伏，但未见贯穿性低密度线或骨片分离。AI 将其作为低优先级征象提示，供人工复核时对照。",
            comparePct=0.28,
        ),
        FractureFinding(
            id="f3",
            site="前足跖骨基底",
            type="骨结构完整",
            severity="info",
            confidence=0.93,
            ao="—",
            note="前足跖骨基底部横断面，骨皮质连续，骨小梁纹理规则，未见局灶性异常密度影。",
            keySlicePct=0.84,
            bbox=BBox(x=43, y=32, w=14, h=13),
            teaching="红框是跖骨基底横断面。可对照三点：骨皮质一整圈连续光滑、骨小梁纹理整齐、形状对称。AI 将其列为参考对照区域。",
            comparePct=0.47,
        ),
    ]
    advice = (
        "影像征象摘要：距骨体矢状面局部骨皮质连续性略欠规则，可见细线样低密度影；"
        "跟骨外侧缘轻度骨皮质起伏；中足、前足所示骨皮质连续，未见局灶性异常密度影。"
        "以上仅供影像复核参考，不构成诊断结论或处置建议。"
    )
    return FractureReport(
        findings=findings,
        summary_advice=advice,
        model_version="mock-v0.3",
        elapsed_ms=int((time.time() - job.created_at) * 1000),
    )


async def _modal_fracture_provider(job: Job, body_part: str | None) -> FractureReport:
    url = os.environ.get("CT_AI_MODAL_URL")
    if not url:
        raise RuntimeError("CT_AI_MODAL_URL is not set; cannot use modal provider.")
    try:
        import httpx  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("httpx is required for the modal provider") from exc

    job.update(progress=10, stage="提交云端推理任务")
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, json={"body_part": body_part})
        resp.raise_for_status()
        data = resp.json()
    job.update(progress=90, stage="解析推理结果")
    return FractureReport.model_validate(data)


def _select_provider():
    backend = os.environ.get("CT_AI_PROVIDER", "mock").lower()
    if backend == "modal":
        return _modal_fracture_provider
    return _mock_fracture_provider


async def _run_job(job: Job, body_part: str | None) -> None:
    provider = _select_provider()
    try:
        job.update(status="running", progress=5, stage="启动推理")
        report = await provider(job, body_part)
        job.update(progress=100, stage="完成", status="done", result=report)
    except Exception as exc:  # pragma: no cover — surface to client
        job.update(status="error", error=str(exc))


# ─── Endpoints ───────────────────────────────────────────────────────────────
class JobCreated(BaseModel):
    job_id: str


@router.post("/fracture/analyze", response_model=JobCreated)
async def analyze_fracture(payload: AnalyzeRequest) -> JobCreated:
    _drop_expired_jobs()
    job_id = uuid.uuid4().hex
    job = Job(id=job_id)
    JOBS[job_id] = job
    asyncio.create_task(_run_job(job, payload.body_part))
    return JobCreated(job_id=job_id)


def _serialize_job(job: Job) -> dict[str, Any]:
    return {
        "job_id": job.id,
        "status": job.status,
        "progress": job.progress,
        "stage": job.stage,
        "error": job.error,
        "result": job.result.model_dump() if job.result else None,
    }


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _serialize_job(job)


@router.get("/jobs/{job_id}/stream")
async def stream_job(job_id: str) -> StreamingResponse:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    async def gen() -> AsyncIterator[bytes]:
        # First message: current snapshot
        yield _sse_event(_serialize_job(job))
        # Then wait on updates until terminal state
        while job.status in ("queued", "running"):
            try:
                await asyncio.wait_for(job._event.wait(), timeout=15.0)
            except asyncio.TimeoutError:
                # heartbeat to keep the connection alive through proxies
                yield b": ping\n\n"
                continue
            yield _sse_event(_serialize_job(job))
        # Final state already sent above on the last update; emit one more for safety
        yield _sse_event(_serialize_job(job))

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


def _sse_event(data: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")
