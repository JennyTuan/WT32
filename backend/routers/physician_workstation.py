"""Prototype physician-workstation sample APIs."""
from __future__ import annotations

import io
import gzip
import json
import os
import struct
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np
import pydicom
from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..auth_utils import get_current_user
from ..database import get_db
from ..persistent_documents import load_document, save_document

router = APIRouter(prefix="/physician", tags=["physician-workstation"])

# ponytail: the first runnable slice reuses the durable document store for one
# sample/user; replace it with the planned physician_* relational tables before
# multi-study worklists, shared review, or audit queries are introduced.

SAMPLE_KEY = "lidc-idri-0314"
SAMPLE_ROOT = Path(os.environ.get(
    "WT32_PHYSICIAN_SAMPLE_DATA_ROOT",
    r"C:\STN\projects\WT32-data\physician-workstation\lung-nodule",
)).resolve()
AI_ARTIFACT_ROOT = Path(os.environ.get(
    "WT32_PHYSICIAN_AI_ARTIFACT_ROOT",
    str(Path(tempfile.gettempdir()) / "wt32-physician-ai"),
)).resolve()
AI_ARTIFACT_FILES = {
    "lung_lobes": ("dcm", "application/dicom"),
    "lung_nodules": ("dcm", "application/dicom"),
    "lung_lobe_surface": ("ply", "application/octet-stream"),
}
OFFLINE_AI_BUNDLE_VERSION = 1
MAX_OFFLINE_AI_RESULT_BYTES = 200_000_000
LOBE_COLORS = {
    "lung_upper_lobe_left": "#4F9DDE",
    "lung_lower_lobe_left": "#6BCB77",
    "lung_upper_lobe_right": "#F7B267",
    "lung_middle_lobe_right": "#E76F9A",
    "lung_lower_lobe_right": "#9B8AFB",
}
LOBE_LABELS = tuple(LOBE_COLORS)
RAW_TOTALSEG_DELIVERY = "totalsegmentator_nifti_masks"


class ArtifactReviewUpdate(BaseModel):
    status: Literal["pending", "accepted", "rejected", "ignored"]
    note: str = Field(default="", max_length=500)


class ReportDraftUpdate(BaseModel):
    content: str = Field(max_length=10000)


class ReportDraftGenerateRequest(BaseModel):
    content: str = Field(default="", max_length=10000)
    artifact_id: str | None = None


class PhysicianRevisionUpdate(BaseModel):
    source_artifact_id: str
    rows: int = Field(gt=0, le=4096)
    columns: int = Field(gt=0, le=4096)
    spans_by_image_index: dict[str, list[list[int]]] = Field(default_factory=dict)


def _manifest_path() -> Path:
    return SAMPLE_ROOT / "manifests" / f"{SAMPLE_KEY}.json"


def _load_manifest() -> dict[str, Any]:
    path = _manifest_path()
    if not path.is_file():
        raise HTTPException(status_code=503, detail="Physician workstation sample is unavailable")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=503, detail="Physician workstation sample manifest is invalid") from exc
    if value.get("caseKey") != SAMPLE_KEY:
        raise HTTPException(status_code=503, detail="Physician workstation sample manifest does not match the requested study")
    return value


def _sample_path(relative_path: str) -> Path:
    target = (SAMPLE_ROOT / relative_path).resolve()
    try:
        target.relative_to(SAMPLE_ROOT)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Sample file not found") from exc
    if not target.is_file() or target.suffix.lower() not in {".dcm", ".dicom"}:
        raise HTTPException(status_code=404, detail="Sample DICOM file not found")
    return target


def _relative_to_root(path: Path) -> str:
    return path.resolve().relative_to(SAMPLE_ROOT).as_posix()


def _manifest_file(relative_path: str) -> Path:
    target = (_manifest_path().parent / relative_path).resolve()
    try:
        target.relative_to(SAMPLE_ROOT)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Sample file not found") from exc
    if not target.is_file() or target.suffix.lower() not in {".dcm", ".dicom"}:
        raise HTTPException(status_code=404, detail="Sample DICOM file not found")
    return target


def _case_document_key(user_id: int) -> str:
    return f"physician-{user_id}-{SAMPLE_KEY}"


def _state(db: Session, user_id: int) -> dict[str, Any]:
    # ponytail: one durable document is enough for the single supplied study;
    # move runs/artifacts to the planned physician_* tables for multi-study use.
    default = {"reviews": {}, "draft": "", "mock_artifact": None, "ai_runs": {}, "revisions": {}}
    stored = load_document(db, _case_document_key(user_id), default)
    return stored if isinstance(stored, dict) else default


def _artifact_items(manifest: dict[str, Any], state: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for item in manifest["manualReferenceSegmentations"]:
        items.append({"id": item["key"], "kind": "manual_reference", "label": item["label"], "version": "TCIA reference", "review": state["reviews"].get(item["key"], "pending"), "overlay_available": True})
    items.append({"id": "benchmark-candidates", "kind": "external_benchmark_candidate", "label": "9 historical candidate segmentations", "version": "QIN CT challenge", "review": state["reviews"].get("benchmark-candidates", "pending"), "overlay_available": False})
    if state.get("mock_artifact"):
        items.append({**state["mock_artifact"], "review": state["reviews"].get("wt32-mock-v1", "pending"), "overlay_available": False})
    for run_id, run in state.get("ai_runs", {}).items():
        artifact_id = f"ai-{run_id}"
        artifact_paths = run.get("artifact_paths", {}) if isinstance(run.get("artifact_paths", {}), dict) else {}
        items.append({
            "id": artifact_id,
            "kind": "ai_preliminary",
            "label": "AI 初步分割（需医生确认）",
            "version": f"{run.get('provider', 'TotalSegmentator')} · {run.get('model_version', 'lung_nodules')}",
            "review": state["reviews"].get(artifact_id, "pending"),
            "overlay_available": run.get("status") == "succeeded" and Path(str(run.get("artifact_path", ""))).is_file(),
            "lobe_overlay_available": run.get("status") == "succeeded" and Path(str(artifact_paths.get("lung_lobes", ""))).is_file(),
            "surface_available": run.get("status") == "succeeded" and Path(str(artifact_paths.get("lung_lobe_surface", ""))).is_file(),
            "run_status": run.get("status"),
        })
    for revision_id, revision in state.get("revisions", {}).items():
        items.append({
            "id": f"revision-{revision_id}",
            "kind": "physician_revision",
            "label": "医生修订层（独立于 AI 原始结果）",
            "version": f"基于 {revision.get('source_artifact_id', 'reference')}",
            "review": "accepted",
            "overlay_available": True,
        })
    return items


def _pulmonary_ai_base_url() -> str:
    value = os.environ.get("WT32_PULMONARY_AI_SERVICE_URL", "").strip().rstrip("/")
    if not value:
        raise HTTPException(status_code=503, detail="AI 初步分割服务未配置；影像浏览和人工复核仍可继续")
    return value


def _pulmonary_ai_api_key() -> str:
    value = os.environ.get("WT32_PULMONARY_AI_API_KEY", "").strip()
    if not value:
        raise HTTPException(status_code=503, detail="AI 初步分割服务未安全配置；影像浏览和人工复核仍可继续")
    return value


def _dicom_series_archive(directory: Path) -> bytes:
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as payload:
        paths = sorted(directory.glob("*.dcm"))
        if not paths:
            raise HTTPException(status_code=503, detail="Source CT series is unavailable")
        for path in paths:
            payload.writestr(path.name, path.read_bytes())
    return archive.getvalue()


def _multipart_dicom_series(directory: Path, run_id: str) -> tuple[bytes, dict[str, str]]:
    boundary = f"wt32-{uuid.uuid4().hex}"
    body = b"".join((
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="run_id"\r\n\r\n',
        run_id.encode(),
        b"\r\n",
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="series"; filename="series.zip"\r\n',
        b"Content-Type: application/zip\r\n\r\n",
        _dicom_series_archive(directory),
        f"\r\n--{boundary}--\r\n".encode(),
    ))
    return body, {"Content-Type": f"multipart/form-data; boundary={boundary}", "Accept": "application/json"}


def _pulmonary_ai_request(method: str, path: str, *, body: bytes | None = None, headers: dict[str, str] | None = None) -> tuple[int, bytes]:
    request_headers = {"Accept": "application/json", **(headers or {})}
    request_headers["Authorization"] = f"Bearer {_pulmonary_ai_api_key()}"
    request = Request(f"{_pulmonary_ai_base_url()}{path}", data=body, method=method, headers=request_headers)
    try:
        with urlopen(request, timeout=float(os.environ.get("WT32_PULMONARY_AI_TIMEOUT_SECONDS", "20"))) as response:
            return response.status, response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=f"AI 初步分割服务返回异常：{detail}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise HTTPException(status_code=503, detail="AI 初步分割服务当前不可用；影像浏览和人工复核仍可继续") from exc


def _report_provider_configuration() -> tuple[str, str, str]:
    base_url = os.environ.get("WT32_AI_BASE_URL", "").strip().rstrip("/")
    api_key = os.environ.get("WT32_AI_API_KEY", "").strip()
    model = os.environ.get("WT32_AI_MODEL", "deepseek-v4-pro").strip() or "deepseek-v4-pro"
    if not base_url or not api_key:
        raise HTTPException(status_code=503, detail="Report assistant is not configured; the draft remains unchanged")
    versioned_base = base_url if base_url.endswith("/v1") else f"{base_url}/v1"
    return f"{versioned_base}/chat/completions", api_key, model


def _generate_report_draft(*, current_draft: str, artifact: dict[str, Any]) -> tuple[str, str]:
    endpoint, api_key, model = _report_provider_configuration()
    prompt = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 700,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You assist with a research-prototype imaging observation draft. "
                    "Return Simplified Chinese only. This is not a clinical report or diagnostic conclusion. "
                    "Do not infer findings from images, do not add measurements, recommendations, staging, or certainty that were not supplied. "
                    "Keep explicit placeholders where physician review is required."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Create an editable observation draft from the approved de-identified context below. "
                    "The result must start with '【研究原型草稿，需人工确认】' and retain uncertainty.\n\n"
                    f"Selected reference label: {artifact['label']}\n"
                    f"Reference type: {artifact['kind']}\n"
                    f"Reference version: {artifact['version']}\n"
                    f"Human review status: {artifact['review']}\n\n"
                    f"Current physician draft (may be empty):\n{current_draft}"
                ),
            },
        ],
    }
    request = Request(
        endpoint,
        data=json.dumps(prompt, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
    except (HTTPError, URLError, TimeoutError, OSError, KeyError, IndexError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=503, detail="Report assistant is temporarily unavailable; the draft remains unchanged") from exc
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=503, detail="Report assistant returned no editable draft; the draft remains unchanged")
    return content.strip(), model


@lru_cache(maxsize=1)
def _source_instance_indexes() -> dict[str, int]:
    manifest = _load_manifest()
    directory = (_manifest_path().parent / manifest["primarySeries"]["relativeDirectory"]).resolve()
    indexes: dict[str, int] = {}
    for index, path in enumerate(sorted(directory.glob("*.dcm"))):
        dataset = pydicom.dcmread(path, stop_before_pixels=True, specific_tags=["SOPInstanceUID"])
        indexes[str(dataset.SOPInstanceUID)] = index
    return indexes


def _validate_offline_segmentation(payload: bytes, kind: str) -> None:
    try:
        dataset = pydicom.dcmread(io.BytesIO(payload), stop_before_pixels=True)
        if str(getattr(dataset, "Modality", "")) != "SEG":
            raise ValueError("artifact is not DICOM SEG")
        labels = {
            _normalized_label(str(getattr(segment, "SegmentLabel", "")))
            for segment in getattr(dataset, "SegmentSequence", [])
        }
        if kind == "lung_lobes" and labels != set(LOBE_COLORS):
            raise ValueError("lung-lobe labels do not match the verified five-lobe set")
        if kind == "lung_nodules" and not any("nodule" in label for label in labels):
            raise ValueError("nodule segment is missing")
        source_uids = {
            str(frame.DerivationImageSequence[0].SourceImageSequence[0].ReferencedSOPInstanceUID)
            for frame in getattr(dataset, "PerFrameFunctionalGroupsSequence", [])
        }
        if not source_uids or not source_uids.issubset(_source_instance_indexes()):
            raise ValueError("DICOM SEG does not reference the current CT series")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid offline AI artifact: {kind}") from exc


def _offline_result_payloads(payload: bytes) -> tuple[dict[str, Any], dict[str, bytes]]:
    if len(payload) > MAX_OFFLINE_AI_RESULT_BYTES:
        raise HTTPException(status_code=413, detail="Offline AI result exceeds the prototype size limit")
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            members = [item for item in archive.infolist() if not item.is_dir()]
            names = [item.filename for item in members]
            allowed = {
                "job.json",
                *(f"{kind}.{suffix}" for kind, (suffix, _) in AI_ARTIFACT_FILES.items()),
            }
            if len(names) != len(set(names)) or "job.json" not in names or any(name not in allowed for name in names):
                raise ValueError("unexpected or duplicate result file")
            if sum(item.file_size for item in members) > MAX_OFFLINE_AI_RESULT_BYTES:
                raise ValueError("result archive expands beyond the prototype size limit")
            manifest = json.loads(archive.read("job.json").decode("utf-8"))
            declared = manifest.get("artifacts")
            if not isinstance(declared, list):
                raise ValueError("artifact manifest is missing")
            artifacts: dict[str, bytes] = {}
            for item in declared:
                if not isinstance(item, dict):
                    raise ValueError("artifact manifest is invalid")
                kind, filename = str(item.get("kind", "")), str(item.get("filename", ""))
                expected = AI_ARTIFACT_FILES.get(kind)
                if expected is None or filename != f"{kind}.{expected[0]}" or filename not in names or kind in artifacts:
                    raise ValueError("artifact manifest is invalid")
                artifacts[kind] = archive.read(filename)
    except (KeyError, UnicodeDecodeError, json.JSONDecodeError, ValueError, zipfile.BadZipFile) as exc:
        raise HTTPException(status_code=400, detail="Invalid offline AI result package") from exc
    if not {"lung_lobes", "lung_lobe_surface"}.issubset(artifacts):
        raise HTTPException(status_code=400, detail="Offline AI result is missing the five-lobe artifacts")
    for kind in ("lung_lobes", "lung_nodules"):
        if kind in artifacts:
            _validate_offline_segmentation(artifacts[kind], kind)
    if not artifacts["lung_lobe_surface"].startswith(b"ply\nformat binary_little_endian 1.0\n"):
        raise HTTPException(status_code=400, detail="Invalid offline AI lung-lobe surface")
    return manifest, artifacts


def _total_segmentator_member_name(names: list[str], label: str) -> str:
    expected = f"{label}.nii.gz"
    matches = [name for name in names if Path(name).name == expected]
    if len(matches) != 1:
        raise ValueError(f"missing or duplicate {expected}")
    return matches[0]


def _nifti_u8_mask(payload: bytes) -> tuple[np.ndarray, np.ndarray]:
    try:
        data = gzip.decompress(payload)
    except OSError as exc:
        raise ValueError("NIfTI file is not gzip-compressed") from exc
    if len(data) < 352:
        raise ValueError("NIfTI file is too small")
    header_size = struct.unpack("<i", data[:4])[0]
    endian = "<" if header_size == 348 else ">"
    if header_size != 348 and struct.unpack(">i", data[:4])[0] != 348:
        raise ValueError("NIfTI header is invalid")
    dims = struct.unpack(f"{endian}8h", data[40:56])
    if dims[0] != 3 or min(dims[1:4]) <= 1:
        raise ValueError("NIfTI mask must be a 3D volume")
    datatype = struct.unpack(f"{endian}h", data[70:72])[0]
    bitpix = struct.unpack(f"{endian}h", data[72:74])[0]
    if datatype != 2 or bitpix != 8:
        raise ValueError("Only uint8 TotalSegmentator masks are supported")
    vox_offset = int(struct.unpack(f"{endian}f", data[108:112])[0])
    sform_code = struct.unpack(f"{endian}h", data[254:256])[0]
    if sform_code <= 0:
        raise ValueError("NIfTI mask is missing an sform transform")
    transform = np.asarray(
        [
            struct.unpack(f"{endian}4f", data[280:296]),
            struct.unpack(f"{endian}4f", data[296:312]),
            struct.unpack(f"{endian}4f", data[312:328]),
            (0.0, 0.0, 0.0, 1.0),
        ],
        dtype=float,
    )
    count = int(dims[1]) * int(dims[2]) * int(dims[3])
    end = vox_offset + count
    if vox_offset < 352 or end > len(data):
        raise ValueError("NIfTI voxel payload is incomplete")
    mask = np.frombuffer(data, dtype=np.uint8, count=count, offset=vox_offset).reshape(
        (int(dims[1]), int(dims[2]), int(dims[3])),
        order="F",
    )
    return mask.astype(bool), transform


def _write_raw_totalseg_surface(masks: dict[str, tuple[np.ndarray, np.ndarray]]) -> bytes:
    try:
        from scipy import ndimage
        from scipy.spatial import ConvexHull
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="scipy is required to import TotalSegmentator masks") from exc

    vertices: list[np.ndarray] = []
    faces: list[np.ndarray] = []
    face_segments: list[int] = []
    max_points_per_lobe = 12000
    for segment_number, label in enumerate(LOBE_LABELS, start=1):
        mask, transform = masks[label]
        if not mask.any():
            raise ValueError(f"{label} mask is empty")
        eroded = ndimage.binary_erosion(mask, structure=np.ones((3, 3, 3), dtype=bool), border_value=0)
        boundary = mask & ~eroded
        indexes = np.argwhere(boundary)
        if len(indexes) < 4:
            raise ValueError(f"{label} surface is empty")
        if len(indexes) > max_points_per_lobe:
            sample = np.linspace(0, len(indexes) - 1, max_points_per_lobe, dtype=int)
            indexes = indexes[sample]
        homogeneous = np.c_[indexes.astype(float), np.ones(len(indexes))]
        patient_points = (transform @ homogeneous.T).T[:, :3].astype("<f4")
        offset = sum(len(item) for item in vertices)
        hull = ConvexHull(patient_points)
        vertices.append(patient_points)
        local_faces = (hull.simplices + offset).astype(np.int32)
        faces.append(local_faces)
        face_segments.extend([segment_number] * len(local_faces))
    if not vertices or not faces:
        raise ValueError("TotalSegmentator masks did not produce a visible lobe surface")

    merged_vertices = np.concatenate(vertices)
    merged_faces = np.concatenate(faces)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        "comment WT32 prototype-only surface converted from TotalSegmentator NIfTI masks\n"
        f"element vertex {len(merged_vertices)}\n"
        "property float x\nproperty float y\nproperty float z\n"
        f"element face {len(merged_faces)}\n"
        "property list uchar int vertex_indices\nproperty int segment_number\n"
        "end_header\n"
    ).encode("ascii")
    output = io.BytesIO()
    output.write(header)
    output.write(merged_vertices.tobytes())
    for face, segment_number in zip(merged_faces, face_segments, strict=True):
        output.write(struct.pack("<Biiii", 3, *map(int, face), segment_number))
    return output.getvalue()


def _raw_totalseg_result_payloads(payload: bytes) -> tuple[dict[str, Any], dict[str, bytes]]:
    if len(payload) > MAX_OFFLINE_AI_RESULT_BYTES:
        raise HTTPException(status_code=413, detail="TotalSegmentator result exceeds the prototype size limit")
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            members = [item for item in archive.infolist() if not item.is_dir()]
            names = [item.filename for item in members]
            if len(names) != len(set(names)):
                raise ValueError("duplicate files")
            if sum(item.file_size for item in members) > MAX_OFFLINE_AI_RESULT_BYTES:
                raise ValueError("archive expands beyond the prototype size limit")
            masks: dict[str, tuple[np.ndarray, np.ndarray]] = {}
            reference_transform: np.ndarray | None = None
            reference_shape: tuple[int, ...] | None = None
            for label in LOBE_LABELS:
                name = _total_segmentator_member_name(names, label)
                mask, transform = _nifti_u8_mask(archive.read(name))
                if reference_transform is None:
                    reference_transform = transform
                    reference_shape = mask.shape
                elif mask.shape != reference_shape or not np.allclose(transform, reference_transform, atol=1e-3):
                    raise ValueError("lobe masks are not in one NIfTI space")
                masks[label] = (mask, transform)
            surface = _write_raw_totalseg_surface(masks)
    except (KeyError, ValueError, zipfile.BadZipFile) as exc:
        raise HTTPException(status_code=400, detail="Invalid TotalSegmentator NIfTI result package") from exc
    manifest = {
        "format_version": OFFLINE_AI_BUNDLE_VERSION,
        "study_key": SAMPLE_KEY,
        "status": "succeeded",
        "stage": "TotalSegmentator five-lobe NIfTI masks imported; requires physician confirmation",
        "delivery": RAW_TOTALSEG_DELIVERY,
        "provenance": {
            "model_package": "TotalSegmentator",
            "model_profile": "total --fast",
            "artifact_source": "DSW raw NIfTI mask export",
        },
    }
    return manifest, {"lung_lobe_surface": surface}


def _imported_result_payloads(payload: bytes) -> tuple[dict[str, Any], dict[str, bytes]]:
    try:
        return _offline_result_payloads(payload)
    except HTTPException as standard_exc:
        if standard_exc.status_code != 400:
            raise
    return _raw_totalseg_result_payloads(payload)


def _row_spans(mask: np.ndarray) -> list[list[int]]:
    spans: list[list[int]] = []
    for row_index, row in enumerate(mask):
        columns = np.flatnonzero(row)
        if not len(columns):
            continue
        run_start = int(columns[0])
        previous = run_start
        for column in columns[1:]:
            value = int(column)
            if value != previous + 1:
                spans.append([row_index, run_start, previous + 1])
                run_start = value
            previous = value
        spans.append([row_index, run_start, previous + 1])
    return spans


@lru_cache(maxsize=4)
def _manual_segmentation_overlay(artifact_id: str) -> dict[str, Any]:
    manifest = _load_manifest()
    item = next((entry for entry in manifest["manualReferenceSegmentations"] if entry["key"] == artifact_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Spatial overlay is not available for this result")

    dataset = pydicom.dcmread(_manifest_file(item["relativeFile"]))
    pixels = dataset.pixel_array
    source_indexes = _source_instance_indexes()
    spans_by_image_index: dict[str, list[list[int]]] = {}
    for frame_index, functional_groups in enumerate(dataset.PerFrameFunctionalGroupsSequence):
        try:
            source_uid = str(functional_groups.DerivationImageSequence[0].SourceImageSequence[0].ReferencedSOPInstanceUID)
            image_index = source_indexes[source_uid]
        except (AttributeError, IndexError, KeyError) as exc:
            raise HTTPException(status_code=503, detail="Reference segmentation cannot be aligned to the CT series") from exc
        spans_by_image_index[str(image_index)] = _row_spans(np.asarray(pixels[frame_index], dtype=bool))

    return {
        "artifact_id": artifact_id,
        "label": item["label"],
        "source": "TCIA manual reference",
        "rows": int(dataset.Rows),
        "columns": int(dataset.Columns),
        "spans_by_image_index": spans_by_image_index,
    }


def _segmentation_layers(artifact_path: Path) -> list[dict[str, Any]]:
    dataset = pydicom.dcmread(artifact_path)
    pixels = dataset.pixel_array
    source_indexes = _source_instance_indexes()
    labels = {
        int(segment.SegmentNumber): str(segment.SegmentLabel)
        for segment in getattr(dataset, "SegmentSequence", [])
        if getattr(segment, "SegmentNumber", None) is not None
    }
    layers: dict[int, dict[str, Any]] = {}
    for frame_index, functional_groups in enumerate(dataset.PerFrameFunctionalGroupsSequence):
        try:
            source_uid = str(functional_groups.DerivationImageSequence[0].SourceImageSequence[0].ReferencedSOPInstanceUID)
            image_index = source_indexes[source_uid]
            segment_number = int(functional_groups.SegmentIdentificationSequence[0].ReferencedSegmentNumber)
        except (AttributeError, IndexError, KeyError) as exc:
            raise HTTPException(status_code=503, detail="AI 初步分割无法与当前 CT 序列对齐") from exc
        label = labels.get(segment_number, f"segment-{segment_number}")
        layer = layers.setdefault(segment_number, {
            "label": label,
            "color": LOBE_COLORS.get(label, "#36d4c7"),
            "spans_by_image_index": {},
        })
        spans = _row_spans(np.asarray(pixels[frame_index], dtype=bool))
        if spans:
            layer["spans_by_image_index"].setdefault(str(image_index), []).extend(spans)
    if not layers:
        raise HTTPException(status_code=503, detail="AI 初步分割未包含可显示的空间帧")
    return list(layers.values())


def _ai_segmentation_overlay(artifact_id: str, nodule_path: Path, lobe_path: Path | None) -> dict[str, Any]:
    nodule_layers = _segmentation_layers(nodule_path)
    nodule_metadata = pydicom.dcmread(nodule_path, stop_before_pixels=True)
    spans_by_image_index: dict[str, list[list[int]]] = {}
    for layer in nodule_layers:
        for image_index, spans in layer["spans_by_image_index"].items():
            spans_by_image_index.setdefault(image_index, []).extend(spans)
    lobe_layers = _segmentation_layers(lobe_path) if lobe_path and lobe_path.is_file() else []
    return {
        "artifact_id": artifact_id,
        "label": "AI 初步分割（需医生确认）",
        "source": "TotalSegmentator lung_nodules",
        "rows": int(nodule_metadata.Rows),
        "columns": int(nodule_metadata.Columns),
        "spans_by_image_index": spans_by_image_index,
        "lobe_layers": lobe_layers,
    }


def _physician_revision_overlay(artifact_id: str, revision: dict[str, Any]) -> dict[str, Any]:
    return {
        "artifact_id": artifact_id,
        "label": "医生修订层（独立于 AI 原始结果）",
        "source": "Physician revision",
        "rows": int(revision["rows"]),
        "columns": int(revision["columns"]),
        "spans_by_image_index": revision.get("spans_by_image_index", {}),
    }


@router.get("/worklist")
def worklist() -> dict[str, Any]:
    manifest = _load_manifest()
    return {"items": [{
        "study_key": SAMPLE_KEY,
        "patient_pseudonym": manifest["source"]["patientPseudonym"],
        "body_part": manifest["study"]["bodyPart"],
        "series_count": 1,
        "recommended_applications": ["pulmonary_nodule", "general_review"],
        "status": "reference sample",
    }]}


@router.get("/studies/{study_key}")
def study_detail(study_key: str, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> dict[str, Any]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    manifest = _load_manifest()
    primary = manifest["primarySeries"]
    directory = (_manifest_path().parent / primary["relativeDirectory"]).resolve()
    if not directory.is_dir():
        raise HTTPException(status_code=503, detail="Source CT series is unavailable")
    image_urls = [f"/api/physician/dicom/{_relative_to_root(path)}" for path in sorted(directory.glob("*.dcm"))]
    state = _state(db, user.id)
    return {
        "study_key": SAMPLE_KEY,
        "patient_pseudonym": manifest["source"]["patientPseudonym"],
        "body_part": manifest["study"]["bodyPart"],
        "application": "pulmonary_nodule",
        "series": {"id": "source-ct", "label": "Chest CT · 1 mm", "image_urls": image_urls, "instance_count": len(image_urls)},
        "artifacts": _artifact_items(manifest, state),
        "report_draft": state.get("draft", ""),
        "report_assistance": state.get("report_assistance"),
    }


@router.get("/studies/{study_key}/artifacts/{artifact_id}/overlay")
def artifact_overlay(study_key: str, artifact_id: str, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> dict[str, Any]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    if artifact_id.startswith("ai-"):
        run = _state(db, user.id).get("ai_runs", {}).get(artifact_id.removeprefix("ai-"))
        paths = run.get("artifact_paths", {}) if isinstance(run, dict) and isinstance(run.get("artifact_paths", {}), dict) else {}
        nodule_path = Path(str(paths.get("lung_nodules") or run.get("artifact_path", ""))) if isinstance(run, dict) else None
        lobe_path = Path(str(paths.get("lung_lobes", ""))) if paths else None
        if not run or run.get("status") != "succeeded" or not nodule_path or not nodule_path.is_file():
            raise HTTPException(status_code=409, detail="AI 初步分割尚未准备好")
        return _ai_segmentation_overlay(artifact_id, nodule_path, lobe_path)
    if artifact_id.startswith("revision-"):
        revision = _state(db, user.id).get("revisions", {}).get(artifact_id.removeprefix("revision-"))
        if not isinstance(revision, dict):
            raise HTTPException(status_code=404, detail="Physician revision not found")
        return _physician_revision_overlay(artifact_id, revision)
    return _manual_segmentation_overlay(artifact_id)


@router.get("/studies/{study_key}/artifacts/{artifact_id}/surface")
def artifact_surface(study_key: str, artifact_id: str, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> FileResponse:
    if study_key != SAMPLE_KEY or not artifact_id.startswith("ai-"):
        raise HTTPException(status_code=404, detail="Lung-lobe surface is not available for this result")
    run = _state(db, user.id).get("ai_runs", {}).get(artifact_id.removeprefix("ai-"))
    paths = run.get("artifact_paths", {}) if isinstance(run, dict) and isinstance(run.get("artifact_paths", {}), dict) else {}
    path = Path(str(paths.get("lung_lobe_surface", ""))) if paths else None
    if not run or run.get("status") != "succeeded" or not path or not path.is_file():
        raise HTTPException(status_code=409, detail="AI 肺叶三维表面尚未准备好")
    return FileResponse(path, media_type="application/octet-stream", filename="ai-five-lobe-surface.ply")


@router.get("/dicom/{relative_path:path}")
def sample_dicom(relative_path: str) -> FileResponse:
    return FileResponse(_sample_path(relative_path), media_type="application/dicom")


@router.post("/studies/{study_key}/mock-segmentation")
def create_mock_segmentation(study_key: str, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> dict[str, Any]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    state = _state(db, user.id)
    state["mock_artifact"] = {"id": "wt32-mock-v1", "kind": "wt32_mock", "label": "WT32 segmentation simulation", "version": "mock-v1 · reference only"}
    save_document(db, _case_document_key(user.id), state)
    db.commit()
    return state["mock_artifact"]


@router.post("/studies/{study_key}/ai-runs", status_code=202)
def create_ai_run(study_key: str, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> dict[str, str]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    manifest = _load_manifest()
    directory = (_manifest_path().parent / manifest["primarySeries"]["relativeDirectory"]).resolve()
    if not directory.is_dir():
        raise HTTPException(status_code=503, detail="Source CT series is unavailable")
    run_id = uuid.uuid4().hex
    body, headers = _multipart_dicom_series(directory, run_id)
    _, payload = _pulmonary_ai_request("POST", "/api/v1/pulmonary-nodule/jobs", body=body, headers=headers)
    try:
        upstream = json.loads(payload.decode("utf-8"))
        provider_job_id = str(upstream["job_id"])
    except (UnicodeDecodeError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=503, detail="AI 初步分割服务返回无效任务") from exc
    state = _state(db, user.id)
    state.setdefault("ai_runs", {})[run_id] = {
        "provider": "TotalSegmentator",
        "model_version": "TotalSegmentator service profile",
        "provider_job_id": provider_job_id,
        "status": "queued",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_series_uid": manifest["primarySeries"].get("seriesInstanceUid"),
    }
    save_document(db, _case_document_key(user.id), state)
    db.commit()
    return {"run_id": run_id, "status": "queued"}


@router.post("/studies/{study_key}/ai-offline-jobs")
def export_offline_ai_job(
    study_key: str,
    db: Session = Depends(get_db),
    user: models.UserAccount = Depends(get_current_user),
) -> Response:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    manifest = _load_manifest()
    primary = manifest["primarySeries"]
    directory = (_manifest_path().parent / primary["relativeDirectory"]).resolve()
    if not directory.is_dir():
        raise HTTPException(status_code=503, detail="Source CT series is unavailable")
    run_id = uuid.uuid4().hex
    job = {
        "format_version": OFFLINE_AI_BUNDLE_VERSION,
        "study_key": SAMPLE_KEY,
        "run_id": run_id,
        "source_series_uid": primary.get("seriesInstanceUid"),
        "run_nodules": False,
        "prototype_only": True,
        "requires_confirmation": True,
    }
    bundle = io.BytesIO()
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("job.json", json.dumps(job, ensure_ascii=False, indent=2))
        archive.writestr("series.zip", _dicom_series_archive(directory))
    state = _state(db, user.id)
    state.setdefault("ai_runs", {})[run_id] = {
        "provider": "TotalSegmentator",
        "model_version": "DSW offline package",
        "provider_job_id": run_id,
        "status": "awaiting_offline_result",
        "stage": "DSW task package exported; waiting for result import",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_series_uid": primary.get("seriesInstanceUid"),
        "delivery": "offline_bundle",
    }
    save_document(db, _case_document_key(user.id), state)
    db.commit()
    filename = f"wt32-{SAMPLE_KEY}-{run_id}-dsw-job.zip"
    return Response(
        content=bundle.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/studies/{study_key}/ai-offline-results")
async def import_offline_ai_result(
    study_key: str,
    request: FastAPIRequest,
    db: Session = Depends(get_db),
    user: models.UserAccount = Depends(get_current_user),
) -> dict[str, str]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    if request.headers.get("content-type", "").split(";", 1)[0].strip() not in {
        "application/zip", "application/octet-stream",
    }:
        raise HTTPException(status_code=400, detail="A zipped offline AI result is required")
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_OFFLINE_AI_RESULT_BYTES:
            raise HTTPException(status_code=413, detail="Offline AI result exceeds the prototype size limit")
        chunks.append(chunk)
    payload = b"".join(chunks)
    result, artifacts = _imported_result_payloads(payload)
    run_id = str(result.get("run_id", ""))
    state = _state(db, user.id)
    run: dict[str, Any]
    raw_totalseg_import = result.get("delivery") == RAW_TOTALSEG_DELIVERY
    if raw_totalseg_import:
        run_id = uuid.uuid4().hex
        manifest = _load_manifest()
        run = {
            "provider": "TotalSegmentator",
            "model_version": "TotalSegmentator total --fast NIfTI import",
            "provider_job_id": run_id,
            "status": "importing",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source_series_uid": manifest["primarySeries"].get("seriesInstanceUid"),
            "delivery": RAW_TOTALSEG_DELIVERY,
        }
        state.setdefault("ai_runs", {})[run_id] = run
    else:
        try:
            uuid.UUID(hex=run_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid offline AI run ID") from exc
        run = state.get("ai_runs", {}).get(run_id)
        if not isinstance(run, dict) or run.get("delivery") != "offline_bundle":
            raise HTTPException(status_code=404, detail="Offline AI run not found")
        expected_series_uid = run.get("source_series_uid")
        if (
            result.get("format_version") != OFFLINE_AI_BUNDLE_VERSION
            or result.get("study_key") != SAMPLE_KEY
            or result.get("run_id") != run_id
            or result.get("source_series_uid") != expected_series_uid
            or result.get("status") != "succeeded"
        ):
            raise HTTPException(status_code=400, detail="Offline AI result does not match this exported task")

    AI_ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    written: dict[str, str] = {}
    staged: list[tuple[str, Path, Path]] = []
    moved: list[Path] = []
    try:
        for kind, artifact in artifacts.items():
            suffix, _ = AI_ARTIFACT_FILES[kind]
            destination = AI_ARTIFACT_ROOT / f"{user.id}-{run_id}-{kind}.{suffix}"
            staging = destination.with_suffix(f".{suffix}.tmp")
            staging.write_bytes(artifact)
            staged.append((kind, staging, destination))
        for kind, staging, destination in staged:
            staging.replace(destination)
            moved.append(destination)
            written[kind] = str(destination)
    except OSError as exc:
        for _, path, _ in staged:
            path.unlink(missing_ok=True)
        for path in moved:
            path.unlink(missing_ok=True)
        raise HTTPException(status_code=503, detail="Offline AI result could not be stored") from exc

    provenance = result.get("provenance") if isinstance(result.get("provenance"), dict) else {}
    run.update({
        "status": "succeeded",
        "stage": str(result.get("stage") or "Offline five-lobe result imported; requires confirmation"),
        "error": None,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "artifact_paths": written,
        "provenance": provenance,
        "model_version": str(provenance.get("model_package_version") or "TotalSegmentator DSW offline"),
    })
    if written.get("lung_nodules"):
        run["artifact_path"] = written["lung_nodules"]
    save_document(db, _case_document_key(user.id), state)
    db.commit()
    return {"run_id": run_id, "status": "succeeded", "artifact_id": f"ai-{run_id}"}


def _download_ai_artifacts(*, run: dict[str, Any], user_id: int, run_id: str, artifact_kinds: set[str]) -> None:
    AI_ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    paths = run.setdefault("artifact_paths", {})
    if not isinstance(paths, dict):
        raise HTTPException(status_code=503, detail="AI 初步分割产物记录无效")
    for kind, (suffix, _) in AI_ARTIFACT_FILES.items():
        if kind not in artifact_kinds:
            continue
        existing = Path(str(paths.get(kind, ""))) if paths.get(kind) else None
        if existing and existing.is_file():
            continue
        _, artifact = _pulmonary_ai_request("GET", f"/api/v1/pulmonary-nodule/jobs/{run['provider_job_id']}/artifacts/{kind}")
        artifact_path = AI_ARTIFACT_ROOT / f"{user_id}-{run_id}-{kind}.{suffix}"
        artifact_path.write_bytes(artifact)
        paths[kind] = str(artifact_path)
    # ponytail: existing physician revision code expects one AI DICOM SEG path;
    # lobe-only verification intentionally has no editable nodule source.
    if paths.get("lung_nodules"):
        run["artifact_path"] = paths["lung_nodules"]


@router.get("/studies/{study_key}/ai-runs/{run_id}")
def get_ai_run(study_key: str, run_id: str, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> dict[str, str | None]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    state = _state(db, user.id)
    run = state.get("ai_runs", {}).get(run_id)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="AI inference run not found")
    _, payload = _pulmonary_ai_request("GET", f"/api/v1/pulmonary-nodule/jobs/{run['provider_job_id']}")
    try:
        upstream = json.loads(payload.decode("utf-8"))
        run["status"] = str(upstream["status"])
        run["stage"] = str(upstream.get("stage", ""))
        run["error"] = upstream.get("error")
    except (UnicodeDecodeError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=503, detail="AI 初步分割服务返回无效状态") from exc
    if run["status"] == "succeeded":
        artifact_kinds = {
            str(item.get("kind")) for item in upstream.get("artifacts", [])
            if isinstance(item, dict) and str(item.get("kind")) in AI_ARTIFACT_FILES
        }
        _download_ai_artifacts(run=run, user_id=user.id, run_id=run_id, artifact_kinds=artifact_kinds)
    save_document(db, _case_document_key(user.id), state)
    db.commit()
    return {"run_id": run_id, "status": run["status"], "stage": run.get("stage"), "error": run.get("error")}


@router.put("/studies/{study_key}/physician-revisions/{revision_id}")
def save_physician_revision(study_key: str, revision_id: str, payload: PhysicianRevisionUpdate, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> dict[str, str]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    if not revision_id.isalnum() or len(revision_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid physician revision id")
    state = _state(db, user.id)
    source_ids = {item["id"] for item in _artifact_items(_load_manifest(), state)}
    if payload.source_artifact_id not in source_ids:
        raise HTTPException(status_code=400, detail="Revision source artifact not found")
    # 修订层只保存医生勾画，绝不改写 AI DICOM SEG 或人工参考数据。
    state.setdefault("revisions", {})[revision_id] = payload.model_dump()
    save_document(db, _case_document_key(user.id), state)
    db.commit()
    return {"artifact_id": f"revision-{revision_id}", "status": "saved"}


@router.patch("/studies/{study_key}/artifacts/{artifact_id}/review")
def update_artifact_review(study_key: str, artifact_id: str, payload: ArtifactReviewUpdate, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> dict[str, str]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    state = _state(db, user.id)
    state.setdefault("reviews", {})[artifact_id] = payload.status
    save_document(db, _case_document_key(user.id), state)
    db.commit()
    return {"artifact_id": artifact_id, "status": payload.status}


@router.put("/studies/{study_key}/report-draft")
def update_report_draft(study_key: str, payload: ReportDraftUpdate, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> dict[str, str]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    state = _state(db, user.id)
    state["draft"] = payload.content
    save_document(db, _case_document_key(user.id), state)
    db.commit()
    return {"content": state["draft"]}


@router.post("/studies/{study_key}/report-draft/generate")
def generate_report_draft(study_key: str, payload: ReportDraftGenerateRequest, db: Session = Depends(get_db), user: models.UserAccount = Depends(get_current_user)) -> dict[str, str]:
    if study_key != SAMPLE_KEY:
        raise HTTPException(status_code=404, detail="Physician study not found")
    state = _state(db, user.id)
    artifacts = _artifact_items(_load_manifest(), state)
    artifact = next((item for item in artifacts if item["id"] == (payload.artifact_id or "")), None)
    if artifact is None:
        raise HTTPException(status_code=400, detail="Select a reference result before generating a draft")

    content, model = _generate_report_draft(current_draft=payload.content, artifact=artifact)
    state["report_assistance"] = {
        "provider": "OmniKey",
        "model": model,
        "artifact_id": artifact["id"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    save_document(db, _case_document_key(user.id), state)
    return {"content": content, "provider": "OmniKey", "model": model}
