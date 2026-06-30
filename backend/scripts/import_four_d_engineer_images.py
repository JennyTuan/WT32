"""Import engineer-provided 4D .img frames into local frontend demo assets.

Input:
    backend/data/images/<n>.img

Output:
    ui-review/public/fourd-engineer/manifest.json
    ui-review/public/fourd-engineer/groups/gNNN/*.webp
    ui-review/public/fourd-engineer/groups/gNNN/volume.mha

The .img format used by the tester has a 581-byte private header followed by
512 x 512 signed 16-bit pixels. Header fields used here were inferred from the
test dataset and are validated by consistency checks before writing output.
"""

from __future__ import annotations

import argparse
import json
import shutil
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = PROJECT_ROOT / "backend" / "data" / "images"
DEFAULT_OUTPUT = PROJECT_ROOT / "ui-review" / "public" / "fourd-engineer"

HEADER_BYTES = 581
ROWS = 512
COLUMNS = 512
PIXEL_BYTES = ROWS * COLUMNS * 2
EXPECTED_FILE_BYTES = HEADER_BYTES + PIXEL_BYTES
SLICES_PER_VOLUME = 32
PHASE_COUNT = 10
RESCALE_INTERCEPT = -1024
DEFAULT_WINDOW_LEVEL = -600
DEFAULT_WINDOW_WIDTH = 1600


@dataclass(frozen=True)
class ImgRecord:
    path: Path
    file_index: int
    sequence_index: int
    group_index: int
    phase_index: int
    phase_value: float
    z_position: float
    acquisition_time: str


@dataclass(frozen=True)
class VolumeGroup:
    group_index: int
    bed_index: int
    phase_index: int
    phase_value: float
    candidate_index: int
    records: list[ImgRecord]


def parse_record(path: Path) -> ImgRecord:
    data = path.read_bytes()
    if len(data) != EXPECTED_FILE_BYTES:
        raise ValueError(f"{path} has {len(data)} bytes; expected {EXPECTED_FILE_BYTES}.")

    header = data[:HEADER_BYTES]
    sequence_index = struct.unpack_from("<I", header, 384)[0]
    group_index = struct.unpack_from("<H", header, 390)[0]
    phase_value = float(struct.unpack_from("<f", header, 486)[0])
    phase_index = int(round(phase_value * 10))
    z_position = float(struct.unpack_from("<f", header, 508)[0])
    acquisition_time = header[470:482].split(b"\0", 1)[0].decode("ascii", errors="ignore")

    try:
        file_index = int(path.stem)
    except ValueError as exc:
        raise ValueError(f"Unexpected image filename: {path.name}") from exc

    return ImgRecord(
        path=path,
        file_index=file_index,
        sequence_index=sequence_index,
        group_index=group_index,
        phase_index=phase_index,
        phase_value=round(phase_value, 3),
        z_position=z_position,
        acquisition_time=acquisition_time,
    )


def load_records(input_dir: Path) -> list[ImgRecord]:
    paths = sorted(input_dir.glob("*.img"), key=lambda p: int(p.stem) if p.stem.isdigit() else 10**12)
    if not paths:
        raise FileNotFoundError(f"No .img files found under {input_dir}")

    records = [parse_record(path) for path in paths]
    for expected, record in enumerate(records):
        if record.file_index != expected or record.sequence_index != expected:
            raise ValueError(
                "Image sequence is not continuous at "
                f"{record.path.name}: filename={record.file_index}, header={record.sequence_index}, expected={expected}."
            )
    return records


def build_groups(records: list[ImgRecord]) -> list[VolumeGroup]:
    grouped: dict[int, list[ImgRecord]] = {}
    for record in records:
        grouped.setdefault(record.group_index, []).append(record)

    if sorted(grouped) != list(range(len(grouped))):
        raise ValueError("Group indices are not continuous from 0.")

    groups: list[VolumeGroup] = []
    candidate_counts: dict[tuple[int, int], int] = {}
    for group_index in sorted(grouped):
        group_records = sorted(grouped[group_index], key=lambda item: item.file_index)
        phase_values = {record.phase_index for record in group_records}
        if len(phase_values) != 1:
            raise ValueError(f"Group {group_index} contains multiple phase indices: {sorted(phase_values)}")
        if len(group_records) not in {SLICES_PER_VOLUME, SLICES_PER_VOLUME + 1}:
            raise ValueError(f"Group {group_index} has {len(group_records)} slices; expected about {SLICES_PER_VOLUME}.")

        bed_index = group_index // 11
        phase_index = group_records[0].phase_index
        phase_value = group_records[0].phase_value
        key = (bed_index, phase_index)
        candidate_index = candidate_counts.get(key, 0)
        candidate_counts[key] = candidate_index + 1
        groups.append(
            VolumeGroup(
                group_index=group_index,
                bed_index=bed_index,
                phase_index=phase_index,
                phase_value=phase_value,
                candidate_index=candidate_index,
                records=group_records,
            )
        )

    bed_count = max(group.bed_index for group in groups) + 1
    if bed_count != 9:
        raise ValueError(f"Expected 9 valid beds from the provided dataset; found {bed_count}.")
    return groups


def select_volume_records(records: list[ImgRecord]) -> list[ImgRecord]:
    return records[:SLICES_PER_VOLUME]


def read_volume(records: list[ImgRecord]) -> np.ndarray:
    slices = []
    for record in records:
        raw = record.path.read_bytes()[HEADER_BYTES:]
        slices.append(np.frombuffer(raw, dtype="<i2").reshape((ROWS, COLUMNS)))
    return np.stack(slices, axis=0)


def stored_to_hu(array: np.ndarray) -> np.ndarray:
    return array.astype(np.int16, copy=False) + RESCALE_INTERCEPT


def window_to_uint8(array: np.ndarray) -> np.ndarray:
    low = DEFAULT_WINDOW_LEVEL - DEFAULT_WINDOW_WIDTH / 2
    high = DEFAULT_WINDOW_LEVEL + DEFAULT_WINDOW_WIDTH / 2
    scaled = (array.astype(np.float32) - low) * (255.0 / (high - low))
    return np.clip(scaled, 0, 255).astype(np.uint8)


def save_webp(array: np.ndarray, path: Path, *, resize_to_square: bool = False) -> None:
    image = Image.fromarray(window_to_uint8(array), mode="L")
    if resize_to_square:
        image = image.resize((512, 512), Image.Resampling.BILINEAR)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", quality=88, method=4)


def save_mha(volume: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "ObjectType = Image\n"
        "NDims = 3\n"
        "BinaryData = True\n"
        "BinaryDataByteOrderMSB = False\n"
        "CompressedData = False\n"
        "TransformMatrix = 1 0 0 0 1 0 0 0 1\n"
        "Offset = 0 0 0\n"
        "CenterOfRotation = 0 0 0\n"
        "AnatomicalOrientation = RAI\n"
        "ElementSpacing = 0.9766 0.9766 0.6\n"
        f"DimSize = {COLUMNS} {ROWS} {volume.shape[0]}\n"
        "ElementType = MET_SHORT\n"
        "ElementDataFile = LOCAL\n"
    ).encode("ascii")
    with path.open("wb") as handle:
        handle.write(header)
        handle.write(np.ascontiguousarray(volume.astype("<i2", copy=False)).tobytes())


def web_path(path: Path, public_root: Path) -> str:
    return "/" + path.relative_to(public_root).as_posix()


def write_outputs(groups: list[VolumeGroup], output_dir: Path, *, clean: bool) -> dict:
    public_root = PROJECT_ROOT / "ui-review" / "public"
    if clean and output_dir.exists():
        resolved_output = output_dir.resolve()
        resolved_public = public_root.resolve()
        if resolved_public not in resolved_output.parents and resolved_output != resolved_public:
            raise ValueError(f"Refusing to clean output outside public/: {output_dir}")
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_volumes = []
    for group in groups:
        group_dir = output_dir / "groups" / f"g{group.group_index:03d}"
        used_records = select_volume_records(group.records)
        volume = stored_to_hu(read_volume(used_records))

        axial_dir = group_dir / "axial"
        axial_urls = []
        for slice_index, slice_array in enumerate(volume, start=1):
            slice_path = axial_dir / f"{slice_index:03d}.webp"
            save_webp(slice_array, slice_path)
            axial_urls.append(web_path(slice_path, public_root))

        mid_slice = max(0, min(volume.shape[0] - 1, volume.shape[0] // 2))
        axial_preview_path = group_dir / "axial-preview.webp"
        coronal_preview_path = group_dir / "coronal-preview.webp"
        sagittal_preview_path = group_dir / "sagittal-preview.webp"
        coronal_strip_path = group_dir / "coronal-strip.webp"
        sagittal_strip_path = group_dir / "sagittal-strip.webp"
        mha_path = group_dir / "volume.mha"

        save_webp(volume[mid_slice], axial_preview_path)
        coronal_strip = volume[:, ROWS // 2, :]
        sagittal_strip = volume[:, :, COLUMNS // 2]
        save_webp(coronal_strip, coronal_strip_path)
        save_webp(sagittal_strip, sagittal_strip_path)
        save_webp(coronal_strip, coronal_preview_path, resize_to_square=True)
        save_webp(sagittal_strip, sagittal_preview_path, resize_to_square=True)
        save_mha(volume, mha_path)

        z_values = [record.z_position for record in used_records]
        manifest_volumes.append(
            {
                "id": f"g{group.group_index:03d}",
                "groupIndex": group.group_index,
                "bedIndex": group.bed_index,
                "bedNumber": group.bed_index + 1,
                "phaseIndex": group.phase_index,
                "phaseValue": group.phase_value,
                "phaseLabel": f"{group.phase_index * 10}%",
                "candidateIndex": group.candidate_index,
                "sliceCount": volume.shape[0],
                "sourceSliceCount": len(group.records),
                "fileStart": used_records[0].file_index,
                "fileEnd": used_records[-1].file_index,
                "rangeMm": [round(min(z_values), 1), round(max(z_values), 1)],
                "acquisitionTime": group.records[0].acquisition_time,
                "urls": {
                    "axialPreview": web_path(axial_preview_path, public_root),
                    "coronalPreview": web_path(coronal_preview_path, public_root),
                    "sagittalPreview": web_path(sagittal_preview_path, public_root),
                    "coronalStrip": web_path(coronal_strip_path, public_root),
                    "sagittalStrip": web_path(sagittal_strip_path, public_root),
                    "mha": web_path(mha_path, public_root),
                    "axialSlices": axial_urls,
                },
            }
        )

    bed_count = max(volume["bedIndex"] for volume in manifest_volumes) + 1
    manifest = {
        "version": 1,
        "source": "backend/data/images",
        "generatedBy": "backend/scripts/import_four_d_engineer_images.py",
        "bedCount": bed_count,
        "phaseCount": PHASE_COUNT,
        "phaseLabels": [f"{index * 10}%" for index in range(PHASE_COUNT)],
        "sliceCountPerVolume": SLICES_PER_VOLUME,
        "rescaleIntercept": RESCALE_INTERCEPT,
        "windowLevel": DEFAULT_WINDOW_LEVEL,
        "windowWidth": DEFAULT_WINDOW_WIDTH,
        "rows": ROWS,
        "columns": COLUMNS,
        "volumes": manifest_volumes,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert 4D engineer .img files into WT32 local demo assets.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input folder containing numbered .img files.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output folder under ui-review/public.")
    parser.add_argument("--no-clean", action="store_true", help="Do not remove the output folder before writing.")
    args = parser.parse_args()

    records = load_records(args.input)
    groups = build_groups(records)
    manifest = write_outputs(groups, args.output, clean=not args.no_clean)

    duplicate_cells = 0
    seen: dict[tuple[int, int], int] = {}
    for volume in manifest["volumes"]:
        key = (volume["bedIndex"], volume["phaseIndex"])
        seen[key] = seen.get(key, 0) + 1
    duplicate_cells = sum(1 for count in seen.values() if count > 1)

    print(
        f"Imported {len(records)} .img files into {len(groups)} volume groups "
        f"({manifest['bedCount']} beds, {manifest['phaseCount']} phases, {duplicate_cells} duplicate cells)."
    )
    print(f"Wrote {args.output / 'manifest.json'}")


if __name__ == "__main__":
    main()
