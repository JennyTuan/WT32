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
from scipy import ndimage

from ..database import SessionLocal
from . import logs as logs_router

router = APIRouter(prefix="/performance", tags=["performance"])

DATA_ROOT = Path(__file__).resolve().parent.parent / "data"
PREFERRED_DATASET_IDS = ("MTF",)


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

    # MTF: user-specified slice + ROI center if provided, else auto-detect.
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

    roi_size_eff = max(16, min(int(mtf_size), min(volume.shape[1], volume.shape[2])))

    return {
        "dataset_id": dataset_id,
        "pixel_spacing_mm": list(spacing),
        "edge_slice_index": edge_slice_idx,
        "mtf": {
            "title": "空间分辨率 (MTF)",
            "subtitle": "基于自动检测高对比边缘 (ESF→LSF→FFT)。",
            "unit": "lp/cm",
            "y_label": "MTF",
            "points": mtf_points,
            "mtf50": mtf_result["mtf50"],
            "mtf10": mtf_result["mtf10"],
            "roi_x": int(roi_cx),
            "roi_y": int(roi_cy),
            "roi_size": int(roi_size_eff),
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
