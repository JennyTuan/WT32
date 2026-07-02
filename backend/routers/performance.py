"""Performance evaluation: load phantom DICOM series and compute MTF / FWHM.

Auto-detects high-contrast structures in the volume:
  - For MTF: locates the sharpest edge in a high-gradient region, samples an
    edge-spread function perpendicular to the edge, differentiates to get
    LSF, and FFTs to get the MTF curve.
  - For FWHM: finds the brightest small spot ("bead") and measures the
    horizontal and vertical full-width-at-half-maximum across that peak.
"""
from __future__ import annotations

import io
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pydicom
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image
from scipy import ndimage, signal

from ..database import SessionLocal
from . import logs as logs_router

router = APIRouter(prefix="/performance", tags=["performance"])

DATA_ROOT = Path(__file__).resolve().parent.parent / "data"
PREFERRED_DATASET_IDS = ("CatPhan604", "MTF")
CATPHAN604_CTP528_OFFSET_MM = 40.0
CATPHAN604_LINE_PAIR_RADIUS_MM = 47.0
CATPHAN604_CTP528_COMBINE_SLICES = 3
CATPHAN604_CTP528_WIDTH_RATIO = 0.04
CATPHAN604_CTP528_SAMPLING_RATIO = 2.0
CATPHAN604_ROLL_AIR_THRESHOLD_HU = -500.0
CATPHAN604_ROLL_SEARCH_RADIUS_MM = 85.0
CATPHAN604_ROLL_IGNORE_CENTER_MM = 20.0
CATPHAN604_ROLL_MIN_AREA_MM2 = 40.0
CATPHAN604_ROLL_MAX_AREA_MM2 = 400.0
CATPHAN604_CTP528_SETTINGS = (
    {"start": 0.000, "end": 0.107, "peaks": 2, "valleys": 1, "spacing": 0.021, "lp_mm": 0.1},
    {"start": 0.107, "end": 0.173, "peaks": 3, "valleys": 2, "spacing": 0.010, "lp_mm": 0.2},
    {"start": 0.173, "end": 0.236, "peaks": 4, "valleys": 3, "spacing": 0.006, "lp_mm": 0.3},
    {"start": 0.236, "end": 0.286, "peaks": 4, "valleys": 3, "spacing": 0.00557, "lp_mm": 0.4},
    {"start": 0.286, "end": 0.335, "peaks": 4, "valleys": 3, "spacing": 0.004777, "lp_mm": 0.5},
    {"start": 0.335, "end": 0.387, "peaks": 5, "valleys": 4, "spacing": 0.00398, "lp_mm": 0.6},
    {"start": 0.387, "end": 0.434, "peaks": 5, "valleys": 4, "spacing": 0.00358, "lp_mm": 0.7},
    {"start": 0.434, "end": 0.479, "peaks": 5, "valleys": 4, "spacing": 0.0027866, "lp_mm": 0.8},
)


def _classify_dicom_failure(path: Path, exc: Exception) -> tuple[str, str]:
    """Return (code, friendly_zh_message) for a DICOM read failure."""
    try:
        with path.open("rb") as f:
            head = f.read(132)
        if len(head) < 132 or head[128:132] != b"DICM":
            return "DICOM_INVALID", "影像文件格式错误，无法解析（可能被加密软件锁定或文件已损坏）"
    except PermissionError:
        return "DICOM_PERMISSION_DENIED", "影像文件无法读取，系统权限被拒绝（可能被安全软件锁定）"
    except OSError:
        pass
    return "DICOM_READ_ERROR", f"影像解析失败：{exc}"


# ---------- Dataset discovery ----------

def _series_dir_for_entry(entry: Path) -> Optional[Path]:
    """Return the folder that contains DICOM files for a dataset entry."""
    dicom_dir = entry / "DICOM"
    if dicom_dir.is_dir():
        return dicom_dir
    if entry.is_dir():
        return entry
    return None


def _dataset_sort_key(item: dict[str, Any]) -> tuple[int, int, str]:
    preferred = {name.casefold(): index for index, name in enumerate(PREFERRED_DATASET_IDS)}
    dataset_id = str(item.get("id", ""))
    key = dataset_id.casefold()
    if key in preferred:
        return (0, preferred[key], key)
    return (1, len(preferred), key)


def _list_datasets() -> list[dict[str, Any]]:
    """Find candidate phantom datasets under backend/data/<id>/DICOM or backend/data/<id>."""
    items: list[dict[str, Any]] = []
    if not DATA_ROOT.exists():
        return items
    for entry in sorted(DATA_ROOT.iterdir()):
        if not entry.is_dir():
            continue
        series_dir = _series_dir_for_entry(entry)
        if series_dir is None:
            continue
        files = [f for f in series_dir.iterdir() if f.is_file()]
        if not files:
            continue
        items.append({
            "id": entry.name,
            "name": entry.name,
            "slice_count": len(files),
        })
    return sorted(items, key=_dataset_sort_key)


def _dataset_dir(dataset_id: str) -> Path:
    safe = dataset_id.strip().replace("..", "").replace("/", "").replace("\\", "")
    entry = DATA_ROOT / safe
    d = _series_dir_for_entry(entry)
    if d is None or not any(f.is_file() for f in d.iterdir()):
        raise HTTPException(status_code=404, detail="Dataset not found")
    return d


def _load_series(dataset_id: str) -> tuple[list[pydicom.Dataset], np.ndarray, tuple[float, float]]:
    """Load all slices of a series sorted by InstanceNumber.

    Returns (datasets, volume[N,H,W] in HU, pixel_spacing_mm).
    """
    d = _dataset_dir(dataset_id)
    files = sorted(d.iterdir())
    datasets: list[pydicom.Dataset] = []
    failures: list[tuple[Path, str, str]] = []  # (path, code, message)
    for f in files:
        try:
            datasets.append(pydicom.dcmread(str(f)))
        except Exception as exc:
            code, msg = _classify_dicom_failure(f, exc)
            failures.append((f, code, msg))
            continue

    if failures:
        first_path, first_code, first_msg = failures[0]
        db = SessionLocal()
        try:
            logs_router.write_system_log(
                db,
                level="ERROR" if not datasets else "WARNING",
                source="performance",
                event="performance_dicom_load_failed",
                message=f"性能评估加载 DICOM 失败：{first_path.name} - {first_msg}",
                details=f"dataset={dataset_id}, failed_count={len(failures)}, first_code={first_code}",
            )
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    if not datasets:
        first_path, first_code, first_msg = failures[0] if failures else (None, "DICOM_NOT_FOUND", "未找到可读的影像文件")
        raise HTTPException(
            status_code=422 if first_code == "DICOM_INVALID" else 404,
            detail={
                "code": first_code,
                "message": first_msg,
                "file": first_path.name if first_path else None,
                "failed_count": len(failures),
            },
        )
    datasets.sort(key=lambda ds: int(getattr(ds, "InstanceNumber", 0) or 0))

    slope = float(getattr(datasets[0], "RescaleSlope", 1) or 1)
    intercept = float(getattr(datasets[0], "RescaleIntercept", 0) or 0)
    spacing = getattr(datasets[0], "PixelSpacing", [1.0, 1.0])
    px = (float(spacing[0]), float(spacing[1]))

    volume = np.stack([ds.pixel_array.astype(np.float32) for ds in datasets])
    volume = volume * slope + intercept
    return datasets, volume, px


# ---------- Slice preview ----------

def _to_png(image: np.ndarray, center: float = 60.0, width: float = 400.0) -> bytes:
    lo = center - width / 2
    hi = center + width / 2
    clipped = np.clip((image - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    arr = (clipped * 255.0).astype(np.uint8)
    img = Image.fromarray(arr, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ---------- Analysis ----------

def _select_edge_slice(volume: np.ndarray) -> int:
    """Pick the slice with the strongest single edge (most concentrated gradient)."""
    scores: list[float] = []
    for s in volume:
        gx = ndimage.sobel(s, axis=1)
        gy = ndimage.sobel(s, axis=0)
        mag = np.hypot(gx, gy)
        # use 99.9th percentile so we favor sharpness, not just bulk
        scores.append(float(np.percentile(mag, 99.9)))
    return int(np.argmax(scores))


def _find_edge_roi(slice_img: np.ndarray, roi_size: int = 48) -> tuple[int, int, np.ndarray]:
    """Find a square ROI centered on the highest-gradient pixel (away from border)."""
    gx = ndimage.sobel(slice_img, axis=1)
    gy = ndimage.sobel(slice_img, axis=0)
    mag = np.hypot(gx, gy)
    h, w = mag.shape
    margin = roi_size
    masked = mag.copy()
    masked[:margin, :] = 0
    masked[-margin:, :] = 0
    masked[:, :margin] = 0
    masked[:, -margin:] = 0
    cy, cx = np.unravel_index(int(np.argmax(masked)), mag.shape)
    return int(cy), int(cx), _extract_roi(slice_img, int(cy), int(cx), roi_size)


def _extract_roi(slice_img: np.ndarray, cy: int, cx: int, size: int) -> np.ndarray:
    """Clamp center+size to the image bounds and return the ROI patch."""
    h, w = slice_img.shape
    size = max(16, min(int(size), min(h, w)))
    half = size // 2
    cy = max(half, min(int(cy), h - half))
    cx = max(half, min(int(cx), w - half))
    return slice_img[cy - half:cy + half, cx - half:cx + half]


def _slice_spacing_mm(datasets: list[pydicom.Dataset]) -> float:
    """Estimate z spacing from DICOM positions, falling back to SliceThickness."""
    positions: list[float] = []
    for ds in datasets:
        pos = getattr(ds, "ImagePositionPatient", None)
        if pos is not None and len(pos) >= 3:
            try:
                positions.append(float(pos[2]))
                continue
            except (TypeError, ValueError):
                pass
        location = getattr(ds, "SliceLocation", None)
        if location is not None:
            try:
                positions.append(float(location))
            except (TypeError, ValueError):
                pass
    if len(positions) > 1:
        diffs = np.diff(np.array(positions, dtype=np.float64))
        diffs = np.abs(diffs[np.abs(diffs) > 1e-6])
        if diffs.size:
            return float(np.median(diffs))
    thickness = getattr(datasets[0], "SliceThickness", 1.0) if datasets else 1.0
    try:
        return max(float(thickness), 1e-6)
    except (TypeError, ValueError):
        return 1.0


def _find_phantom_center(slice_img: np.ndarray) -> tuple[float, float]:
    """Find the center of the largest non-air component in a CatPhan slice."""
    mask = slice_img > -500.0
    labels, count = ndimage.label(mask)
    if count < 1:
        h, w = slice_img.shape
        return (w - 1) / 2.0, (h - 1) / 2.0
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    label = int(np.argmax(sizes)) + 1
    cy, cx = ndimage.center_of_mass(mask, labels, label)
    if not np.isfinite(cx) or not np.isfinite(cy):
        h, w = slice_img.shape
        return (w - 1) / 2.0, (h - 1) / 2.0
    return float(cx), float(cy)


def _combine_surrounding_slices(volume: np.ndarray, index: int, plusminus: int) -> np.ndarray:
    """Combine a target slice with neighboring slices using CatPhan CTP528 max projection."""
    start = max(0, int(index) - int(plusminus))
    end = min(volume.shape[0], int(index) + int(plusminus) + 1)
    return np.max(volume[start:end], axis=0)


def _collapsed_circle_profile(
    image: np.ndarray,
    center_x: float,
    center_y: float,
    radius_px: float,
    start_angle: float = np.pi,
    width_ratio: float = CATPHAN604_CTP528_WIDTH_RATIO,
    sampling_ratio: float = CATPHAN604_CTP528_SAMPLING_RATIO,
) -> np.ndarray:
    """Sample and average a thick circular CatPhan line-pair profile."""
    outer_radius = radius_px * (1.0 + width_ratio)
    size = np.pi * outer_radius * 2.0 * sampling_ratio
    interval = (2.0 * np.pi) / max(size, 1.0)
    radians = np.arange(start_angle, (2.0 * np.pi) + start_angle - interval, interval)
    radians = radians[::-1]
    values = np.zeros(len(radians), dtype=np.float64)
    radii = np.linspace(
        radius_px * (1.0 - width_ratio),
        radius_px * (1.0 + width_ratio),
        num=20,
    )
    for radius in radii:
        xs = np.cos(radians) * radius + center_x
        ys = np.sin(radians) * radius + center_y
        values += ndimage.map_coordinates(image, [ys, xs], order=0, mode="nearest")
    values /= float(len(radii))
    sigma = max(int(round(0.001 * len(values))), 1)
    values = ndimage.gaussian_filter1d(values, sigma=sigma)
    values -= float(values.min())
    return values


def _profile_peaks(
    values: np.ndarray,
    min_distance: float,
    max_number: int,
    search_region: tuple[float, float],
    threshold: float = 0.3,
) -> tuple[np.ndarray, np.ndarray]:
    """Find the strongest peaks in a fractional profile region."""
    value_range = float(values.max() - values.min())
    min_height = float(values.min() + threshold * value_range)
    distance = max(int(min_distance * len(values)), 1)
    if max(search_region) <= 1:
        start = int(search_region[0] * len(values))
        end = int(search_region[1] * len(values))
    else:
        start = int(search_region[0])
        end = int(search_region[1])
    start = max(0, min(start, len(values) - 1))
    end = max(start + 1, min(end, len(values)))
    peak_idx, props = signal.find_peaks(
        values[start:end],
        height=min_height,
        distance=distance,
        prominence=(None, None),
    )
    peak_idx = peak_idx + start
    if peak_idx.size == 0:
        return peak_idx, np.array([], dtype=np.float64)
    sort_values = props.get("prominences", props["peak_heights"])
    keep = np.argsort(sort_values)[::-1][:max_number]
    keep = sorted(keep)
    return peak_idx[keep], props["peak_heights"][keep]


def _profile_valleys(
    values: np.ndarray,
    min_distance: float,
    max_number: int,
    search_region: tuple[float, float],
) -> tuple[np.ndarray, np.ndarray]:
    valley_idx, _ = _profile_peaks(-values, min_distance, max_number, search_region)
    return valley_idx, values[valley_idx]


def _michelson(maximum: float, minimum: float) -> float:
    denominator = maximum + minimum
    if abs(denominator) < 1e-12:
        return 0.0
    return float((maximum - minimum) / denominator)


def _frequency_at_relative_mtf(
    frequencies: np.ndarray,
    relative_mtf: np.ndarray,
    target: float,
) -> Optional[float]:
    """Interpolate frequency where relative MTF reaches target."""
    if frequencies.size < 2 or relative_mtf.size < 2:
        return None
    target_value = target / 100.0
    order = np.argsort(relative_mtf)
    mtf_sorted = relative_mtf[order]
    freq_sorted = frequencies[order]
    if target_value < float(mtf_sorted[0]) or target_value > float(mtf_sorted[-1]):
        return None
    return float(np.interp(target_value, mtf_sorted, freq_sorted))


def _catphan_origin_slice_index(volume: np.ndarray) -> int:
    """Return a stable origin estimate for public CatPhan demo-style stacks."""
    return max(0, min(volume.shape[0] - 1, (volume.shape[0] // 2) + 1))


def _estimate_catphan_roll_deg(slice_img: np.ndarray, px_mm: float) -> float:
    """Estimate CatPhan roll from the two central air bubbles in the HU module."""
    center_x, center_y = _find_phantom_center(slice_img)
    yy, xx = np.indices(slice_img.shape)
    distance_mm = np.hypot(xx - center_x, yy - center_y) * px_mm
    mask = (
        (slice_img < CATPHAN604_ROLL_AIR_THRESHOLD_HU)
        & (distance_mm < CATPHAN604_ROLL_SEARCH_RADIUS_MM)
        & (distance_mm > CATPHAN604_ROLL_IGNORE_CENTER_MM)
    )
    labels, count = ndimage.label(mask)
    components: list[tuple[float, float, float]] = []
    pixel_area_mm2 = px_mm * px_mm
    for label in range(1, count + 1):
        area_mm2 = float(np.sum(labels == label)) * pixel_area_mm2
        if not (CATPHAN604_ROLL_MIN_AREA_MM2 <= area_mm2 <= CATPHAN604_ROLL_MAX_AREA_MM2):
            continue
        cy, cx = ndimage.center_of_mass(mask, labels, label)
        if np.isfinite(cx) and np.isfinite(cy):
            components.append((float(cx), float(cy), abs(float(cx) - center_x)))
    if len(components) < 2:
        return 0.0

    central_bubbles = sorted(components, key=lambda item: item[2])[:2]
    top, bottom = sorted(central_bubbles, key=lambda item: item[1])
    y_dist = bottom[1] - top[1]
    x_dist = bottom[0] - top[0]
    return float(np.rad2deg(np.arctan2(y_dist, x_dist)) - 90.0)


def _compute_catphan604_mtf(
    datasets: list[pydicom.Dataset],
    volume: np.ndarray,
    px_mm: float,
    mtf_slice: Optional[int] = None,
    mtf_x: Optional[int] = None,
    mtf_y: Optional[int] = None,
) -> dict[str, Any]:
    """Compute CatPhan604 CTP528 line-pair relative MTF."""
    slice_spacing = _slice_spacing_mm(datasets)
    origin_slice = _catphan_origin_slice_index(volume)
    if mtf_slice is None:
        ctp528_slice = origin_slice + round(CATPHAN604_CTP528_OFFSET_MM / slice_spacing)
    else:
        ctp528_slice = int(mtf_slice)
    ctp528_slice = max(0, min(ctp528_slice, volume.shape[0] - 1))

    ctp528_image = _combine_surrounding_slices(
        volume,
        ctp528_slice,
        CATPHAN604_CTP528_COMBINE_SLICES,
    )
    if mtf_x is None or mtf_y is None:
        center_x, center_y = _find_phantom_center(ctp528_image)
    else:
        center_x, center_y = float(mtf_x), float(mtf_y)

    radius_px = CATPHAN604_LINE_PAIR_RADIUS_MM / max(px_mm, 1e-6)
    roll_deg = _estimate_catphan_roll_deg(volume[origin_slice], px_mm)
    profile = _collapsed_circle_profile(
        ctp528_image,
        center_x,
        center_y,
        radius_px,
        start_angle=np.pi + np.deg2rad(roll_deg),
    )

    maximums: list[float] = []
    minimums: list[float] = []
    frequencies_lp_cm: list[float] = []
    regions: list[dict[str, Any]] = []
    for index, setting in enumerate(CATPHAN604_CTP528_SETTINGS, start=1):
        peak_idx, peak_values = _profile_peaks(
            profile,
            float(setting["spacing"]),
            int(setting["peaks"]),
            (float(setting["start"]), float(setting["end"])),
        )
        if peak_values.size != int(setting["peaks"]):
            break
        valley_idx, valley_values = _profile_valleys(
            profile,
            float(setting["spacing"]),
            int(setting["valleys"]),
            (float(np.min(peak_idx)), float(np.max(peak_idx))),
        )
        if valley_values.size != int(setting["valleys"]):
            break
        maximum = float(np.mean(peak_values))
        minimum = float(np.mean(valley_values))
        lp_cm = float(setting["lp_mm"]) * 10.0
        maximums.append(maximum)
        minimums.append(minimum)
        frequencies_lp_cm.append(lp_cm)
        regions.append({
            "region": index,
            "lp_cm": lp_cm,
            "maximum": maximum,
            "minimum": minimum,
        })

    if len(frequencies_lp_cm) < 2:
        raise ValueError("CatPhan604 CTP528 line pairs could not be resolved")

    raw_mtf = np.array([
        _michelson(maximum, minimum)
        for maximum, minimum in zip(maximums, minimums)
    ], dtype=np.float64)
    relative_mtf = raw_mtf / max(float(raw_mtf[0]), 1e-12)
    frequencies = np.array(frequencies_lp_cm, dtype=np.float64)

    return {
        "freq": frequencies.tolist(),
        "mtf": relative_mtf.tolist(),
        "mtf50": _frequency_at_relative_mtf(frequencies, relative_mtf, 50.0),
        "mtf10": _frequency_at_relative_mtf(frequencies, relative_mtf, 10.0),
        "unit": "lp/cm",
        "method": "catphan604_ctp528_line_pair",
        "slice_index": int(ctp528_slice),
        "roi_x": int(round(center_x)),
        "roi_y": int(round(center_y)),
        "roi_size": int(round(radius_px * 2.0)),
        "catphan_roll_deg": float(roll_deg),
        "profile_radius_px": float(radius_px),
        "line_pair_regions": regions,
    }


def _compute_mtf(roi: np.ndarray, px_mm: float) -> dict[str, Any]:
    """Compute MTF curve via the Edge Spread Function method.

    Assumes a roughly straight high-contrast edge in the ROI. Estimates the
    edge angle from gradient, projects pixel positions onto the edge normal to
    build a super-sampled ESF, differentiates to LSF, FFTs to MTF.
    """
    gx = ndimage.sobel(roi, axis=1)
    gy = ndimage.sobel(roi, axis=0)
    mag = np.hypot(gx, gy)
    # Edge orientation (normal direction): weighted average gradient angle
    weights = mag.flatten()
    ang_x = float(np.sum(gx.flatten() * weights))
    ang_y = float(np.sum(gy.flatten() * weights))
    if ang_x == 0 and ang_y == 0:
        # Degenerate ROI — return decaying placeholder
        f = np.linspace(0, 1.0 / (2 * px_mm), 32)
        return {
            "freq": f.tolist(),
            "mtf": np.exp(-f * 3.0).tolist(),
            "mtf50": float(np.log(2) / 3.0),
            "mtf10": float(np.log(10) / 3.0),
            "unit": "lp/cm",
        }
    norm_len = np.hypot(ang_x, ang_y)
    nx = ang_x / norm_len
    ny = ang_y / norm_len

    h, w = roi.shape
    ys, xs = np.indices(roi.shape)
    cx = (w - 1) / 2.0
    cy = (h - 1) / 2.0
    # Signed distance from ROI center along edge normal (in pixels)
    dist = (xs - cx) * nx + (ys - cy) * ny

    # Build super-sampled ESF
    sub = 4
    dmin = float(dist.min())
    dmax = float(dist.max())
    bins = np.arange(dmin, dmax + 1.0 / sub, 1.0 / sub)
    bin_idx = np.digitize(dist.flatten(), bins) - 1
    bin_idx = np.clip(bin_idx, 0, len(bins) - 1)
    sums = np.bincount(bin_idx, weights=roi.flatten(), minlength=len(bins))
    counts = np.bincount(bin_idx, minlength=len(bins))
    valid = counts > 0
    esf = np.zeros_like(sums)
    esf[valid] = sums[valid] / counts[valid]
    # Fill empty bins by interpolation
    if not valid.all():
        idx = np.arange(len(esf))
        esf = np.interp(idx, idx[valid], esf[valid])

    # Smooth ESF lightly
    esf = ndimage.gaussian_filter1d(esf, sigma=1.2)
    # LSF = derivative of ESF. abs() so we don't depend on the edge polarity.
    lsf = np.abs(np.diff(esf))
    # Center the LSF on its peak so windowing keeps the signal
    peak = int(np.argmax(lsf))
    radius = min(peak, len(lsf) - 1 - peak, 64)
    if radius < 6:
        radius = min(len(lsf) // 2, 32)
        peak = len(lsf) // 2
    lsf_c = lsf[peak - radius:peak + radius + 1]
    # Window to suppress wrap-around
    window = np.hanning(len(lsf_c))
    lsf_w = lsf_c * window
    # FFT, keep DC so we can normalize by MTF(0)
    N = max(256, len(lsf_w) * 2)
    spectrum = np.abs(np.fft.rfft(lsf_w, n=N))
    dc = spectrum[0] if spectrum[0] > 0 else spectrum.max()
    mtf = spectrum / max(dc, 1e-12)
    mtf = np.clip(mtf, 0.0, 1.0)

    # Frequency axis (cycles per mm), then convert to lp/cm
    dx_mm = px_mm / sub
    freq_per_mm = np.fft.rfftfreq(N, d=dx_mm)
    freq_lpcm = freq_per_mm * 10.0  # 1 cycle/mm = 10 lp/cm

    # Trim to displayable range
    keep = freq_lpcm <= 25.0
    freq_out = freq_lpcm[keep]
    mtf_out = mtf[keep]

    def _crossing(target: float) -> Optional[float]:
        for i in range(1, len(mtf_out)):
            if mtf_out[i - 1] >= target >= mtf_out[i]:
                # Linear interpolation
                m0, m1 = mtf_out[i - 1], mtf_out[i]
                f0, f1 = freq_out[i - 1], freq_out[i]
                if m0 == m1:
                    return float(f0)
                t = (m0 - target) / (m0 - m1)
                return float(f0 + t * (f1 - f0))
        return None

    return {
        "freq": freq_out.tolist(),
        "mtf": mtf_out.tolist(),
        "mtf50": _crossing(0.5),
        "mtf10": _crossing(0.1),
        "unit": "lp/cm",
    }


def _find_peak_voxel(volume: np.ndarray) -> tuple[int, int, int]:
    """Locate a small high-contrast spot using a Laplacian-of-Gaussian blob filter.

    LoG favors compact bright structures, which is what we need for a usable
    point-spread sample. Falls back to the global max if no clear blob exists.
    """
    # White top-hat highlights small bright structures (peak minus the local
    # background from a wider neighborhood). Multiply by the absolute HU so
    # we prefer dense (bone/metal-like) peaks over lung-air rim artifacts.
    smoothed = ndimage.gaussian_filter(volume, sigma=(0.0, 0.6, 0.6))
    background = ndimage.uniform_filter(smoothed, size=(1, 11, 11))
    tophat = smoothed - background
    # Penalize peaks that sit in low-HU regions (air / lung)
    score = tophat * np.clip(smoothed + 1024.0, 0.0, None) / 4096.0
    margin = 20
    masked = score.copy()
    masked[:, :margin, :] = -np.inf
    masked[:, -margin:, :] = -np.inf
    masked[:, :, :margin] = -np.inf
    masked[:, :, -margin:] = -np.inf
    idx = np.unravel_index(int(np.argmax(masked)), masked.shape)
    return int(idx[0]), int(idx[1]), int(idx[2])


def _fwhm_along(profile: np.ndarray) -> float:
    """Compute FWHM (in pixels) of a 1D peak profile."""
    if profile.size < 5:
        return 0.0
    baseline = float(np.percentile(profile, 10))
    peak_val = float(profile.max())
    if peak_val - baseline < 1e-6:
        return 0.0
    half = baseline + (peak_val - baseline) / 2.0
    peak_idx = int(np.argmax(profile))

    def _interp_cross(start: int, step: int) -> Optional[float]:
        i = start
        while 0 <= i + step < len(profile) and 0 <= i < len(profile):
            if (profile[i] - half) * (profile[i + step] - half) <= 0:
                p0 = float(profile[i])
                p1 = float(profile[i + step])
                if p1 == p0:
                    return float(i)
                t = (half - p0) / (p1 - p0)
                return float(i + t * step)
            i += step
        return None

    left = _interp_cross(peak_idx, -1)
    right = _interp_cross(peak_idx, 1)
    # Tolerate asymmetric peaks (e.g. plateau on one side): double the
    # half-width that we can measure.
    if left is not None and right is not None:
        return max(right - left, 0.0)
    if left is not None:
        return max(2.0 * (peak_idx - left), 0.0)
    if right is not None:
        return max(2.0 * (right - peak_idx), 0.0)
    return 0.0


def _compute_fwhm(
    volume: np.ndarray,
    px_mm: float,
    override: Optional[tuple[int, int, int]] = None,
) -> dict[str, Any]:
    if override is not None:
        pz, py, px = override
        h, w = volume.shape[1], volume.shape[2]
        pz = max(0, min(int(pz), volume.shape[0] - 1))
        py = max(0, min(int(py), h - 1))
        px = max(0, min(int(px), w - 1))
    else:
        pz, py, px = _find_peak_voxel(volume)
    slice_img = volume[pz]
    h, w = slice_img.shape
    half_w = min(25, py, h - 1 - py, px, w - 1 - px)
    if half_w < 5:
        half_w = min(15, py, h - 1 - py, px, w - 1 - px)
    h_profile = slice_img[py, px - half_w:px + half_w + 1].astype(np.float64)
    v_profile = slice_img[py - half_w:py + half_w + 1, px].astype(np.float64)

    fwhm_h_px = _fwhm_along(h_profile)
    fwhm_v_px = _fwhm_along(v_profile)

    def _profile_points(profile: np.ndarray) -> list[dict[str, float]]:
        return [{"x": float(i), "y": float(profile[i])} for i in range(profile.size)]

    return {
        "slice_index": pz,
        "peak": {"row": py, "col": px, "value": float(slice_img[py, px])},
        "horizontal": {
            "points": _profile_points(h_profile),
            "fwhm_pixels": fwhm_h_px,
            "fwhm_mm": fwhm_h_px * px_mm,
            "center": (h_profile.size - 1) / 2.0,
        },
        "vertical": {
            "points": _profile_points(v_profile),
            "fwhm_pixels": fwhm_v_px,
            "fwhm_mm": fwhm_v_px * px_mm,
            "center": (v_profile.size - 1) / 2.0,
        },
        "unit_x": "Pixel",
        "unit_y": "HU",
    }


# ---------- Routes ----------

@router.get("/datasets")
def list_datasets() -> dict[str, Any]:
    return {"datasets": _list_datasets()}


@router.get("/dataset/{dataset_id}/slices")
def dataset_slices(dataset_id: str) -> dict[str, Any]:
    datasets, _, spacing = _load_series(dataset_id)
    slices = []
    for i, ds in enumerate(datasets):
        slices.append({
            "index": i,
            "instance_number": int(getattr(ds, "InstanceNumber", i + 1) or i + 1),
            "thickness": float(getattr(ds, "SliceThickness", 0) or 0),
        })
    wc = getattr(datasets[0], "WindowCenter", 60)
    ww = getattr(datasets[0], "WindowWidth", 400)
    if isinstance(wc, pydicom.multival.MultiValue):
        wc = wc[0]
    if isinstance(ww, pydicom.multival.MultiValue):
        ww = ww[0]
    return {
        "dataset_id": dataset_id,
        "slice_count": len(datasets),
        "pixel_spacing_mm": list(spacing),
        "rows": int(getattr(datasets[0], "Rows", 512)),
        "columns": int(getattr(datasets[0], "Columns", 512)),
        "default_window_center": float(wc),
        "default_window_width": float(ww),
        "slices": slices,
    }


@router.get("/dataset/{dataset_id}/slice/{index}/preview.png")
def slice_preview(
    dataset_id: str,
    index: int,
    wc: float = 60.0,
    ww: float = 400.0,
) -> StreamingResponse:
    _, volume, _ = _load_series(dataset_id)
    if index < 0 or index >= len(volume):
        raise HTTPException(status_code=404, detail="Slice index out of range")
    data = _to_png(volume[index], center=wc, width=ww)
    return StreamingResponse(io.BytesIO(data), media_type="image/png")


@router.post("/dataset/{dataset_id}/analyze")
def analyze(
    dataset_id: str,
    mtf_slice: Optional[int] = None,
    mtf_x: Optional[int] = None,
    mtf_y: Optional[int] = None,
    mtf_size: int = 48,
    fwhm_slice: Optional[int] = None,
    fwhm_x: Optional[int] = None,
    fwhm_y: Optional[int] = None,
) -> dict[str, Any]:
    datasets, volume, spacing = _load_series(dataset_id)
    px_mm = float(spacing[0])

    # MTF: CatPhan604 uses the CTP528 line-pair module; other datasets fall
    # back to the older edge-spread reference method.
    catphan604_mtf = dataset_id.casefold() == "catphan604"
    if catphan604_mtf:
        try:
            mtf_result = _compute_catphan604_mtf(
                datasets,
                volume,
                px_mm,
                mtf_slice=mtf_slice,
                mtf_x=mtf_x,
                mtf_y=mtf_y,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "CATPHAN_MTF_FAILED",
                    "message": str(exc),
                },
            ) from exc
        edge_slice_idx = int(mtf_result["slice_index"])
        roi_cx = int(mtf_result["roi_x"])
        roi_cy = int(mtf_result["roi_y"])
        roi_size_eff = max(
            16,
            min(int(mtf_result.get("roi_size", mtf_size)), min(volume.shape[1], volume.shape[2])),
        )
    else:
        if mtf_slice is not None:
            edge_slice_idx = max(0, min(int(mtf_slice), volume.shape[0] - 1))
        else:
            edge_slice_idx = _select_edge_slice(volume)
        if mtf_x is not None and mtf_y is not None:
            roi_cy, roi_cx = int(mtf_y), int(mtf_x)
            roi = _extract_roi(volume[edge_slice_idx], roi_cy, roi_cx, mtf_size)
        else:
            roi_cy, roi_cx, roi = _find_edge_roi(volume[edge_slice_idx], roi_size=mtf_size)
        mtf_result = _compute_mtf(roi, px_mm)
        roi_size_eff = max(16, min(int(mtf_size), min(volume.shape[1], volume.shape[2])))

    # FWHM: user-specified peak if provided, else auto-detect.
    fwhm_override: Optional[tuple[int, int, int]] = None
    if fwhm_slice is not None and fwhm_x is not None and fwhm_y is not None:
        fwhm_override = (int(fwhm_slice), int(fwhm_y), int(fwhm_x))
    fwhm_result = _compute_fwhm(volume, px_mm, override=fwhm_override)

    # Map MTF curve into "points" array consistent with frontend (x=freq, y=mtf)
    mtf_points = [
        {"x": f, "y": m}
        for f, m in zip(mtf_result["freq"], mtf_result["mtf"])
    ]

    return {
        "dataset_id": dataset_id,
        "pixel_spacing_mm": list(spacing),
        "edge_slice_index": edge_slice_idx,
        "mtf": {
            "title": "空间分辨率 (MTF)",
            "subtitle": (
                "CatPhan CTP528 线对模块相对 MTF（参考评估，需确认）。"
                if catphan604_mtf
                else "基于高对比边缘的参考 MTF（ESF→LSF→FFT，需确认）。"
            ),
            "unit": mtf_result.get("unit", "lp/cm"),
            "y_label": "MTF",
            "points": mtf_points,
            "mtf50": mtf_result["mtf50"],
            "mtf10": mtf_result["mtf10"],
            "roi_x": int(roi_cx),
            "roi_y": int(roi_cy),
            "roi_size": int(roi_size_eff),
            "method": mtf_result.get("method", "edge_esf"),
            "catphan_roll_deg": mtf_result.get("catphan_roll_deg"),
            "profile_radius_px": mtf_result.get("profile_radius_px"),
            "line_pair_regions": mtf_result.get("line_pair_regions"),
        },
        "fwhm_h": {
            "title": "水平半高宽 (FWHM_H)",
            "subtitle": "穿过最高对比点的水平方向扩散响应。",
            "unit": "Pixel",
            "y_label": "HU",
            "points": fwhm_result["horizontal"]["points"],
            "fwhm_pixels": fwhm_result["horizontal"]["fwhm_pixels"],
            "fwhm_mm": fwhm_result["horizontal"]["fwhm_mm"],
            "peak_center": fwhm_result["horizontal"]["center"],
        },
        "fwhm_v": {
            "title": "垂直半高宽 (FWHM_V)",
            "subtitle": "穿过最高对比点的垂直方向扩散响应。",
            "unit": "Pixel",
            "y_label": "HU",
            "points": fwhm_result["vertical"]["points"],
            "fwhm_pixels": fwhm_result["vertical"]["fwhm_pixels"],
            "fwhm_mm": fwhm_result["vertical"]["fwhm_mm"],
            "peak_center": fwhm_result["vertical"]["center"],
        },
        "peak_slice_index": fwhm_result["slice_index"],
        "peak_row": fwhm_result["peak"]["row"],
        "peak_col": fwhm_result["peak"]["col"],
    }
