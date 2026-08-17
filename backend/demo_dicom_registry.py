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

import pydicom


DATA_DIR = Path(__file__).resolve().parent / "data" / "demo-dicom"
SOURCE_VERSION = 1

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
        manifest = _manifest("fourd-engineer", phases[phase_value])
        volumes.append({
            "id": f"phase-{phase_value:02d}", "groupIndex": phase_index,
            "bedIndex": 0, "bedNumber": 1, "phaseIndex": phase_index,
            "phaseValue": phase_value, "phaseLabel": f"{phase_value}%",
            "candidateIndex": 0, "sliceCount": manifest["count"],
            "sourceSliceCount": manifest["count"], "fileStart": 1,
            "fileEnd": manifest["count"], "rangeMm": [0, float(manifest["count"])],
            "acquisitionTime": "simulation-reference",
            "urls": {
                "axialPreview": manifest["urls"][0], "coronalPreview": manifest["urls"][0],
                "sagittalPreview": manifest["urls"][0], "mha": manifest["urls"][0],
                "axialSlices": manifest["urls"],
            },
        })
    first = volumes[0]
    return {
        "version": SOURCE_VERSION, "source": "backend/data/demo-dicom",
        "generatedBy": "backend.demo_dicom_registry", "bedCount": 1,
        "phaseCount": 10, "phaseLabels": [f"{phase}%" for phase in range(0, 100, 10)],
        "sliceCountPerVolume": first["sliceCount"], "rows": 512, "columns": 512,
        "volumes": volumes,
    }
