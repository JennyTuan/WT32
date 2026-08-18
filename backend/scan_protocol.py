"""Shared 0x0B scan-plan limits from the current UI communication protocol."""

from __future__ import annotations

KV_OPTIONS = {80, 100, 120, 140}
FOCUS_SIZES = {"small", "large"}
BOWTIE_TYPES = {"small", "medium", "large"}
MA_LIMITS = {
    "small": {80: 310, 100: 280, 120: 240, 140: 200},
    "large": {80: 350, 100: 350, 120: 350, 140: 300},
}
SCAN_LENGTH_MIN_MM = 10.0
SCAN_LENGTH_MAX_MM = 2000.0
PITCH_MIN = 0.2
PITCH_MAX = 2.0
ROTATION_TIME_MIN_S = 0.25
ROTATION_TIME_MAX_S = 2.0


def max_ma(kv: int, focus_size: str) -> int:
    return MA_LIMITS[focus_size][kv]


def _validate_optional_range(values: dict, field: str, minimum: float, maximum: float) -> None:
    value = values.get(field)
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum:
        raise ValueError(f"{field} must be between {minimum:g} and {maximum:g}")


def validate_scan_plan(values: dict) -> None:
    """Reject a scan-plan combination outside the supplied device protocol."""
    kv = values.get("kv")
    focus_size = values.get("focus_size", "small")
    bowtie_type = values.get("bowtie_type", "medium")
    ma = values.get("ma")
    if kv not in KV_OPTIONS:
        raise ValueError("kv must be one of 80, 100, 120, or 140")
    if focus_size not in FOCUS_SIZES:
        raise ValueError("focus_size must be small or large")
    if bowtie_type not in BOWTIE_TYPES:
        raise ValueError("bowtie_type must be small, medium, or large")
    # 0x0B PlanScanStart permits 1 mA increments.  The 10 mA step belongs to
    # the separate 0x22 service-scan command and must not constrain protocols.
    if not isinstance(ma, int) or ma < 1:
        raise ValueError("ma must be an integer value of at least 1")
    if ma > max_ma(kv, focus_size):
        raise ValueError(f"ma exceeds the {focus_size} focus limit for {kv} kV")
    _validate_optional_range(values, "scan_length", SCAN_LENGTH_MIN_MM, SCAN_LENGTH_MAX_MM)
    _validate_optional_range(values, "pitch", PITCH_MIN, PITCH_MAX)
    _validate_optional_range(values, "rotation_time", ROTATION_TIME_MIN_S, ROTATION_TIME_MAX_S)
    if values.get("step_count") is not None and (
        isinstance(values["step_count"], bool)
        or not isinstance(values["step_count"], int)
        or values["step_count"] < 1
    ):
        raise ValueError("step_count must be an integer of at least 1")
