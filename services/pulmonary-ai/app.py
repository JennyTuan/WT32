"""Internal, GPU-hosted pulmonary-nodule inference service for the WT32 prototype."""
from __future__ import annotations

import asyncio
import copy
import hmac
import io
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version as package_version
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydicom.errors import InvalidDicomError

app = FastAPI(title="WT32 Pulmonary AI", version="0.1.0")
bearer_scheme = HTTPBearer(auto_error=False)

MAX_ARCHIVE_BYTES = 1_000_000_000
MAX_ARCHIVE_MEMBERS = 10_000
MAX_EXTRACTED_BYTES = 2_000_000_000
# A bounded subprocess can be terminated cleanly; asyncio worker threads cannot.
# First-run model downloads can be slow on DSW; keep a bounded, but usable, ceiling.
INFERENCE_TIMEOUT_SECONDS = 6 * 60 * 60
DATA_DIR = Path(os.environ.get("PULMONARY_AI_DATA_DIR", "/var/lib/pulmonary-ai")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
TOTAL_SEGMENTATOR_HOME = Path(os.environ.get("TOTALSEG_HOME_DIR", str(DATA_DIR / ".totalsegmentator"))).resolve()
TOTAL_SEGMENTATOR_HOME.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("TOTALSEG_HOME_DIR", str(TOTAL_SEGMENTATOR_HOME))
ArtifactKind = Literal["lung_lobes", "lung_nodules", "lung_lobe_surface"]

LOBE_LABELS = (
    "lung_upper_lobe_left",
    "lung_lower_lobe_left",
    "lung_upper_lobe_right",
    "lung_middle_lobe_right",
    "lung_lower_lobe_right",
)
LOBE_COLORS = {
    "lung_upper_lobe_left": "#4F9DDE",
    "lung_lower_lobe_left": "#6BCB77",
    "lung_upper_lobe_right": "#F7B267",
    "lung_middle_lobe_right": "#E76F9A",
    "lung_lower_lobe_right": "#9B8AFB",
}


@dataclass(frozen=True)
class Artifact:
    """A generated artifact that is safe to expose through the authenticated service API."""

    kind: ArtifactKind
    path: Path
    role: str
    format: str
    media_type: str
    segment_labels: tuple[str, ...] = ()
    segment_numbers: tuple[int, ...] = ()


@dataclass
class Run:
    id: str
    status: Literal["queued", "running", "succeeded", "failed"] = "queued"
    stage: str = "queued"
    error: str | None = None
    artifacts: dict[ArtifactKind, Artifact] = field(default_factory=dict)
    provenance: dict[str, str] = field(default_factory=dict)
    submitted_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None


RUNS: dict[str, Run] = {}


def _inference_enabled() -> bool:
    """Require an intentional deployment-time opt-in before using a GPU."""
    return os.environ.get("PULMONARY_AI_ENABLE_INFERENCE", "0") == "1"


def _nodule_inference_enabled() -> bool:
    """Keep separately licensed nodule inference behind its own explicit opt-in."""
    return _inference_enabled() and os.environ.get("PULMONARY_AI_RUN_NODULES", "0") == "1"


def _configured_api_key() -> str:
    return os.environ.get("PULMONARY_AI_API_KEY", "")


@app.on_event("startup")
def validate_startup_configuration() -> None:
    if not _configured_api_key():
        raise RuntimeError("PULMONARY_AI_API_KEY must be configured before starting pulmonary-ai")


def require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> None:
    configured_key = _configured_api_key()
    if credentials is None or not hmac.compare_digest(credentials.credentials, configured_key):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing pulmonary-AI bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _extract_dicom_archive(payload: bytes, destination: Path) -> None:
    destination = destination.resolve()
    if len(payload) > MAX_ARCHIVE_BYTES:
        raise HTTPException(status_code=413, detail="DICOM archive exceeds the prototype size limit")
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ARCHIVE_MEMBERS:
                raise ValueError("archive contains too many files")
            members = [member for member in entries if not member.is_dir()]
            if not members:
                raise ValueError("archive is empty")
            if sum(member.file_size for member in members) > MAX_EXTRACTED_BYTES:
                raise ValueError("archive expands beyond the prototype size limit")
            targets: list[tuple[zipfile.ZipInfo, Path]] = []
            for member in members:
                target = (destination / member.filename).resolve()
                if destination not in target.parents or target.suffix.lower() not in {".dcm", ".dicom"}:
                    raise ValueError("archive contains an invalid file")
                targets.append((member, target))
            if len({target for _, target in targets}) != len(targets):
                raise ValueError("archive contains duplicate files")
            for member, target in targets:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)

        import pydicom

        series_instance_uid: str | None = None
        for path in destination.rglob("*"):
            if not path.is_file():
                continue
            dataset = pydicom.dcmread(path, stop_before_pixels=True)
            if str(getattr(dataset, "Modality", "")) != "CT":
                raise ValueError("archive contains a non-CT DICOM instance")
            if not str(getattr(dataset, "SOPInstanceUID", "")):
                raise ValueError("DICOM instance has no SOPInstanceUID")
            instance_series_uid = str(getattr(dataset, "SeriesInstanceUID", ""))
            if not instance_series_uid:
                raise ValueError("DICOM instance has no SeriesInstanceUID")
            if series_instance_uid is None:
                series_instance_uid = instance_series_uid
            elif instance_series_uid != series_instance_uid:
                raise ValueError("archive contains multiple DICOM series")
    except (InvalidDicomError, OSError, ValueError, zipfile.BadZipFile) as exc:
        raise HTTPException(status_code=400, detail="Invalid DICOM archive") from exc


def _segmentation_segments(path: Path) -> tuple[tuple[int, str], ...]:
    """Read only DICOM SEG metadata; pixel data is never loaded for job metadata."""
    try:
        import pydicom

        dataset = pydicom.dcmread(path, stop_before_pixels=True)
        return tuple(
            (int(getattr(segment, "SegmentNumber")), label)
            for segment in getattr(dataset, "SegmentSequence", [])
            if (label := str(getattr(segment, "SegmentLabel", "")).strip())
        )
    except Exception:
        return ()


def _normalized_label(label: str) -> str:
    return label.strip().lower().replace("-", "_").replace(" ", "_")


def _verified_lobe_segments(segments: tuple[tuple[int, str], ...]) -> tuple[tuple[int, str], ...]:
    """Accept only the explicit TotalSegmentator five-lobe output."""
    by_label = {_normalized_label(label): (number, label) for number, label in segments}
    if len(by_label) != len(segments) or set(by_label) != set(LOBE_LABELS):
        raise RuntimeError("Lung-lobe task did not produce the verified five-lobe label set")
    return tuple(by_label[label] for label in LOBE_LABELS)


def _nodule_segments(segments: tuple[tuple[int, str], ...]) -> tuple[tuple[int, str], ...]:
    selected = tuple((number, label) for number, label in segments if "nodule" in _normalized_label(label))
    if not selected:
        raise RuntimeError("Lung-nodule task did not produce a nodule segment")
    return selected


def _split_binary_segmentation(source: Path, destination: Path, segment_numbers: tuple[int, ...]) -> None:
    """Create a standalone SEG while retaining TotalSegmentator's source references."""
    import numpy as np
    import pydicom
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid
    from pydicom.pixels.utils import pack_bits

    dataset = pydicom.dcmread(source)
    if str(getattr(dataset, "SegmentationType", "")) != "BINARY":
        # ponytail: TotalSegmentator currently emits BINARY SEG; use highdicom reconstruction if LABELMAP support is needed.
        raise RuntimeError("Only BINARY DICOM SEG can be separated into artifact layers")
    frame_indices = [
        index
        for index, group in enumerate(dataset.PerFrameFunctionalGroupsSequence)
        if int(group.SegmentIdentificationSequence[0].ReferencedSegmentNumber) in segment_numbers
    ]
    if not frame_indices:
        raise RuntimeError("DICOM SEG has no frames for the expected artifact segment")
    pixels = np.asarray(dataset.pixel_array)
    if pixels.ndim == 2:
        pixels = pixels[np.newaxis, ...]
    pixels = pixels[frame_indices]
    derived = copy.deepcopy(dataset)
    derived.SegmentSequence = pydicom.sequence.Sequence(
        [segment for segment in derived.SegmentSequence if int(segment.SegmentNumber) in segment_numbers]
    )
    derived.PerFrameFunctionalGroupsSequence = pydicom.sequence.Sequence(
        [derived.PerFrameFunctionalGroupsSequence[index] for index in frame_indices]
    )
    derived.NumberOfFrames = len(frame_indices)
    derived.PixelData = pack_bits(pixels.astype(np.uint8).ravel())
    derived.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    derived.SOPInstanceUID = generate_uid()
    derived.file_meta.MediaStorageSOPInstanceUID = derived.SOPInstanceUID
    destination.parent.mkdir(parents=True, exist_ok=True)
    derived.save_as(destination, enforce_file_format=True)


def _nodule_artifact(source: Path, output_dir: Path) -> Artifact:
    segments = _nodule_segments(_segmentation_segments(source))
    destination = output_dir / "lung_nodules.dcm"
    selected_numbers = tuple(number for number, _ in segments)
    _split_binary_segmentation(source, destination, selected_numbers)
    return Artifact(
        kind="lung_nodules",
        path=destination,
        role="nodule_overlay",
        format="DICOM SEG",
        media_type="application/dicom",
        segment_labels=tuple(label for _, label in segments),
        segment_numbers=selected_numbers,
    )


def _artifact_metadata(artifact: Artifact) -> dict[str, object]:
    metadata: dict[str, object] = {
        "id": artifact.kind,
        "kind": artifact.kind,
        "role": artifact.role,
        "format": artifact.format,
        "media_type": artifact.media_type,
        "filename": artifact.path.name,
        "segment_labels": list(artifact.segment_labels),
        "segment_numbers": list(artifact.segment_numbers),
    }
    if artifact.kind == "lung_lobe_surface":
        metadata.update(
            {
                "coordinate_system": "DICOM patient LPS",
                "units": "mm",
                "face_segment_number_property": "segment_number",
                "segment_colors": {
                    label: LOBE_COLORS[_normalized_label(label)] for label in artifact.segment_labels
                },
            }
        )
    return metadata


def _sequence_item(dataset: object, name: str, shared: object) -> object:
    sequence = getattr(dataset, name, None) or getattr(shared, name, None)
    if not sequence:
        raise RuntimeError(f"Lung-lobe SEG is missing {name}")
    return sequence[0]


def _write_lobe_surface(source: Path, destination: Path, segments: tuple[tuple[int, str], ...]) -> None:
    """Create one labelled PLY surface in DICOM patient LPS millimetres from the verified lobe SEG."""
    import numpy as np
    import pydicom
    from skimage.measure import marching_cubes

    dataset = pydicom.dcmread(source)
    pixels = np.asarray(dataset.pixel_array)
    if pixels.ndim == 2:
        pixels = pixels[np.newaxis, ...]
    frames = getattr(dataset, "PerFrameFunctionalGroupsSequence", ())
    shared = getattr(dataset, "SharedFunctionalGroupsSequence", (None,))[0]
    if len(frames) != len(pixels) or shared is None:
        raise RuntimeError("Lung-lobe SEG frame geometry is unavailable")

    frame_records: list[tuple[int, np.ndarray, np.ndarray]] = []
    orientation: np.ndarray | None = None
    row_spacing = column_spacing = slice_spacing = None
    for index, frame in enumerate(frames):
        segment_number = int(_sequence_item(frame, "SegmentIdentificationSequence", shared).ReferencedSegmentNumber)
        if segment_number not in {number for number, _ in segments}:
            continue
        position = np.asarray(
            _sequence_item(frame, "PlanePositionSequence", shared).ImagePositionPatient,
            dtype=float,
        )
        current_orientation = np.asarray(
            _sequence_item(frame, "PlaneOrientationSequence", shared).ImageOrientationPatient,
            dtype=float,
        )
        pixel_measures = _sequence_item(frame, "PixelMeasuresSequence", shared)
        current_row_spacing, current_column_spacing = map(float, pixel_measures.PixelSpacing)
        current_slice_spacing = float(
            getattr(pixel_measures, "SpacingBetweenSlices", getattr(pixel_measures, "SliceThickness", 0))
        )
        if current_slice_spacing <= 0:
            raise RuntimeError("Lung-lobe SEG has invalid slice spacing")
        if orientation is None:
            orientation = current_orientation
            row_spacing, column_spacing, slice_spacing = (
                current_row_spacing,
                current_column_spacing,
                current_slice_spacing,
            )
        elif not (
            np.allclose(orientation, current_orientation)
            and np.isclose(row_spacing, current_row_spacing)
            and np.isclose(column_spacing, current_column_spacing)
            and np.isclose(slice_spacing, current_slice_spacing)
        ):
            raise RuntimeError("Lung-lobe SEG has inconsistent frame geometry")
        frame_records.append((segment_number, position, pixels[index].astype(bool)))
    if orientation is None or not frame_records:
        raise RuntimeError("Lung-lobe SEG has no lobe mask frames")

    column_direction, row_direction = orientation[:3], orientation[3:]
    normal = np.cross(column_direction, row_direction)
    if np.linalg.norm(normal) == 0:
        raise RuntimeError("Lung-lobe SEG has invalid orientation")
    normal = normal / np.linalg.norm(normal)
    positions = sorted({round(float(np.dot(position, normal)), 4) for _, position, _ in frame_records})
    if len(positions) < 2:
        raise RuntimeError("Lung-lobe SEG has insufficient slices for surface conversion")
    origin_coordinate = positions[0]
    slice_count = round((positions[-1] - origin_coordinate) / slice_spacing) + 1
    if slice_count < 2 or slice_count > len(positions) * 2:
        raise RuntimeError("Lung-lobe SEG has unsupported slice spacing for surface conversion")
    origin = min((position for _, position, _ in frame_records), key=lambda value: float(np.dot(value, normal)))
    shape = (slice_count, pixels.shape[-2], pixels.shape[-1])
    vertices: list[np.ndarray] = []
    faces: list[np.ndarray] = []
    face_segments: list[int] = []
    for segment_number, _ in segments:
        volume = np.zeros(shape, dtype=bool)
        for current_number, position, frame_pixels in frame_records:
            if current_number != segment_number:
                continue
            slice_index = round((float(np.dot(position, normal)) - origin_coordinate) / slice_spacing)
            if not 0 <= slice_index < slice_count:
                raise RuntimeError("Lung-lobe SEG frame is outside its surface grid")
            volume[slice_index] |= frame_pixels
        if not volume.any():
            raise RuntimeError("Lung-lobe SEG has an empty expected lobe")
        mesh_vertices, mesh_faces, _, _ = marching_cubes(
            np.pad(volume, 1), level=0.5, spacing=(slice_spacing, row_spacing, column_spacing)
        )
        mesh_vertices -= np.asarray((slice_spacing, row_spacing, column_spacing))
        patient_vertices = (
            origin
            + mesh_vertices[:, 0:1] * normal
            + mesh_vertices[:, 1:2] * row_direction
            + mesh_vertices[:, 2:3] * column_direction
        )
        vertex_offset = sum(len(item) for item in vertices)
        vertices.append(patient_vertices.astype("<f4"))
        faces.append((mesh_faces + vertex_offset).astype("<i4"))
        face_segments.extend([segment_number] * len(mesh_faces))
    if not faces:
        raise RuntimeError("Lung-lobe surface conversion produced no faces")

    merged_vertices = np.concatenate(vertices)
    merged_faces = np.concatenate(faces)
    destination.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        "comment WT32 prototype-only five-lobe surface in DICOM patient LPS millimetres\n"
        f"element vertex {len(merged_vertices)}\n"
        "property float x\nproperty float y\nproperty float z\n"
        f"element face {len(merged_faces)}\n"
        "property list uchar int vertex_indices\nproperty int segment_number\n"
        "end_header\n"
    ).encode("ascii")
    with destination.open("wb") as output:
        output.write(header)
        output.write(merged_vertices.tobytes())
        for face, segment_number in zip(merged_faces, face_segments, strict=True):
            output.write(struct.pack("<Biiii", 3, *map(int, face), segment_number))


def _job_status(run: Run) -> dict[str, object]:
    return {
        "job_id": run.id,
        "status": run.status,
        "stage": run.stage,
        "error": run.error,
        "submitted_at": run.submitted_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "provenance": run.provenance,
        "artifacts": [_artifact_metadata(artifact) for artifact in run.artifacts.values()],
    }


def _run_total_segmentator(
    input_dir: Path,
    output_path: Path,
    *,
    task: str,
    roi_subset: tuple[str, ...] = (),
) -> None:
    """Run the installed CLI so its weight-download progress reaches the DSW terminal."""
    command = [
        str(Path(sys.executable).with_name("TotalSegmentator")),
        "-i",
        str(input_dir),
        "-o",
        str(output_path),
        "--task",
        task,
        "--output_type",
        "dicom_seg",
        "--device",
        "gpu",
    ]
    if roi_subset:
        command.extend(("--roi_subset", *roi_subset))
    subprocess.run(command, check=True, timeout=INFERENCE_TIMEOUT_SECONDS)


async def _run(run: Run, input_dir: Path, output_dir: Path) -> None:
    run.status, run.stage = "running", "preparing TotalSegmentator model and lung-lobe segmentation"
    try:
        try:
            total_segmentator_version = package_version("TotalSegmentator")
        except PackageNotFoundError:
            total_segmentator_version = "unknown"
        run.provenance = {
            "service": "WT32 pulmonary-ai",
            "service_version": app.version,
            "model_package": "TotalSegmentator",
            "model_package_version": total_segmentator_version,
            "tasks": "total (five lung lobes)" + (", lung_nodules" if _nodule_inference_enabled() else ""),
            "device": "gpu",
            "source_geometry": "DICOM SEG references the submitted CT series",
        }

        lobe_path = output_dir / "lung_lobes.dcm"
        # TotalSegmentator retains the source DICOM geometry when creating DICOM SEG.
        await asyncio.to_thread(
            _run_total_segmentator,
            input_dir,
            lobe_path,
            task="total",
            roi_subset=LOBE_LABELS,
        )
        lobe_segments = _verified_lobe_segments(_segmentation_segments(lobe_path))
        run.artifacts["lung_lobes"] = Artifact(
            kind="lung_lobes",
            path=lobe_path,
            role="five_lobe_segmentation",
            format="DICOM SEG",
            media_type="application/dicom",
            segment_labels=tuple(label for _, label in lobe_segments),
            segment_numbers=tuple(number for number, _ in lobe_segments),
        )

        if _nodule_inference_enabled():
            run.stage = "running lung-nodule segmentation"
            nodule_source = output_dir / "lung_nodules_raw.dcm"
            await asyncio.to_thread(
                _run_total_segmentator,
                input_dir,
                nodule_source,
                task="lung_nodules",
            )
            run.artifacts["lung_nodules"] = _nodule_artifact(nodule_source, output_dir)
            nodule_source.unlink(missing_ok=True)

        run.stage = "converting lung-lobe surface mesh"
        surface_path = output_dir / "lung_lobe_surface.ply"
        _write_lobe_surface(lobe_path, surface_path, lobe_segments)
        run.artifacts["lung_lobe_surface"] = Artifact(
            kind="lung_lobe_surface",
            path=surface_path,
            role="five_lobe_surface",
            format="PLY 1.0 binary_little_endian",
            media_type="model/x-ply",
            segment_labels=tuple(label for _, label in lobe_segments),
            segment_numbers=tuple(number for number, _ in lobe_segments),
        )
        run.status, run.stage = "succeeded", (
            "DICOM SEG and lobe surface artifacts ready"
            if _nodule_inference_enabled()
            else "five-lobe DICOM SEG and surface artifacts ready; nodule task disabled"
        )
    except subprocess.TimeoutExpired:
        run.status, run.stage = "failed", "inference timed out"
        run.artifacts.clear()
        run.error = "AI preliminary segmentation exceeded the 6-hour prototype limit; no artifact is available."
        shutil.rmtree(output_dir, ignore_errors=True)
    except subprocess.CalledProcessError as exc:
        run.status, run.stage = "failed", "inference failed"
        run.artifacts.clear()
        run.error = (
            "TotalSegmentator failed while downloading weights or running inference; "
            "run `python deploy_dsw.py prepare-weights` on the DSW instance before retrying. "
            f"Exit code: {exc.returncode}. No artifact is available."
        )
        shutil.rmtree(output_dir, ignore_errors=True)
    except Exception:  # Boundary: return failure, never fabricate or echo DICOM-derived details.
        surface_conversion_failed = run.stage == "converting lung-lobe surface mesh"
        run.status = "failed"
        run.stage = "lung-lobe surface conversion failed" if surface_conversion_failed else "inference failed"
        run.artifacts.clear()
        run.error = (
            "Lung-lobe surface conversion failed; no artifact is available."
            if surface_conversion_failed
            else "Inference failed; no artifact is available."
        )
    finally:
        run.completed_at = datetime.now(timezone.utc)
        shutil.rmtree(input_dir, ignore_errors=True)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True, "inference_enabled": _inference_enabled()}


@app.post("/api/v1/pulmonary-nodule/jobs", status_code=202)
async def create_job(
    series: UploadFile = File(...),
    run_id: str = Form(..., min_length=32, max_length=32),
    _: None = Depends(require_api_key),
) -> dict[str, str]:
    if not _inference_enabled():
        raise HTTPException(
            status_code=503,
            detail=(
                "AI 推理在部署配置中已禁用；完成 GPU、lung_nodules 任务许可和样本验证后，"
                "将 PULMONARY_AI_ENABLE_INFERENCE=1。 "
                "AI inference is disabled by deployment configuration; set "
                "PULMONARY_AI_ENABLE_INFERENCE=1 only after GPU, lung_nodules task "
                "licensing, and sample validation are recorded."
            ),
        )
    if series.content_type not in {"application/zip", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="A zipped DICOM series is required")
    payload = await series.read(MAX_ARCHIVE_BYTES + 1)
    try:
        uuid.UUID(hex=run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="A valid caller-generated run ID is required") from exc
    if run_id in RUNS:
        raise HTTPException(status_code=409, detail="Inference job ID already exists")
    root = Path(tempfile.mkdtemp(prefix=f"wt32-{run_id}-", dir=DATA_DIR))
    input_dir, output_dir = root / "input", root / "output"
    input_dir.mkdir()
    output_dir.mkdir()
    try:
        _extract_dicom_archive(payload, input_dir)
    except HTTPException:
        shutil.rmtree(root, ignore_errors=True)
        raise
    run = Run(id=run_id)
    RUNS[run_id] = run
    asyncio.create_task(_run(run, input_dir, output_dir))
    return {"job_id": run_id, "status": run.status}


@app.get("/api/v1/pulmonary-nodule/jobs/{run_id}")
def get_job(run_id: str, _: None = Depends(require_api_key)) -> dict[str, object]:
    run = RUNS.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Inference job not found")
    return _job_status(run)


@app.get("/api/v1/pulmonary-nodule/jobs/{run_id}/artifacts")
def list_artifacts(run_id: str, _: None = Depends(require_api_key)) -> dict[str, object]:
    run = RUNS.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Inference job not found")
    return {"job_id": run.id, "status": run.status, "artifacts": [_artifact_metadata(artifact) for artifact in run.artifacts.values()]}


def _ready_artifact(run_id: str, artifact_kind: ArtifactKind) -> Artifact:
    run = RUNS.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Inference job not found")
    artifact = run.artifacts.get(artifact_kind)
    if run.status != "succeeded" or artifact is None:
        raise HTTPException(status_code=409, detail="DICOM SEG artifact is not ready")
    return artifact


@app.get("/api/v1/pulmonary-nodule/jobs/{run_id}/artifact")
def get_artifact(run_id: str, _: None = Depends(require_api_key)) -> FileResponse:
    """Backward-compatible nodule SEG endpoint for the existing WT32 adapter."""
    artifact = _ready_artifact(run_id, "lung_nodules")
    return FileResponse(artifact.path, media_type="application/dicom", filename="ai-preliminary-seg.dcm")


@app.get("/api/v1/pulmonary-nodule/jobs/{run_id}/artifacts/{artifact_kind}")
def get_named_artifact(
    run_id: str, artifact_kind: ArtifactKind, _: None = Depends(require_api_key)
) -> FileResponse:
    artifact = _ready_artifact(run_id, artifact_kind)
    return FileResponse(artifact.path, media_type=artifact.media_type, filename=artifact.path.name)
