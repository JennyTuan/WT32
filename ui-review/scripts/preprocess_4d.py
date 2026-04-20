#!/usr/bin/env python
"""
Preprocess TCIA 4D-Lung DICOM into lightweight WebP images for the 4D image viewer demo.

Usage (run from project root):
  python ui-review/scripts/preprocess_4d.py \
    --input  "D:/data-tcia-4d-lung-part-1-main/100_HM10395/07-02-2003-NA-p4-14571" \
    --output "ui-review/public/dicom-4d"
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image

# ── tunables ──────────────────────────────────────────────────────────────────
WW = 1500         # lung window width
WL = -600         # lung window level
TARGET = 384      # axial/coronal/sagittal output resolution
MIP_TARGET = 512  # MIP output resolution (more detail for the ITV panel)
QUALITY = 82      # WebP quality

PHASE_RE = re.compile(r"Gated\s+(\d+\.\d+)A")
INT_SUFFIX_RE = re.compile(r"-\d+$")  # raw series end with plain integer, e.g. "-29193"
AGGREGATE_DIR_NAMES = {
    "MIP": "mip",
    "MinIP": "min",
    "Avg": "avg",
}


def find_phase_dirs(study_dir: Path) -> list[tuple[float, Path]]:
    """Return [(phase_value_percent, dir), ...] for the 10 phases, de-duped.

    Each phase has 2 copies. The raw/primary one ends with a plain integer suffix
    (e.g. "-29193"), the derived one ends with a dotted number (e.g. "-423.1" or
    "-23.10"). We prefer the integer-suffixed one.
    """
    buckets: dict[float, list[Path]] = {}
    for d in study_dir.iterdir():
        if not d.is_dir():
            continue
        m = PHASE_RE.search(d.name)
        if not m:
            continue
        phase = float(m.group(1))
        buckets.setdefault(phase, []).append(d)

    result: list[tuple[float, Path]] = []
    for phase, dirs in sorted(buckets.items()):
        preferred = [d for d in dirs if INT_SUFFIX_RE.search(d.name)]
        chosen = (preferred or dirs)[0]
        result.append((phase, chosen))
    return result


def load_volume(phase_dir: Path) -> tuple[np.ndarray, dict]:
    """Load a DICOM series → HU volume [Z, Y, X] (float32) + metadata."""
    files = sorted(phase_dir.glob("*.dcm"))
    if not files:
        raise RuntimeError(f"No .dcm files in {phase_dir}")

    slices = [pydicom.dcmread(str(f)) for f in files]

    def slice_z(s) -> float:
        # Prefer ImagePositionPatient[2]; fall back to SliceLocation, then InstanceNumber.
        ipp = getattr(s, "ImagePositionPatient", None)
        if ipp is not None and len(ipp) >= 3:
            return float(ipp[2])
        sl = getattr(s, "SliceLocation", None)
        if sl is not None:
            return float(sl)
        inst = getattr(s, "InstanceNumber", 0)
        return float(inst)

    slices.sort(key=slice_z)

    ps = slices[0].PixelSpacing  # [row(y), col(x)] in mm
    zs = [slice_z(s) for s in slices]
    z_spacing = abs(zs[1] - zs[0]) if len(zs) > 1 else float(getattr(slices[0], "SliceThickness", 1.0))

    arr = np.stack([s.pixel_array.astype(np.int16) for s in slices], axis=0)
    slope = float(getattr(slices[0], "RescaleSlope", 1))
    intercept = float(getattr(slices[0], "RescaleIntercept", 0))
    hu = (arr * slope + intercept).astype(np.float32)

    meta = {
        "pixel_spacing_y": float(ps[0]),
        "pixel_spacing_x": float(ps[1]),
        "z_spacing": z_spacing,
        "shape": list(hu.shape),
    }
    return hu, meta


def hu_to_u8(vol: np.ndarray, ww: float = WW, wl: float = WL) -> np.ndarray:
    lo, hi = wl - ww / 2, wl + ww / 2
    v = np.clip((vol - lo) / (hi - lo), 0, 1)
    return (v * 255).astype(np.uint8)


def save_slices(
    vol_u8: np.ndarray,
    out_dir: Path,
    axis: int,
    target: int,
    quality: int,
) -> int:
    """Slice along `axis`, resize each slice to target×target, save as WebP."""
    out_dir.mkdir(parents=True, exist_ok=True)
    n = vol_u8.shape[axis]
    for i in range(n):
        if axis == 0:
            sl = vol_u8[i, :, :]
        elif axis == 1:
            sl = vol_u8[:, i, :]
        else:
            sl = vol_u8[:, :, i]

        img = Image.fromarray(sl, mode="L")
        # coronal/sagittal: z increases feet→head in our sort, so flip vertically to put head up
        if axis in (1, 2):
            img = img.transpose(Image.FLIP_TOP_BOTTOM)
        img = img.resize((target, target), Image.BILINEAR)
        img.save(out_dir / f"{i + 1:03d}.webp", "WEBP", quality=quality)
    return n


def save_aggregate_volume(
    vol_hu: np.ndarray,
    out_root: Path,
    dir_name: str,
    target: int,
    quality: int,
) -> dict[str, int]:
    """Save one aggregate volume under mip-itv/<dir_name>/<view>/."""
    vol_u8 = hu_to_u8(vol_hu)
    aggregate_out = out_root / dir_name
    n_ax = save_slices(vol_u8, aggregate_out / "axial", axis=0, target=target, quality=quality)
    n_co = save_slices(vol_u8, aggregate_out / "coronal", axis=1, target=target, quality=quality)
    n_sa = save_slices(vol_u8, aggregate_out / "sagittal", axis=2, target=target, quality=quality)
    return {
        "axial": n_ax,
        "coronal": n_co,
        "sagittal": n_sa,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, type=Path, help="Study dir with 10+ phase subfolders")
    ap.add_argument("--output", required=True, type=Path, help="Output dir (will be created)")
    args = ap.parse_args()

    study: Path = args.input
    out: Path = args.output

    if not study.is_dir():
        print(f"ERROR: input is not a directory: {study}", file=sys.stderr)
        return 1

    out.mkdir(parents=True, exist_ok=True)

    phase_dirs = find_phase_dirs(study)
    if len(phase_dirs) != 10:
        print(
            f"WARNING: expected 10 phases, found {len(phase_dirs)}: "
            f"{[f'{p}%' for p, _ in phase_dirs]}",
            file=sys.stderr,
        )
    if not phase_dirs:
        print("ERROR: no phase directories found", file=sys.stderr)
        return 1

    print(f"Case:  {study.parent.name}")
    print(f"Study: {study.name}")
    print(f"Phases: {[f'{p}%' for p, _ in phase_dirs]}")
    print()

    phase_volumes: list[tuple[float, np.ndarray, dict]] = []
    slices_meta: dict[str, int] | None = None

    for idx, (phase_val, phase_dir) in enumerate(phase_dirs):
        print(f"[{idx + 1}/{len(phase_dirs)}] phase {phase_val}%  ←  {phase_dir.name}")
        vol_hu, meta = load_volume(phase_dir)
        print(
            f"  shape={tuple(meta['shape'])}  "
            f"spacing z={meta['z_spacing']:.2f}mm y={meta['pixel_spacing_y']:.2f}mm x={meta['pixel_spacing_x']:.2f}mm"
        )
        phase_volumes.append((phase_val, vol_hu, meta))

        vol_u8 = hu_to_u8(vol_hu)
        phase_out = out / f"phase-{idx}"
        n_ax = save_slices(vol_u8, phase_out / "axial",    axis=0, target=TARGET, quality=QUALITY)
        n_co = save_slices(vol_u8, phase_out / "coronal",  axis=1, target=TARGET, quality=QUALITY)
        n_sa = save_slices(vol_u8, phase_out / "sagittal", axis=2, target=TARGET, quality=QUALITY)
        print(f"  saved: axial={n_ax}, coronal={n_co}, sagittal={n_sa}")
        if slices_meta is None:
            slices_meta = {"axial": n_ax, "coronal": n_co, "sagittal": n_sa}

    # ── cross-phase MIP (ITV) ────────────────────────────────────────────────
    print("\nComputing cross-phase aggregates (ITV)...")
    shapes = [v.shape for _, v, _ in phase_volumes]
    if len(set(shapes)) > 1:
        minZ = min(s[0] for s in shapes)
        minY = min(s[1] for s in shapes)
        minX = min(s[2] for s in shapes)
        print(f"  phases have differing shapes {shapes}; cropping to ({minZ},{minY},{minX})")
        stacked = np.stack(
            [v[:minZ, :minY, :minX] for _, v, _ in phase_volumes], axis=0
        )
    else:
        stacked = np.stack([v for _, v, _ in phase_volumes], axis=0)

    aggregate_volumes = {
        "MIP": stacked.max(axis=0),
        "MinIP": stacked.min(axis=0),
        "Avg": stacked.mean(axis=0),
    }
    del stacked  # free ~1.5GB

    mip_out = out / "mip-itv"
    aggregate_meta: dict[str, dict[str, dict[str, int]]] = {}
    for mode_name, vol_hu in aggregate_volumes.items():
        dir_name = AGGREGATE_DIR_NAMES[mode_name]
        saved = save_aggregate_volume(vol_hu, mip_out, dir_name, target=MIP_TARGET, quality=QUALITY)
        aggregate_meta[dir_name] = {
            "axial": {"slices": saved["axial"], "width": MIP_TARGET, "height": MIP_TARGET},
            "coronal": {"slices": saved["coronal"], "width": MIP_TARGET, "height": MIP_TARGET},
            "sagittal": {"slices": saved["sagittal"], "width": MIP_TARGET, "height": MIP_TARGET},
        }
        print(
            f"  {mode_name} saved: "
            f"axial={saved['axial']}, coronal={saved['coronal']}, sagittal={saved['sagittal']}"
        )

    # ── manifest ─────────────────────────────────────────────────────────────
    first_meta = phase_volumes[0][2]
    manifest = {
        "case": study.parent.name,
        "study": study.name,
        "phases": len(phase_volumes),
        "phase_values": [p for p, _, _ in phase_volumes],
        "views": {
            "axial":    {"slices": slices_meta["axial"],    "width": TARGET, "height": TARGET},
            "coronal":  {"slices": slices_meta["coronal"],  "width": TARGET, "height": TARGET},
            "sagittal": {"slices": slices_meta["sagittal"], "width": TARGET, "height": TARGET},
        },
        "mip": aggregate_meta["mip"],
        "aggregates": aggregate_meta,
        "defaults": {"ww": WW, "wl": WL},
        "spacing": {
            "x": first_meta["pixel_spacing_x"],
            "y": first_meta["pixel_spacing_y"],
            "z": first_meta["z_spacing"],
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nDone. Output at: {out.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
