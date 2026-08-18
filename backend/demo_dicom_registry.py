"""Local, de-identified DICOM reference registry for the WT32 prototype.

The downloaded TCIA folders are intentionally kept in their original manifest
layout.  This registry reads DICOM headers and exposes a small, explicit set
of simulated-reference sources without copying or renaming raw image files.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from re import search
from urllib.parse import quote
import csv

import pydicom


DATA_DIR = Path(__file__).resolve().parent / "data" / "demo-dicom"
SOURCE_VERSION = 1
FOUR_D_TRACE_DICOM_DIR = DATA_DIR / "DICOM" / "DICOM"
FOUR_D_TRACE_CURVE_DIR = DATA_DIR / "breathing_curves" / "breathing_curves"

BODY_PARTS = ("head", "neck", "chest", "abdomen", "spine", "extremity")
SOURCE_IDS_BY_BODY_PART = {
    body_part: {
        "topogram": f"{body_part}-topogram-demo",
        "diagnostic": f"{body_part}-diagnostic-demo",
    }
    for body_part in BODY_PARTS
}
TOPOGRAM_SOURCE_IDS = frozenset(item["topogram"] for item in SOURCE_IDS_BY_BODY_PART.values())
DIAGNOSTIC_SOURCE_IDS = frozenset(item["diagnostic"] for item in SOURCE_IDS_BY_BODY_PART.values())


def source_id_for_series(body_part: str, series_type: str) -> str | None:
    sources = SOURCE_IDS_BY_BODY_PART.get(body_part.lower())
    if not sources:
        return None
    if series_type == "topogram":
        return sources["topogram"]
    if series_type in {"helical", "axial"}:
        return sources["diagnostic"]
    return None


def is_compatible_source_id(source_id: str | None, series_type: str) -> bool:
    if series_type == "topogram":
        return source_id in TOPOGRAM_SOURCE_IDS
    if series_type in {"helical", "axial"}:
        return source_id in DIAGNOSTIC_SOURCE_IDS
    return False


def _header(path: Path):
    return pydicom.dcmread(
        path,
        stop_before_pixels=True,
        force=False,
        specific_tags=[
            "BodyPartExamined", "ImageOrientationPatient", "ImagePositionPatient",
            "ImageType", "InstanceNumber", "KVP", "Modality", "PatientID",
            "PixelSpacing", "Rows", "Columns", "SeriesDescription",
            "SeriesInstanceUID", "SliceThickness", "StudyDescription",
            "WindowCenter", "WindowWidth",
        ],
    )


def _text(dataset, name: str) -> str:
    return str(getattr(dataset, name, "") or "")


def _image_type(dataset) -> set[str]:
    return {str(value).upper() for value in getattr(dataset, "ImageType", []) or []}


def _sort_key(item: tuple[Path, object]) -> tuple[float, str]:
    path, dataset = item
    value = getattr(dataset, "InstanceNumber", None)
    try:
        return float(value), path.name
    except (TypeError, ValueError):
        position = getattr(dataset, "ImagePositionPatient", None)
        try:
            return float(position[2]), path.name
        except (TypeError, ValueError, IndexError):
            return float("inf"), path.name


def _all_series() -> list[list[tuple[Path, object]]]:
    grouped: dict[str, list[tuple[Path, object]]] = {}
    for path in DATA_DIR.rglob("*.dcm"):
        dataset = _header(path)
        if _text(dataset, "Modality") != "CT":
            continue
        series_uid = _text(dataset, "SeriesInstanceUID")
        if not series_uid:
            continue
        grouped.setdefault(series_uid, []).append((path, dataset))
    return [sorted(items, key=_sort_key) for items in grouped.values()]


def _is_topogram(dataset) -> bool:
    return "LOCALIZER" in _image_type(dataset) or "TOPOGRAM" in _text(dataset, "SeriesDescription").upper()


def _match(body_part: str, kind: str, dataset) -> bool:
    body = _text(dataset, "BodyPartExamined").upper()
    description = _text(dataset, "SeriesDescription").upper()
    image_type = _image_type(dataset)
    if kind == "topogram":
        if body_part == "extremity":
            return body == "WHOLEBODY" and "TOPOGRAM" in description
        if not _is_topogram(dataset):
            return False
        return body == body_part.upper()

    if "AXIAL" not in image_type:
        return False
    if body_part == "head":
        return body == "HEAD" and "ORIGINAL" in image_type and "BONE" not in description
    if body_part == "neck":
        return body == "NECK" and "1.5" in description
    if body_part == "chest":
        return body == "CHEST" and "ORIGINAL" in image_type and "B70" in description
    if body_part == "abdomen":
        return body == "ABDOMEN" and "ORIGINAL" in image_type and "MPR" not in image_type
    if body_part == "spine":
        return body == "SPINE" and "ORIGINAL" in image_type and "AXIAL 2MM STD" in description
    if body_part == "extremity":
        return body == "EXTREMITY" and "ORIGINAL" in image_type
    return False


def _scalar(value):
    if isinstance(value, (str, bytes, int, float)):
        return value
    try:
        return value[0] if len(value) else None
    except TypeError:
        return value


def _manifest(source_id: str, series: list[tuple[Path, object]]) -> dict[str, object]:
    first_path, first = series[0]
    relative_urls = [
        f"/dicom/{quote(path.relative_to(DATA_DIR).as_posix(), safe='/')}"
        for path, _ in series
    ]
    return {
        "sourceId": source_id,
        "version": SOURCE_VERSION,
        "sourceKind": "simulation_reference",
        "studyDescription": _text(first, "StudyDescription"),
        "seriesDescription": _text(first, "SeriesDescription"),
        "bodyPart": _text(first, "BodyPartExamined"),
        "seriesInstanceUid": _text(first, "SeriesInstanceUID"),
        "imageType": [str(item) for item in getattr(first, "ImageType", []) or []],
        "count": len(relative_urls),
        "rows": int(getattr(first, "Rows", 0) or 0),
        "columns": int(getattr(first, "Columns", 0) or 0),
        "windowCenter": _scalar(getattr(first, "WindowCenter", None)),
        "windowWidth": _scalar(getattr(first, "WindowWidth", None)),
        "urls": relative_urls,
        "firstFile": first_path.relative_to(DATA_DIR).as_posix(),
    }


def _dicom_series_in(directory: Path) -> list[tuple[Path, object]]:
    if not directory.is_dir():
        return []
    return sorted(
        ((path, _header(path)) for path in directory.iterdir() if path.is_file()),
        key=_sort_key,
    )


def _waveform_preview(curve_id: str) -> list[dict[str, float]]:
    curve_path = FOUR_D_TRACE_CURVE_DIR / f"{curve_id}.csv"
    if not curve_path.is_file():
        return []

    values: list[tuple[float, float]] = []
    with curve_path.open(newline="", encoding="utf-8-sig") as stream:
        for row in csv.reader(stream):
            try:
                values.append((float(row[0]), float(row[1])))
            except (IndexError, ValueError):
                continue

    # The raw source contains a long reference trace. The prototype exposes a
    # fixed 30-second excerpt only; production integration must use synchronized
    # acquisition timestamps from the scanner and respiratory device.
    excerpt = [value for value in values if value[0] <= 30.0]
    if len(excerpt) < 2:
        return []
    minimum = min(value[1] for value in excerpt)
    maximum = max(value[1] for value in excerpt)
    amplitude_range = max(maximum - minimum, 0.001)
    stride = max(1, len(excerpt) // 600)
    duration = max(excerpt[-1][0], 0.001)
    return [
        {
            "t": round(timestamp / duration, 6),
            "value": round(8 + ((amplitude - minimum) / amplitude_range) * 84, 3),
        }
        for timestamp, amplitude in excerpt[::stride]
    ]


@lru_cache(maxsize=1)
def build_four_d_data_review_manifest() -> dict[str, object] | None:
    candidate_specs = (
        ("trace1_cos6", "余弦参考呼吸"),
        ("trace2_regular", "规律呼吸"),
        ("trace3_large", "大幅度呼吸"),
        ("trace4_slow", "慢呼吸"),
        ("trace5_irregular", "不规则呼吸"),
    )
    candidates: dict[str, dict[str, object]] = {}
    for curve_id, label in candidate_specs:
        series = _dicom_series_in(FOUR_D_TRACE_DICOM_DIR / curve_id / "4dct")
        waveform = _waveform_preview(curve_id)
        if not series or not waveform:
            continue
        image_manifest = _manifest(f"fourd-{curve_id}", series)
        candidates[curve_id] = {
            "id": curve_id,
            "label": label,
            "sourceKind": "simulation_reference",
            "previewUrl": image_manifest["urls"][len(image_manifest["urls"]) // 2],
            "sliceCount": image_manifest["count"],
            "waveform": waveform,
        }

    bed_candidates = (
        ("trace2_regular", "trace5_irregular"),
        ("trace3_large", "trace4_slow"),
        ("trace1_cos6", "trace5_irregular"),
    )
    if any(candidate_id not in candidates for group in bed_candidates for candidate_id in group):
        return None
    return {
        "version": SOURCE_VERSION,
        "sourceKind": "simulation_reference",
        "note": "公开曲线与影像用于原型演示参考，非实时采集或真实回顾式重建输入。",
        "beds": [
            {
                "bedIndex": bed_index,
                "bedNumber": bed_index + 1,
                "candidateIds": list(candidate_ids),
            }
            for bed_index, candidate_ids in enumerate(bed_candidates)
        ],
        "candidates": list(candidates.values()),
    }


@lru_cache(maxsize=1)
def build_reference_registry() -> dict[str, dict[str, object]]:
    registry: dict[str, dict[str, object]] = {}
    series = _all_series()
    for body_part, sources in SOURCE_IDS_BY_BODY_PART.items():
        for kind, source_id in sources.items():
            candidate = next((item for item in series if _match(body_part, kind, item[0][1])), None)
            if candidate:
                registry[source_id] = _manifest(source_id, candidate)
    return registry


@lru_cache(maxsize=1)
def build_four_d_manifest() -> dict[str, object] | None:
    phases: dict[int, list[tuple[Path, object]]] = {}
    for candidate in _all_series():
        first = candidate[0][1]
        description = _text(first, "SeriesDescription")
        phase_match = search(r"Gated,\s*(\d+(?:\.\d+)?)%", description)
        if _text(first, "BodyPartExamined").upper() != "LUNG" or not phase_match:
            continue
        phases[int(float(phase_match.group(1)))] = candidate
    if set(phases) != set(range(0, 100, 10)):
        return None
    volumes = []
    for phase_index, phase_value in enumerate(range(0, 100, 10)):
        phase_series = phases[phase_value]
        manifest = _manifest("fourd-engineer", phase_series)
        bed_count = 3
        base_size, remainder = divmod(len(phase_series), bed_count)
        start = 0
        for bed_index in range(bed_count):
            size = base_size + (1 if bed_index < remainder else 0)
            segment = phase_series[start:start + size]
            start += size
            if not segment:
                return None
            segment_urls = manifest["urls"][start - size:start]
            z_positions = [
                float(item[1].ImagePositionPatient[2])
                for item in segment
                if len(getattr(item[1], "ImagePositionPatient", [])) > 2
            ]
            range_mm = [min(z_positions), max(z_positions)] if z_positions else [0.0, float(size)]
            volumes.append({
                "id": f"phase-{phase_value:02d}-bed-{bed_index + 1}",
                "groupIndex": phase_index * bed_count + bed_index,
                "bedIndex": bed_index, "bedNumber": bed_index + 1, "phaseIndex": phase_index,
                "phaseValue": phase_value, "phaseLabel": f"{phase_value}%",
                "candidateIndex": 0, "sliceCount": size,
                "sourceSliceCount": manifest["count"], "fileStart": start - size + 1,
                "fileEnd": start, "rangeMm": range_mm,
                "acquisitionTime": "simulation-reference",
                "urls": {
                    "axialPreview": segment_urls[len(segment_urls) // 2],
                    "coronalPreview": segment_urls[len(segment_urls) // 2],
                    "sagittalPreview": segment_urls[len(segment_urls) // 2],
                    "mha": segment_urls[len(segment_urls) // 2],
                    "axialSlices": segment_urls,
                },
            })
    first = volumes[0]
    return {
        "version": SOURCE_VERSION, "source": "backend/data/demo-dicom",
        "generatedBy": "backend.demo_dicom_registry", "bedCount": 3,
        "phaseCount": 10, "phaseLabels": [f"{phase}%" for phase in range(0, 100, 10)],
        "sliceCountPerVolume": first["sliceCount"], "rows": 512, "columns": 512,
        "volumes": volumes,
    }
