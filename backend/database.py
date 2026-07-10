from __future__ import annotations

import csv
from datetime import date, datetime
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import declarative_base, sessionmaker


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE_URL = "sqlite:///./backend/app.db"
load_dotenv(PROJECT_ROOT / ".env")


def _normalize_database_url(database_url: str) -> str:
    """让通用 PostgreSQL URL 明确使用项目安装的 psycopg 3 驱动。"""
    database_url = database_url.strip() or DEFAULT_DATABASE_URL
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://", "postgresql+psycopg://", 1
        )
    parsed_url = make_url(database_url)
    if parsed_url.get_backend_name() == "postgresql" and "@" in (parsed_url.host or ""):
        raise ValueError(
            "DATABASE_URL 的密码包含未编码的 @；请将 @ 写成 %40。"
        )
    return database_url


SQLALCHEMY_DATABASE_URL = _normalize_database_url(
    os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
)

_engine_options: dict = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    _engine_options["connect_args"] = {"check_same_thread": False}
else:
    _engine_options["pool_pre_ping"] = True

engine = create_engine(SQLALCHEMY_DATABASE_URL, **_engine_options)

CSV_PROTOCOL_DESCRIPTION_PREFIX = "protocol-csv:"


if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

TOP0GRAM_DEFAULTS = {
    "kv": 120,
    "ma": 30,
    "scan_length": 80.0,
    "tube_angle": 270.0,
    "fov": 500.0,
    "ctdi_vol": None,
    "dlp": None,
}

AXIAL_RECON_SLICE_OPTIONS = (0.6, 1.2, 2.4, 4.8, 9.6)
HELICAL_RECON_SLICE_OPTIONS = tuple(float(value) for value in range(1, 11))


def _nearest_recon_slice_thickness(series_kind: str, value: float | None) -> float | None:
    if value is None:
        return None
    candidates = {
        "axial": AXIAL_RECON_SLICE_OPTIONS,
        "helical": HELICAL_RECON_SLICE_OPTIONS,
    }.get(series_kind)
    if not candidates:
        return value
    return min(candidates, key=lambda candidate: abs(candidate - value))


def _normalize_recon_spacing(
    series_kind: str,
    slice_thickness: float | None,
    increment: float | None,
) -> tuple[float | None, float | None]:
    # 规则只约束轴扫/螺旋重建参数；层厚和层间隔必须保持一致。
    normalized = _nearest_recon_slice_thickness(series_kind, slice_thickness)
    if series_kind in {"axial", "helical"}:
        return normalized, normalized
    return slice_thickness, increment

GATING_PROTOCOL_NAMES = {
    "胸腔深吸气屏息（断层）",
    "胸腔深吸气屏息（螺旋）",
    "胸腔自由呼吸（轴扫）",
}

GATING_PROTOCOL_BREATHING_MODE = {
    "胸腔深吸气屏息（断层）": "breath_hold_inspiration",
    "胸腔深吸气屏息（螺旋）": "breath_hold_inspiration",
    "胸腔自由呼吸（轴扫）": "free_breathing",
}


def recon(
    name: str,
    kernel: str,
    matrix: int,
    window_width: int,
    window_level: int,
    slice_thickness: float,
    increment: float | None,
) -> dict:
    return {
        "name": name,
        "kernel": kernel,
        "matrix": matrix,
        "window_width": window_width,
        "window_level": window_level,
        "slice_thickness": slice_thickness,
        "increment": increment,
    }


HEAD_PROTOCOLS = [
    {
        "name": "脑部螺旋",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 215, "slice_thickness": 5.0, "pitch": 0.5, "rotation_time": 1.0, "scan_length": 165.0, "fov": 250.0, "ctdi_vol": 59.4, "dlp": 1168.5, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 100, 40, 5.0, 5.0),
            recon("骨骼", "Bone2", 512, 3500, 600, 5.0, 5.0),
        ],
    },
    {
        "name": "脑部轴位2D",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {"kv": 120, "ma": 200, "slice_thickness": 2.4, "slice_interval": 19.2, "rotation_time": 2.0, "scan_length": 173.0, "fov": 250.0, "ctdi_vol": 55.2, "dlp": 954.96, "step_count": 9, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 100, 600, 2.4, 2.4),
            recon("骨骼", "Bone2", 512, 3500, 600, 2.4, 2.4),
        ],
    },
    {
        "name": "脑部轴位4.5mm",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {"kv": 120, "ma": 200, "slice_thickness": 4.8, "slice_interval": 19.2, "rotation_time": 2.0, "scan_length": 173.0, "fov": 250.0, "ctdi_vol": 55.2, "dlp": 954.96, "step_count": 9, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 100, 600, 4.8, 4.8),
            recon("骨骼", "Bone2", 512, 3500, 600, 4.8, 4.8),
        ],
    },
    {
        "name": "窦静脉/面部/眼眶",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 290, "slice_thickness": 2.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 98.0, "fov": 220.0, "ctdi_vol": 35.0, "dlp": 343.0, "auto_ma": False},
        "recons": [
            recon("软组织", "S2", 512, 400, 40, 2.0, 2.0),
            recon("骨骼", "Bone2", 512, 4000, 600, 2.0, 2.0),
        ],
    },
    {
        "name": "牙齿",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 130, "slice_thickness": 0.6, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 98.0, "fov": 200.0, "ctdi_vol": 29.9, "dlp": 293.02, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
    {
        "name": "IAC",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 200, "slice_thickness": 1.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 48.0, "fov": 200.0, "ctdi_vol": 46.0, "dlp": 220.8, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
    {
        "name": "IAC 0-6yrs",
        "age_group": "child",
        "patient_weight": "20-30kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 155, "slice_thickness": 1.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 48.0, "fov": 200.0, "ctdi_vol": 35.7, "dlp": 171.36, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
    {
        "name": "IAC 6yrs+",
        "age_group": "child",
        "patient_weight": "40-50kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 180, "slice_thickness": 1.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 48.0, "fov": 200.0, "ctdi_vol": 41.4, "dlp": 198.72, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
    {
        "name": "脑部轴位0-18m",
        "age_group": "infant",
        "patient_weight": "<10kg",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {"kv": 120, "ma": 192, "slice_thickness": 2.4, "slice_interval": 19.2, "rotation_time": 1.0, "scan_length": 135.0, "fov": 200.0, "ctdi_vol": 26.5, "dlp": 357.75, "step_count": 7, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 100, 40, 2.4, 2.4),
            recon("骨骼", "Bone2", 512, 3500, 600, 2.4, 2.4),
        ],
    },
    {
        "name": "脑部轴位18m-6y",
        "age_group": "child",
        "patient_weight": "20-30kg",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {"kv": 120, "ma": 205, "slice_thickness": 2.4, "slice_interval": 19.2, "rotation_time": 1.0, "scan_length": 135.0, "fov": 200.0, "ctdi_vol": 32.1, "dlp": 433.35, "step_count": 7, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 100, 40, 2.4, 2.4),
            recon("骨骼", "Bone2", 512, 3500, 600, 2.4, 2.4),
        ],
    },
    {
        "name": "脑部轴位6yrs+",
        "age_group": "child",
        "patient_weight": "40-50kg",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {"kv": 120, "ma": 235, "slice_thickness": 2.4, "slice_interval": 19.2, "rotation_time": 1.0, "scan_length": 135.0, "fov": 200.0, "ctdi_vol": 36.8, "dlp": 496.8, "step_count": 7, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 100, 40, 2.4, 2.4),
            recon("骨骼", "Bone2", 512, 3500, 600, 2.4, 2.4),
        ],
    },
    {
        "name": "脑部0-18m",
        "age_group": "infant",
        "patient_weight": "<10kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 115, "slice_thickness": 3.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 120.0, "fov": 200.0, "ctdi_vol": 26.5, "dlp": 318.0, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 100, 40, 3.0, 3.0),
            recon("骨骼", "Bone2", 512, 3500, 600, 3.0, 3.0),
        ],
    },
    {
        "name": "脑部18m-6y",
        "age_group": "child",
        "patient_weight": "20-30kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 140, "slice_thickness": 3.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 120.0, "fov": 200.0, "ctdi_vol": 32.2, "dlp": 386.4, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 100, 40, 3.0, 3.0),
            recon("骨骼", "Bone2", 512, 3500, 600, 3.0, 3.0),
        ],
    },
    {
        "name": "脑部6yrs+",
        "age_group": "child",
        "patient_weight": "40-50kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 160, "slice_thickness": 3.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 120.0, "fov": 200.0, "ctdi_vol": 36.8, "dlp": 441.6, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 100, 40, 3.0, 3.0),
            recon("骨骼", "Bone2", 512, 3500, 600, 3.0, 3.0),
        ],
    },
    {
        "name": "鼻窦/面部/眼眶0-6y",
        "age_group": "child",
        "patient_weight": "20-30kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 100, "slice_thickness": 2.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 100.0, "fov": 140.0, "ctdi_vol": 14.5, "dlp": 145.0, "auto_ma": False},
        "recons": [recon("鼻窦", "S3", 512, 2500, 200, 2.0, 2.0)],
    },
    {
        "name": "鼻窦/面部/眼眶6y+",
        "age_group": "child",
        "patient_weight": "40-50kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 135, "slice_thickness": 2.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 100.0, "fov": 140.0, "ctdi_vol": 19.6, "dlp": 196.0, "auto_ma": False},
        "recons": [recon("鼻窦", "S3", 512, 2500, 200, 2.0, 2.0)],
    },
    {
        "name": "脑部/颈部/螺旋",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 255, "slice_thickness": 5.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 305.0, "fov": 250.0, "ctdi_vol": 30.7, "dlp": 936.35, "auto_ma": False},
        "recons": [
            recon("软组织", "Brain", 512, 300, 40, 5.0, 5.0),
            recon("骨骼", "Bone2", 512, 300, 40, 5.0, 5.0),
        ],
    },
]

NECK_PROTOCOLS = [
    {
        "name": "颈部软组织",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 310, "slice_thickness": 3.0, "pitch": 1.1, "rotation_time": 1.0, "scan_length": 300.0, "fov": 250.0, "ctdi_vol": 25.0, "dlp": 750.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 350, 40, 3.0, 3.0)],
    },
    {
        "name": "颈部0-6yrs",
        "age_group": "child",
        "patient_weight": "20-30kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 188, "slice_thickness": 1.0, "pitch": 1.1, "rotation_time": 1.0, "scan_length": 197.5, "fov": 200.0, "ctdi_vol": 8.0, "dlp": 158.0, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
    {
        "name": "颈部6yrs+",
        "age_group": "child",
        "patient_weight": "40-50kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 269, "slice_thickness": 1.0, "pitch": 1.1, "rotation_time": 1.0, "scan_length": 197.5, "fov": 200.0, "ctdi_vol": 12.2, "dlp": 240.95, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
    {
        "name": "颈椎0-18m",
        "age_group": "infant",
        "patient_weight": "<10kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 85, "slice_thickness": 1.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 150.0, "fov": 180.0, "ctdi_vol": 6.7, "dlp": 100.5, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
    {
        "name": "颈椎18m-3y",
        "age_group": "child",
        "patient_weight": "20-30kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 102, "slice_thickness": 1.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 150.0, "fov": 180.0, "ctdi_vol": 8.0, "dlp": 120.0, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
    {
        "name": "颈椎3-8y",
        "age_group": "child",
        "patient_weight": "30-40kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 102, "slice_thickness": 1.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 150.0, "fov": 180.0, "ctdi_vol": 8.0, "dlp": 120.0, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
    {
        "name": "颈椎8yrs+",
        "age_group": "child",
        "patient_weight": "50-60kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 182, "slice_thickness": 1.0, "pitch": 0.6, "rotation_time": 1.0, "scan_length": 150.0, "fov": 180.0, "ctdi_vol": 14.3, "dlp": 214.5, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 1.0, 1.0)],
    },
]

CHEST_PROTOCOLS = [
    {
        "name": "胸部",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 222, "slice_thickness": 3.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 348.0, "fov": 350.0, "ctdi_vol": 14.3, "dlp": 497.64, "auto_ma": False},
        "recons": [recon("肺窗", "Lung2", 512, 1500, -700, 3.0, 3.0)],
    },
    {
        "name": "胸部/腹部/骨盆",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 294, "slice_thickness": 3.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 516.0, "fov": 350.0, "ctdi_vol": 20.0, "dlp": 1032.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 500, 40, 3.0, 3.0)],
    },
    {
        "name": "胸部PE",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 222, "slice_thickness": 2.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 348.0, "fov": 350.0, "ctdi_vol": 14.3, "dlp": 497.64, "auto_ma": False},
        "recons": [recon("肺窗", "Lung2", 512, 1500, -700, 2.0, 2.0)],
    },
    {
        "name": "胸腔0-10kg",
        "age_group": "child",
        "patient_weight": "<10kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 80, "slice_thickness": 3.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 150.0, "fov": 180.0, "ctdi_vol": 4.0, "dlp": 60.0, "auto_ma": False},
        "recons": [recon("肺窗", "Lung2", 512, 1500, -700, 3.0, 3.0)],
    },
    {
        "name": "胸腔10-30kg",
        "age_group": "child",
        "patient_weight": "20-30kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 100, "slice_thickness": 3.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 150.0, "fov": 250.0, "ctdi_vol": 5.0, "dlp": 75.0, "auto_ma": False},
        "recons": [recon("肺窗", "Lung2", 512, 1500, -700, 3.0, 3.0)],
    },
    {
        "name": "胸腔30-50kg",
        "age_group": "child",
        "patient_weight": "40-50kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 160, "slice_thickness": 3.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 150.0, "fov": 300.0, "ctdi_vol": 8.0, "dlp": 120.0, "auto_ma": False},
        "recons": [recon("肺窗", "Lung2", 512, 1500, -700, 3.0, 3.0)],
    },
    {
        "name": "胸腔50-70kg",
        "age_group": "child",
        "patient_weight": "50-60kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 200, "slice_thickness": 3.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 200.0, "fov": 360.0, "ctdi_vol": 10.0, "dlp": 200.0, "auto_ma": False},
        "recons": [recon("肺窗", "Lung2", 512, 1500, -700, 3.0, 3.0)],
    },
    {
        "name": "胸腔70-90kg",
        "age_group": "child",
        "patient_weight": "70-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 135, "slice_thickness": 3.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 249.0, "fov": 420.0, "ctdi_vol": 12.0, "dlp": 298.8, "auto_ma": False},
        "recons": [recon("肺窗", "Lung2", 512, 1500, -700, 3.0, 3.0)],
    },
    {
        "name": "胸腔4D",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "4d",
        "series_kind": "4d",
        "fourd_config": {"breathing_mode": "free_breathing", "phase_count": 17, "acquisition_time": 1.0, "trigger_threshold": 0.0},
        "recons": [recon("肺窗", "Lung2", 512, 1500, -700, 4.8, 4.8)],
    },
]

GATING_CUSTOM_PROTOCOLS = [
    {
        "name": "胸腔深吸气屏息（断层）",
        "body_part": "chest",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "patient_position": "HFS",
        "table_direction": "in",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {
            "kv": 120, "ma": 180, "slice_thickness": 1.25, "slice_interval": 20.0,
            "rotation_time": 1.0, "scan_length": 320.0, "fov": 350.0,
            "ctdi_vol": 7.5, "dlp": 120.0, "step_count": 16, "auto_ma": False,
        },
        "gating_config": {
            "breathing_mode": "breath_hold_inspiration",
            "trigger_delay_ms": 0,
            "stability_cv_threshold": 0.15,
            "baseline_drift_mm_threshold": 5.0,
            "breath_hold_timeout_s": 25.0,
            "breath_hold_amplitude_tolerance_mm": 2.0,
        },
        "recons": [
            recon("肺窗", "Lung2", 512, 1500, -700, 1.25, 1.25),
            recon("纵隔窗", "S2", 512, 400, 40, 1.25, 1.25),
        ],
    },
    {
        "name": "胸腔深吸气屏息（螺旋）",
        "body_part": "chest",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "patient_position": "HFS",
        "table_direction": "in",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {
            "kv": 120, "ma": 180, "slice_thickness": 1.25, "pitch": 1.2,
            "rotation_time": 0.5, "scan_length": 350.0, "fov": 350.0,
            "ctdi_vol": 8.2, "dlp": 287.0, "auto_ma": False,
        },
        "gating_config": {
            "breathing_mode": "breath_hold_inspiration",
            "trigger_delay_ms": 0,
            "stability_cv_threshold": 0.15,
            "baseline_drift_mm_threshold": 5.0,
            "breath_hold_timeout_s": 25.0,
            "breath_hold_amplitude_tolerance_mm": 2.0,
        },
        "recons": [
            recon("肺窗", "Lung2", 512, 1500, -700, 1.25, 1.0),
            recon("纵隔窗", "S2", 512, 400, 40, 2.5, 2.0),
        ],
    },
    {
        "name": "胸腔自由呼吸（轴扫）",
        "body_part": "chest",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "patient_position": "HFS",
        "table_direction": "in",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {
            "kv": 120, "ma": 120, "slice_thickness": 1.25, "slice_interval": 20.0,
            "rotation_time": 1.0, "scan_length": 320.0, "fov": 350.0,
            "ctdi_vol": 5.2, "dlp": 83.2, "step_count": 16, "auto_ma": False,
        },
        "gating_config": {
            "breathing_mode": "free_breathing",
            "target_phase": "max_inspiration",
            "threshold_normalized": 1.0,
            "trigger_direction": "rising",
            "wait_timeout_s": 30.0,
            "trigger_delay_ms": 0,
            "stability_cv_threshold": 0.15,
            "baseline_drift_mm_threshold": 5.0,
            "breath_hold_timeout_s": 25.0,
            "breath_hold_amplitude_tolerance_mm": 2.0,
        },
        "recons": [
            recon("肺窗", "Lung2", 512, 1500, -700, 1.25, 1.25),
            recon("纵隔窗", "S2", 512, 400, 40, 1.25, 1.25),
        ],
    },
]

SPINE_PROTOCOLS = [
    {
        "name": "颈部(脊柱)",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 224, "slice_thickness": 2.0, "pitch": 1.1, "rotation_time": 1.0, "scan_length": 250.0, "fov": 200.0, "ctdi_vol": 17.0, "dlp": 425.0, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 2.0, 2.0)],
    },
    {
        "name": "胸椎及腰椎",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 200, "slice_thickness": 3.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 300.0, "fov": 200.0, "ctdi_vol": 15.2, "dlp": 456.0, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 3.0, 3.0)],
    },
    {
        "name": "胸椎及腰椎0-18m",
        "age_group": "infant",
        "patient_weight": "<10kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 75, "slice_thickness": 2.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 150.0, "fov": 200.0, "ctdi_vol": 6.7, "dlp": 100.5, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 2.0, 2.0)],
    },
    {
        "name": "胸椎及腰椎18m-3y",
        "age_group": "child",
        "patient_weight": "20-30kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 100, "slice_thickness": 2.0, "pitch": 0.1, "rotation_time": 1.0, "scan_length": 200.0, "fov": 200.0, "ctdi_vol": 8.9, "dlp": 178.0, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 2.0, 2.0)],
    },
    {
        "name": "胸椎及腰椎3-8y",
        "age_group": "child",
        "patient_weight": "40-50kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 125, "slice_thickness": 2.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 200.0, "fov": 220.0, "ctdi_vol": 11.4, "dlp": 228.0, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 2.0, 2.0)],
    },
    {
        "name": "胸椎及腰椎8yrs+",
        "age_group": "child",
        "patient_weight": "50-60kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 150, "slice_thickness": 2.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 250.0, "fov": 220.0, "ctdi_vol": 13.4, "dlp": 335.0, "auto_ma": False},
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 2.0, 2.0)],
    },
    {
        "name": "脊椎轴向",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {"kv": 120, "ma": 180, "slice_thickness": 2.4, "slice_interval": 19.2, "rotation_time": 1.0, "scan_length": 39.0, "fov": 200.0, "ctdi_vol": 15.0, "dlp": 58.5, "step_count": 2, "auto_ma": False},
        "recons": [recon("骨骼", "S2", 512, 4000, 600, 2.4, 2.4)],
    },
]

ABDOMEN_PROTOCOLS = [
    {
        "name": "腹部",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 294, "slice_thickness": 3.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 399.0, "fov": 350.0, "ctdi_vol": 20.0, "dlp": 798.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "结肠",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 294, "slice_thickness": 3.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 399.0, "fov": 350.0, "ctdi_vol": 20.0, "dlp": 798.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "径流",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 220, "slice_thickness": 3.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 1000.0, "fov": 350.0, "ctdi_vol": 14.14, "dlp": 1414.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "躯干螺旋",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 294, "slice_thickness": 3.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 399.0, "fov": 350.0, "ctdi_vol": 20.0, "dlp": 798.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "肝脏",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 294, "slice_thickness": 3.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 348.0, "fov": 350.0, "ctdi_vol": 20.0, "dlp": 696.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "胰腺",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 294, "slice_thickness": 3.0, "pitch": 1.3, "rotation_time": 1.0, "scan_length": 348.0, "fov": 350.0, "ctdi_vol": 20.0, "dlp": 696.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "腹部/骨盆0-10kg",
        "age_group": "infant",
        "patient_weight": "<10kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 164, "slice_thickness": 3.0, "pitch": 1.1, "rotation_time": 1.0, "scan_length": 150.0, "fov": 180.0, "ctdi_vol": 7.0, "dlp": 105.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "腹部/骨盆10-30kg",
        "age_group": "child",
        "patient_weight": "20-30kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 100, "ma": 210, "slice_thickness": 3.0, "pitch": 1.1, "rotation_time": 1.0, "scan_length": 150.0, "fov": 250.0, "ctdi_vol": 9.0, "dlp": 135.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "腹部/骨盆30-50kg",
        "age_group": "child",
        "patient_weight": "40-50kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 158, "slice_thickness": 3.0, "pitch": 1.1, "rotation_time": 1.0, "scan_length": 199.5, "fov": 300.0, "ctdi_vol": 12.0, "dlp": 239.4, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "腹部/骨盆50-70kg",
        "age_group": "child",
        "patient_weight": "50-60kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 198, "slice_thickness": 3.0, "pitch": 1.1, "rotation_time": 1.0, "scan_length": 249.0, "fov": 300.0, "ctdi_vol": 15.0, "dlp": 373.5, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
    {
        "name": "腹部/骨盆70-90kg",
        "age_group": "child",
        "patient_weight": "70-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 248, "slice_thickness": 5.0, "pitch": 1.1, "rotation_time": 1.0, "scan_length": 348.0, "fov": 300.0, "ctdi_vol": 20.0, "dlp": 696.0, "auto_ma": False},
        "recons": [recon("软组织", "S2", 512, 300, 40, 3.0, 3.0)],
    },
]

EXTREMITY_PROTOCOLS = [
    {
        "name": "膝盖",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 120, "slice_thickness": 2.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 198.0, "fov": 300.0, "ctdi_vol": 10.7, "dlp": 211.86, "auto_ma": False},
        "recons": [recon("骨骼", "S2", 512, 4000, 600, 2.0, 2.0)],
    },
    {
        "name": "四肢",
        "age_group": "adult",
        "patient_weight": "50-91kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 110, "slice_thickness": 2.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 200.0, "fov": 150.0, "ctdi_vol": 9.8, "dlp": 196.0, "auto_ma": False},
        "recons": [recon("骨骼", "S2", 512, 4000, 600, 2.0, 2.0)],
    },
    {
        "name": "肩/髋",
        "age_group": "adult",
        "patient_weight": "50-92kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 140, "ma": 260, "slice_thickness": 2.0, "pitch": 0.938, "rotation_time": 1.0, "scan_length": 198.0, "fov": 400.0, "ctdi_vol": 35.1, "dlp": 694.98, "auto_ma": False},
        "recons": [recon("骨骼", "S2", 512, 4000, 600, 2.0, 2.0)],
    },
]


def build_protocols(body_part: str, patient_position: str, table_direction: str, items: list[dict]) -> list[dict]:
    protocols: list[dict] = []
    for item in items:
        payload = dict(item)
        payload["body_part"] = body_part
        payload["patient_position"] = patient_position
        payload["table_direction"] = table_direction
        payload["description"] = f"{payload['name']} seeded protocol"
        protocols.append(payload)
    return protocols


def infer_protocol_acquisition_type(name: str, scan_mode: str) -> str:
    if scan_mode == "4d":
        return "four_d"
    if name in GATING_PROTOCOL_NAMES:
        return "gating"
    return "regular"


LEGACY_PROTOCOL_SEEDS = [
    *build_protocols("head", "HFS", "in", HEAD_PROTOCOLS),
    *build_protocols("neck", "HFS", "in", NECK_PROTOCOLS),
    *build_protocols("chest", "HFS", "in", CHEST_PROTOCOLS),
    *build_protocols("spine", "HFS", "in", SPINE_PROTOCOLS),
    *build_protocols("abdomen", "HFS", "in", ABDOMEN_PROTOCOLS),
    *build_protocols("extremity", "HFS", "in", EXTREMITY_PROTOCOLS),
]


def _clean_csv_key(key: str) -> str:
    return " ".join(key.replace("\r", " ").replace("\n", " ").split()).strip()


def _csv_value(row: dict[str, str], key: str) -> str:
    return (row.get(key) or "").strip()


def _csv_float(row: dict[str, str], key: str) -> float | None:
    value = _csv_value(row, key)
    if not value or value.upper() == "N/A":
        return None
    return float(value)


def _csv_int(row: dict[str, str], key: str) -> int:
    value = _csv_float(row, key)
    return int(round(value or 0))


def _csv_patient_weight(value: str) -> str:
    value = value.strip().replace("＜", "<")
    if not value:
        return "50-90kg"
    return value if value.endswith("kg") else f"{value}kg"


def _csv_companion_protocol_name(name: str) -> str:
    if name.endswith("_B"):
        return name[:-2]
    return name.replace("_B_", "_").replace("_B AX", " AX")


def _csv_acquisition_key(row: dict[str, str]) -> tuple[str, ...]:
    recon_only_keys = {
        "ProtocolName",
        "Density",
        "Recon FOV (mm)",
        "Slice thickness (mm)",
        "Image increment (mm)",
        "Filter",
        "Matrix",
        "WindowWidth",
        "WindowCenter",
        "X_Center",
        "Y_Center",
    }
    return tuple(
        _csv_value(row, key)
        for key in sorted(row)
        if key not in recon_only_keys and not key.startswith("_")
    )


def _csv_recon_seed(row: dict[str, str]) -> dict:
    slice_thickness = _csv_float(row, "Slice thickness (mm)") or 1.0
    recon_fov = _csv_float(row, "Recon FOV (mm)") or _csv_float(row, "Surview FOV (mm)") or 250.0
    return {
        "name": _csv_value(row, "Density") or "Recon",
        "kernel": _csv_value(row, "Filter") or "S2",
        "matrix": _csv_int(row, "Matrix") or 512,
        "window_width": _csv_int(row, "WindowWidth"),
        "window_level": _csv_int(row, "WindowCenter"),
        "slice_thickness": slice_thickness,
        "increment": _csv_float(row, "Image increment (mm)"),
        "recon_fov": recon_fov,
        "center_x": _csv_float(row, "X_Center"),
        "center_y": _csv_float(row, "Y_Center"),
    }


def _load_company_protocol_seeds() -> list[dict]:
    path = Path(__file__).resolve().parent.parent / "docs" / "协议组（EN）.csv"
    if not path.exists():
        return []

    part_map = {
        "Head": "head",
        "Neck": "neck",
        "Chest": "chest",
        "Spine": "spine",
        "Abdomen": "abdomen",
        "Limbs": "extremity",
    }
    age_map = {"Adult": "adult", "Child": "child", "Infant": "infant"}
    series_map = {"Helical": "helical", "Axial": "axial", "4D": "4d"}

    rows: list[dict[str, str]] = []
    current_part = ""
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        for idx, raw_row in enumerate(reader, start=1):
            row = {_clean_csv_key(k): (v or "").strip() for k, v in raw_row.items() if k is not None}
            if row.get("Part"):
                current_part = row["Part"]
            row["Part"] = current_part
            row["_source_index"] = str(idx)
            rows.append(row)

    row_keys = {
        (_csv_value(row, "ProtocolName"), _csv_acquisition_key(row))
        for row in rows
    }
    grouped_rows: dict[tuple[str, tuple[str, ...]], list[dict[str, str]]] = {}
    group_order: list[tuple[str, tuple[str, ...]]] = []
    for row in rows:
        protocol_name = _csv_value(row, "ProtocolName")
        companion_name = _csv_companion_protocol_name(protocol_name)
        acquisition_key = _csv_acquisition_key(row)
        group_name = (
            companion_name
            if companion_name != protocol_name and (companion_name, acquisition_key) in row_keys
            else protocol_name
        )
        group_key = (group_name, acquisition_key)
        if group_key not in grouped_rows:
            grouped_rows[group_key] = []
            group_order.append(group_key)
        grouped_rows[group_key].append(row)

    seeds: list[dict] = []
    for group_name, group_key in group_order:
        group_rows = grouped_rows[(group_name, group_key)]
        row = group_rows[0]
        scan_type = _csv_value(row, "Scan type")
        series_kind = series_map.get(scan_type)
        if not series_kind:
            continue

        slice_thickness = _csv_float(row, "Slice thickness (mm)") or 1.0
        image_increment = _csv_float(row, "Image increment (mm)")
        scan_length = _csv_float(row, "length （mm）") or 0.0
        recon_fov = _csv_float(row, "Recon FOV (mm)") or _csv_float(row, "Surview FOV (mm)") or 250.0
        source_indexes = ",".join(_csv_value(item, "_source_index") for item in group_rows)
        csv_part = _csv_value(row, "Part")

        seed = {
            "name": group_name,
            "body_part": part_map.get(csv_part, csv_part.lower()),
            "age_group": age_map.get(_csv_value(row, "Age Group"), "adult"),
            "patient_weight": _csv_patient_weight(_csv_value(row, "Patient weight (kg)")),
            "patient_position": "HFS",
            "table_direction": "in",
            "scan_mode": "4d" if series_kind == "4d" else "plain",
            "series_kind": series_kind,
            "description": f"{CSV_PROTOCOL_DESCRIPTION_PREFIX}{source_indexes}:{group_name}",
            "recons": [_csv_recon_seed(item) for item in group_rows],
        }

        if series_kind == "helical":
            seed["params"] = {
                "kv": _csv_int(row, "Kv"),
                "ma": _csv_int(row, "mA"),
                "slice_thickness": slice_thickness,
                "pitch": _csv_float(row, "Pitch") or 1.0,
                "rotation_time": _csv_float(row, "Rot time (s)") or 1.0,
                "scan_length": scan_length,
                "fov": recon_fov,
                "collimator": _csv_value(row, "Collimation") or None,
                "ctdi_vol": _csv_float(row, "CTDIvol （mGy）"),
                "dlp": _csv_float(row, "DLP (mGy*cm)"),
                "auto_ma": False,
            }
        elif series_kind == "axial":
            seed["params"] = {
                "kv": _csv_int(row, "Kv"),
                "ma": _csv_int(row, "mA"),
                "slice_thickness": slice_thickness,
                "slice_interval": _csv_float(row, "Increment (mm)") or image_increment or slice_thickness,
                "rotation_time": _csv_float(row, "Rot time (s)") or 1.0,
                "scan_length": scan_length,
                "fov": recon_fov,
                "collimator": _csv_value(row, "Collimation") or None,
                "ctdi_vol": _csv_float(row, "CTDIvol （mGy）"),
                "dlp": _csv_float(row, "DLP (mGy*cm)"),
                "step_count": _csv_int(row, "cycles"),
                "auto_ma": False,
            }
        else:
            seed["fourd_config"] = {
                "breathing_mode": "free_breathing",
                "phase_count": 17,
                "acquisition_time": _csv_float(row, "Rot time (s)") or 1.0,
                "trigger_threshold": 0.0,
            }

        seeds.append(seed)

    return seeds


PROTOCOL_SEEDS = _load_company_protocol_seeds() or LEGACY_PROTOCOL_SEEDS


def infer_recon_type(recon_name: str) -> str:
    name = recon_name.lower()
    if "肺" in recon_name or "lung" in name:
        return "lung"
    if "骨" in recon_name or "鼻窦" in recon_name or "bone" in name or "sinus" in name:
        return "bone"
    if "血" in recon_name or "vascular" in name:
        return "vascular"
    return "soft"


def seed_protocol(db, models, protocol_seed: dict) -> None:
    acquisition_type = protocol_seed.get(
        "acquisition_type",
        infer_protocol_acquisition_type(protocol_seed["name"], protocol_seed["scan_mode"]),
    )
    protocol = models.Protocol(
        name=protocol_seed["name"],
        body_part=protocol_seed["body_part"],
        age_group=protocol_seed["age_group"],
        patient_weight=protocol_seed["patient_weight"],
        patient_position=protocol_seed["patient_position"],
        table_direction=protocol_seed["table_direction"],
        acquisition_type=acquisition_type,
        scan_mode=protocol_seed["scan_mode"],
        is_4d=acquisition_type == "four_d",
        is_enhance=protocol_seed["scan_mode"] == "contrast",
        description=protocol_seed["description"],
        is_factory=True,
        is_enabled=True,
    )
    db.add(protocol)
    db.flush()

    topogram_series = models.Series(
        protocol_id=protocol.id,
        series_order=1,
        series_type="topogram",
        series_label=f"{protocol.name} Topogram",
        trigger_mode="manual",
    )
    db.add(topogram_series)
    db.flush()

    db.add(models.TopogramParam(series_id=topogram_series.id, **TOP0GRAM_DEFAULTS))

    diagnostic_series = models.Series(
        protocol_id=protocol.id,
        series_order=2,
        series_type=protocol_seed["series_kind"],
        series_label=f"{protocol.name} Diagnostic",
        trigger_mode="manual",
    )
    db.add(diagnostic_series)
    db.flush()

    if protocol_seed["series_kind"] == "helical":
        db.add(models.HelicalParam(series_id=diagnostic_series.id, **protocol_seed["params"]))
    elif protocol_seed["series_kind"] == "axial":
        db.add(models.AxialParam(series_id=diagnostic_series.id, **protocol_seed["params"]))
    elif protocol_seed["series_kind"] == "4d":
        db.add(models.FourDConfig(series_id=diagnostic_series.id, **protocol_seed["fourd_config"]))

    if acquisition_type == "gating":
        breathing_mode = GATING_PROTOCOL_BREATHING_MODE.get(protocol.name, "free_breathing")
        gating_seed = protocol_seed.get("gating_config") or {}
        gating_defaults = {
            "breathing_mode": breathing_mode,
            "target_phase": "max_inspiration",
            "threshold_normalized": 1.0,
            "trigger_direction": "rising",
            "wait_timeout_s": 30.0,
            "trigger_delay_ms": 0,
            "stability_cv_threshold": 0.15,
            "baseline_drift_mm_threshold": 5.0,
            "breath_hold_timeout_s": 25.0,
            "breath_hold_amplitude_tolerance_mm": 2.0,
        }
        gating_defaults.update(gating_seed)
        db.add(models.GatingConfig(series_id=diagnostic_series.id, **gating_defaults))

    for recon_seed in protocol_seed["recons"]:
        recon_slice_thickness, recon_increment = _normalize_recon_spacing(
            protocol_seed["series_kind"],
            recon_seed["slice_thickness"],
            recon_seed["increment"],
        )
        db.add(
            models.ReconSeries(
                series_id=diagnostic_series.id,
                recon_name=recon_seed["name"],
                recon_type=infer_recon_type(recon_seed["name"]),
                kernel=recon_seed["kernel"],
                matrix=recon_seed["matrix"],
                window_width=recon_seed["window_width"],
                window_level=recon_seed["window_level"],
                slice_thickness=recon_slice_thickness,
                increment=recon_increment,
                recon_fov=recon_seed.get("recon_fov"),
                center_x=recon_seed.get("center_x"),
                center_y=recon_seed.get("center_y"),
            )
        )


def _sync_factory_brain_kernel_names(db, models) -> int:
    # 旧版本地库可能已经种过 Brain2；只同步原厂模板，避免改写会话内编辑。
    factory_series_ids = (
        db.query(models.Series.id)
        .join(models.Protocol, models.Series.protocol_id == models.Protocol.id)
        .filter(models.Protocol.is_factory.is_(True))
    )
    return (
        db.query(models.ReconSeries)
        .filter(
            models.ReconSeries.kernel == "Brain2",
            models.ReconSeries.series_id.in_(factory_series_ids),
        )
        .update({models.ReconSeries.kernel: "Brain"}, synchronize_session=False)
    )


def _sync_factory_recon_spacing(db, models) -> int:
    # 只同步默认模板的重建层厚/重建增量，避免改写已生成的扫描会话。
    factory_recons = (
        db.query(models.ReconSeries, models.Series.series_type)
        .join(models.Series, models.ReconSeries.series_id == models.Series.id)
        .join(models.Protocol, models.Series.protocol_id == models.Protocol.id)
        .filter(
            models.Protocol.is_factory.is_(True),
            models.Series.series_type.in_(("axial", "helical")),
        )
        .all()
    )
    updated = 0
    for recon_series, series_type in factory_recons:
        next_slice_thickness, next_increment = _normalize_recon_spacing(
            series_type,
            recon_series.slice_thickness,
            recon_series.increment,
        )
        if (
            recon_series.slice_thickness != next_slice_thickness
            or recon_series.increment != next_increment
        ):
            recon_series.slice_thickness = next_slice_thickness
            recon_series.increment = next_increment
            updated += 1
    return updated


def _seed_gating_protocols(db, models) -> None:
    added = 0
    for seed in GATING_CUSTOM_PROTOCOLS:
        existing = (
            db.query(models.Protocol)
            .filter(
                models.Protocol.name == seed["name"],
                models.Protocol.acquisition_type == "gating",
            )
            .first()
        )
        if existing:
            continue

        protocol = models.Protocol(
            name=seed["name"],
            body_part=seed["body_part"],
            age_group=seed["age_group"],
            patient_weight=seed["patient_weight"],
            patient_position=seed["patient_position"],
            table_direction=seed["table_direction"],
            acquisition_type="gating",
            scan_mode="plain",
            is_4d=False,
            is_enhance=False,
            is_factory=False,
            is_enabled=True,
        )
        db.add(protocol)
        db.flush()

        topogram = models.Series(
            protocol_id=protocol.id,
            series_order=1,
            series_type="topogram",
            series_label=f"{protocol.name} Topogram",
            trigger_mode="manual",
        )
        db.add(topogram)
        db.flush()
        db.add(models.TopogramParam(series_id=topogram.id, **TOP0GRAM_DEFAULTS))

        diag = models.Series(
            protocol_id=protocol.id,
            series_order=2,
            series_type=seed["series_kind"],
            series_label=f"{protocol.name} Diagnostic",
            trigger_mode="manual",
        )
        db.add(diag)
        db.flush()

        if seed["series_kind"] == "helical":
            db.add(models.HelicalParam(series_id=diag.id, **seed["params"]))
        else:
            db.add(models.AxialParam(series_id=diag.id, **seed["params"]))

        db.add(models.GatingConfig(series_id=diag.id, **seed["gating_config"]))

        for r in seed["recons"]:
            db.add(models.ReconSeries(
                series_id=diag.id,
                recon_name=r["name"],
                recon_type=infer_recon_type(r["name"]),
                kernel=r["kernel"],
                matrix=r["matrix"],
                window_width=r["window_width"],
                window_level=r["window_level"],
                slice_thickness=r["slice_thickness"],
                increment=r["increment"],
            ))

        added += 1

    if added:
        db.commit()
        print(f"Seeded gating protocols: {added} added")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



def _migrate_protocol_columns() -> None:
    """Add new Protocol columns to existing SQLite database (idempotent)."""
    from sqlalchemy import text

    def foreign_key_targets(conn, table_name: str) -> set[str]:
        return {
            row[2]
            for row in conn.execute(text(f"PRAGMA foreign_key_list({table_name})")).fetchall()
        }

    def rebuild_scan_sessions_patient_fk(conn) -> bool:
        if "patients_old" not in foreign_key_targets(conn, "scan_sessions"):
            return False

        # SQLite 会在重命名父表时自动改写子表外键；这里关闭改写，避免临时表名再次泄漏。
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("PRAGMA legacy_alter_table=ON"))
        conn.execute(text("ALTER TABLE scan_sessions RENAME TO scan_sessions_fk_old"))
        conn.execute(text(
            "CREATE TABLE scan_sessions ("
            "id INTEGER NOT NULL PRIMARY KEY, "
            "patient_id INTEGER NOT NULL, "
            "protocol_id INTEGER NOT NULL, "
            "status VARCHAR(20) NOT NULL, "
            "session_name VARCHAR(120), "
            "name VARCHAR(100) NOT NULL, "
            "body_part VARCHAR(100) NOT NULL, "
            "age_group VARCHAR(20) NOT NULL, "
            "patient_weight VARCHAR(50) NOT NULL, "
            "patient_position VARCHAR(10) NOT NULL, "
            "table_direction VARCHAR(10) NOT NULL, "
            "scan_mode VARCHAR(20) NOT NULL, "
            "description TEXT, "
            "created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, "
            "started_at DATETIME, "
            "completed_at DATETIME, "
            "acquisition_type VARCHAR(20) NOT NULL DEFAULT 'regular', "
            "FOREIGN KEY(patient_id) REFERENCES patients (id) ON DELETE RESTRICT, "
            "FOREIGN KEY(protocol_id) REFERENCES protocols (id) ON DELETE RESTRICT)"
        ))
        conn.execute(text(
            "INSERT INTO scan_sessions "
            "(id, patient_id, protocol_id, status, session_name, name, body_part, age_group, "
            "patient_weight, patient_position, table_direction, scan_mode, description, created_at, "
            "started_at, completed_at, acquisition_type) "
            "SELECT id, patient_id, protocol_id, status, session_name, name, body_part, age_group, "
            "patient_weight, patient_position, table_direction, scan_mode, description, created_at, "
            "started_at, completed_at, acquisition_type FROM scan_sessions_fk_old"
        ))
        conn.execute(text("DROP TABLE scan_sessions_fk_old"))
        for sql in [
            "CREATE INDEX IF NOT EXISTS ix_scan_sessions_age_group ON scan_sessions (age_group)",
            "CREATE INDEX IF NOT EXISTS ix_scan_sessions_id ON scan_sessions (id)",
            "CREATE INDEX IF NOT EXISTS ix_scan_sessions_name ON scan_sessions (name)",
            "CREATE INDEX IF NOT EXISTS ix_scan_sessions_patient_id ON scan_sessions (patient_id)",
            "CREATE INDEX IF NOT EXISTS ix_scan_sessions_protocol_id ON scan_sessions (protocol_id)",
            "CREATE INDEX IF NOT EXISTS ix_scan_sessions_scan_mode ON scan_sessions (scan_mode)",
            "CREATE INDEX IF NOT EXISTS ix_scan_sessions_status ON scan_sessions (status)",
        ]:
            conn.execute(text(sql))
        conn.execute(text("PRAGMA legacy_alter_table=OFF"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()
        return True

    def rebuild_dose_logs_patient_fk(conn) -> bool:
        if "patients_old" not in foreign_key_targets(conn, "dose_logs"):
            return False

        # dose_logs 是审计快照，重建表只修外键目标，不改写日志内容。
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("PRAGMA legacy_alter_table=ON"))
        conn.execute(text("ALTER TABLE dose_logs RENAME TO dose_logs_fk_old"))
        conn.execute(text(
            "CREATE TABLE dose_logs ("
            "id INTEGER NOT NULL PRIMARY KEY, "
            "created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, "
            "scanned_at DATETIME NOT NULL, "
            "patient_id INTEGER, "
            "scan_session_id INTEGER, "
            "scan_session_series_id INTEGER, "
            "patient_name_snapshot VARCHAR(100), "
            "patient_id_snapshot VARCHAR(50), "
            "protocol_name_snapshot VARCHAR(100), "
            "series_order INTEGER, "
            "series_type VARCHAR(20) NOT NULL, "
            "series_label VARCHAR(100), "
            "body_part VARCHAR(100), "
            "scan_mode VARCHAR(20), "
            "kv INTEGER, "
            "ma FLOAT, "
            "rotation_time FLOAT, "
            "pitch FLOAT, "
            "scan_length FLOAT, "
            "collimator VARCHAR(50), "
            "ctdi_vol FLOAT, "
            "dlp FLOAT, "
            "operator VARCHAR(50), "
            "acquisition_type VARCHAR(20), "
            "FOREIGN KEY(patient_id) REFERENCES patients (id) ON DELETE SET NULL, "
            "FOREIGN KEY(scan_session_id) REFERENCES scan_sessions (id) ON DELETE SET NULL, "
            "FOREIGN KEY(scan_session_series_id) REFERENCES scan_session_series (id) ON DELETE SET NULL)"
        ))
        conn.execute(text(
            "INSERT INTO dose_logs "
            "(id, created_at, scanned_at, patient_id, scan_session_id, scan_session_series_id, "
            "patient_name_snapshot, patient_id_snapshot, protocol_name_snapshot, series_order, "
            "series_type, series_label, body_part, scan_mode, kv, ma, rotation_time, pitch, "
            "scan_length, collimator, ctdi_vol, dlp, operator, acquisition_type) "
            "SELECT id, created_at, scanned_at, patient_id, scan_session_id, scan_session_series_id, "
            "patient_name_snapshot, patient_id_snapshot, protocol_name_snapshot, series_order, "
            "series_type, series_label, body_part, scan_mode, kv, ma, rotation_time, pitch, "
            "scan_length, collimator, ctdi_vol, dlp, operator, acquisition_type FROM dose_logs_fk_old"
        ))
        conn.execute(text("DROP TABLE dose_logs_fk_old"))
        for sql in [
            "CREATE INDEX IF NOT EXISTS ix_dose_logs_id ON dose_logs (id)",
            "CREATE INDEX IF NOT EXISTS ix_dose_logs_patient_id ON dose_logs (patient_id)",
            "CREATE INDEX IF NOT EXISTS ix_dose_logs_patient_id_snapshot ON dose_logs (patient_id_snapshot)",
            "CREATE INDEX IF NOT EXISTS ix_dose_logs_scan_session_id ON dose_logs (scan_session_id)",
            "CREATE INDEX IF NOT EXISTS ix_dose_logs_scan_session_series_id ON dose_logs (scan_session_series_id)",
            "CREATE INDEX IF NOT EXISTS ix_dose_logs_scanned_at ON dose_logs (scanned_at)",
            "CREATE INDEX IF NOT EXISTS ix_dose_logs_series_type ON dose_logs (series_type)",
        ]:
            conn.execute(text(sql))
        conn.execute(text("PRAGMA legacy_alter_table=OFF"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()
        return True

    migrations = [
        # Patient additions
        "ALTER TABLE patients ADD COLUMN last_name VARCHAR(50)",
        "ALTER TABLE patients ADD COLUMN first_name VARCHAR(50)",
        "ALTER TABLE patients ADD COLUMN id_number VARCHAR(50)",
        "ALTER TABLE patients ADD COLUMN age INTEGER",
        "ALTER TABLE protocols ADD COLUMN is_factory BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE protocols ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT 1",
        "ALTER TABLE protocols ADD COLUMN updated_at DATETIME",
        "ALTER TABLE protocols ADD COLUMN acquisition_type VARCHAR(20) NOT NULL DEFAULT 'regular'",
        "ALTER TABLE protocols ADD COLUMN is_4d BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE protocols ADD COLUMN is_enhance BOOLEAN NOT NULL DEFAULT 0",
        # Topogram Param additions
        "ALTER TABLE topogram_params ADD COLUMN collimator VARCHAR(50)",
        "ALTER TABLE topogram_params ADD COLUMN scan_direction VARCHAR(10) DEFAULT 'OUT'",
        "ALTER TABLE topogram_params ADD COLUMN dom VARCHAR(20)",
        # Helical Param additions
        "ALTER TABLE helical_params ADD COLUMN collimator VARCHAR(50)",
        "ALTER TABLE helical_params ADD COLUMN scan_direction VARCHAR(10) DEFAULT 'OUT'",
        "ALTER TABLE helical_params ADD COLUMN dom VARCHAR(20)",
        # Axial Param additions
        "ALTER TABLE axial_params ADD COLUMN collimator VARCHAR(50)",
        "ALTER TABLE axial_params ADD COLUMN scan_direction VARCHAR(10) DEFAULT 'OUT'",
        "ALTER TABLE axial_params ADD COLUMN dom VARCHAR(20)",
        # Scan Session additions
        "ALTER TABLE scan_session_topogram_params ADD COLUMN collimator VARCHAR(50)",
        "ALTER TABLE scan_session_topogram_params ADD COLUMN scan_direction VARCHAR(10) DEFAULT 'OUT'",
        "ALTER TABLE scan_session_topogram_params ADD COLUMN dom VARCHAR(20)",
        "ALTER TABLE scan_session_helical_params ADD COLUMN collimator VARCHAR(50)",
        "ALTER TABLE scan_session_helical_params ADD COLUMN scan_direction VARCHAR(10) DEFAULT 'OUT'",
        "ALTER TABLE scan_session_helical_params ADD COLUMN dom VARCHAR(20)",
        "ALTER TABLE scan_session_axial_params ADD COLUMN collimator VARCHAR(50)",
        "ALTER TABLE scan_session_axial_params ADD COLUMN scan_direction VARCHAR(10) DEFAULT 'OUT'",
        "ALTER TABLE scan_session_axial_params ADD COLUMN dom VARCHAR(20)",
        "ALTER TABLE scan_sessions ADD COLUMN acquisition_type VARCHAR(20) NOT NULL DEFAULT 'regular'",
        # Recon Series additions
        "ALTER TABLE recon_series ADD COLUMN recon_fov FLOAT",
        "ALTER TABLE recon_series ADD COLUMN center_x FLOAT",
        "ALTER TABLE recon_series ADD COLUMN center_y FLOAT",
        # Scan Session Recon Series additions
        "ALTER TABLE scan_session_recon_series ADD COLUMN recon_fov FLOAT",
        "ALTER TABLE scan_session_recon_series ADD COLUMN center_x FLOAT",
        "ALTER TABLE scan_session_recon_series ADD COLUMN center_y FLOAT",
        # Gating: free-breathing prospective trigger fields
        "ALTER TABLE gating_configs ADD COLUMN target_phase VARCHAR(20)",
        "ALTER TABLE gating_configs ADD COLUMN threshold_normalized FLOAT",
        "ALTER TABLE gating_configs ADD COLUMN trigger_direction VARCHAR(10)",
        "ALTER TABLE gating_configs ADD COLUMN wait_timeout_s FLOAT",
        "ALTER TABLE scan_session_gating_configs ADD COLUMN target_phase VARCHAR(20)",
        "ALTER TABLE scan_session_gating_configs ADD COLUMN threshold_normalized FLOAT",
        "ALTER TABLE scan_session_gating_configs ADD COLUMN trigger_direction VARCHAR(10)",
        "ALTER TABLE scan_session_gating_configs ADD COLUMN wait_timeout_s FLOAT",
        # Dose Log additions
        "ALTER TABLE dose_logs ADD COLUMN acquisition_type VARCHAR(20)",
        # Dose Settings: replaced aec_noise_index (Float) with aec_noise_level (String)
        # Existing rows are backfilled with default 'medium' via the column default.
        "ALTER TABLE dose_settings ADD COLUMN aec_noise_level VARCHAR(10) NOT NULL DEFAULT 'medium'",
        # Auth: password storage for user accounts
        "ALTER TABLE user_accounts ADD COLUMN password_hash VARCHAR(255)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                # Column already exists – safe to ignore
                pass
        # User management: MFA was removed from the product scope. Existing
        # local SQLite databases may still have the legacy NOT NULL column, so
        # drop it before inserting seeded users.
        try:
            conn.execute(text("ALTER TABLE user_accounts DROP COLUMN mfa_required"))
            conn.commit()
        except Exception:
            pass

        # 患者年龄改为独立必填字段；生日只作为可选精确信息。
        try:
            conn.execute(text(
                "UPDATE patients SET age = CASE "
                "WHEN birth_date IS NULL THEN 0 "
                "WHEN ((CAST(strftime('%Y', 'now') AS INTEGER) - CAST(strftime('%Y', birth_date) AS INTEGER)) - "
                "CASE WHEN strftime('%m-%d', 'now') < strftime('%m-%d', birth_date) THEN 1 ELSE 0 END) < 0 "
                "THEN 0 ELSE ((CAST(strftime('%Y', 'now') AS INTEGER) - CAST(strftime('%Y', birth_date) AS INTEGER)) - "
                "CASE WHEN strftime('%m-%d', 'now') < strftime('%m-%d', birth_date) THEN 1 ELSE 0 END) END "
                "WHERE age IS NULL"
            ))
            conn.commit()
        except Exception:
            pass

        try:
            patient_columns = {
                row[1]: {"notnull": bool(row[3])}
                for row in conn.execute(text("PRAGMA table_info(patients)")).fetchall()
            }
            needs_patient_rebuild = (
                patient_columns.get("birth_date", {}).get("notnull", False)
                or not patient_columns.get("age", {}).get("notnull", False)
            )
            if needs_patient_rebuild:
                conn.execute(text("PRAGMA foreign_keys=OFF"))
                conn.execute(text("PRAGMA legacy_alter_table=ON"))
                conn.execute(text("ALTER TABLE patients RENAME TO patients_old"))
                conn.execute(text(
                    "CREATE TABLE patients ("
                    "id INTEGER NOT NULL PRIMARY KEY, "
                    "name VARCHAR(100) NOT NULL, "
                    "last_name VARCHAR(50), "
                    "first_name VARCHAR(50), "
                    "patient_id VARCHAR(50) NOT NULL, "
                    "id_number VARCHAR(50), "
                    "gender VARCHAR(20) NOT NULL, "
                    "age INTEGER NOT NULL, "
                    "birth_date DATE, "
                    "height FLOAT, "
                    "weight FLOAT, "
                    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)"
                ))
                conn.execute(text(
                    "INSERT INTO patients "
                    "(id, name, last_name, first_name, patient_id, id_number, gender, age, birth_date, height, weight, created_at) "
                    "SELECT id, name, last_name, first_name, patient_id, id_number, gender, "
                    "COALESCE(age, 0), birth_date, height, weight, created_at FROM patients_old"
                ))
                conn.execute(text("DROP TABLE patients_old"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_patients_patient_id ON patients (patient_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_patients_id ON patients (id)"))
                conn.execute(text("PRAGMA legacy_alter_table=OFF"))
                conn.execute(text("PRAGMA foreign_keys=ON"))
                conn.commit()
        except Exception:
            try:
                conn.execute(text("PRAGMA legacy_alter_table=OFF"))
                conn.execute(text("PRAGMA foreign_keys=ON"))
                conn.commit()
            except Exception:
                pass

        try:
            fixed_scan_session_fk = rebuild_scan_sessions_patient_fk(conn)
            fixed_dose_log_fk = rebuild_dose_logs_patient_fk(conn)
            if fixed_scan_session_fk or fixed_dose_log_fk:
                print(
                    "Rebuilt patient foreign keys: "
                    f"scan_sessions={fixed_scan_session_fk}, dose_logs={fixed_dose_log_fk}"
                )
        except Exception:
            try:
                conn.execute(text("PRAGMA legacy_alter_table=OFF"))
                conn.execute(text("PRAGMA foreign_keys=ON"))
                conn.commit()
            except Exception:
                pass
            raise

        # Fix: reset user-created protocols that were wrongly marked as factory
        # Seeded protocols are created with is_factory=True in init_db,
        # so we only need to fix protocols that have updated_at set (user-edited)
        # or were created after the initial seed batch.
        # Simple heuristic: protocols with description NOT ending in "seeded protocol"
        # are user-created and should not be factory.
        conn.execute(text(
            "UPDATE protocols SET acquisition_type = 'four_d' "
            "WHERE scan_mode = '4d'"
        ))
        conn.execute(text(
            "UPDATE protocols SET acquisition_type = 'gating' "
            "WHERE name IN ('胸腔深吸气屏息（断层）','胸腔深吸气屏息（螺旋）','胸腔自由呼吸（轴扫）')"
        ))
        conn.execute(text(
            "UPDATE protocols SET acquisition_type = 'regular' "
            "WHERE acquisition_type IS NULL OR acquisition_type = ''"
        ))
        conn.execute(text(
            "UPDATE protocols SET is_factory = 0 "
            "WHERE (description IS NULL OR description NOT LIKE '%seeded protocol') "
            "AND description NOT LIKE 'protocol-csv:%'"
        ))
        conn.execute(text(
            "UPDATE protocols SET is_4d = 1 WHERE acquisition_type = 'four_d' OR scan_mode = '4d'"
        ))
        conn.execute(text(
            "UPDATE protocols SET is_4d = 0 WHERE acquisition_type != 'four_d' AND scan_mode != '4d'"
        ))
        conn.execute(text(
            "UPDATE protocols SET is_enhance = 1 WHERE scan_mode = 'contrast'"
        ))
        conn.execute(text(
            "UPDATE protocols SET is_enhance = 0 WHERE scan_mode != 'contrast'"
        ))
        conn.execute(text(
            "UPDATE scan_sessions SET acquisition_type = COALESCE(("
            "SELECT acquisition_type FROM protocols WHERE protocols.id = scan_sessions.protocol_id"
            "), CASE WHEN scan_mode = '4d' THEN 'four_d' ELSE 'regular' END)"
        ))
        conn.execute(text(
            "UPDATE dose_logs SET acquisition_type = COALESCE(("
            "SELECT acquisition_type FROM scan_sessions WHERE scan_sessions.id = dose_logs.scan_session_id"
            "), CASE WHEN scan_mode = '4d' THEN 'four_d' ELSE 'regular' END) "
            "WHERE acquisition_type IS NULL OR acquisition_type = ''"
        ))
        # Gating protocols are now custom (non-factory) — demote any legacy factory rows
        conn.execute(text(
            "UPDATE protocols SET is_factory = 0 "
            "WHERE name IN ('胸腔深吸气屏息（断层）','胸腔深吸气屏息（螺旋）','胸腔自由呼吸（轴扫）') "
            "AND acquisition_type = 'gating'"
        ))
        conn.commit()

        # Backfill gating_configs for diagnostic series of gated protocols
        gating_backfill = [
            ("胸腔深吸气屏息（断层）", "breath_hold_inspiration"),
            ("胸腔深吸气屏息（螺旋）", "breath_hold_inspiration"),
            ("胸腔自由呼吸（轴扫）", "free_breathing"),
        ]
        for protocol_name, breathing_mode in gating_backfill:
            try:
                conn.execute(
                    text(
                        "INSERT INTO gating_configs "
                        "(series_id, breathing_mode, target_phase, threshold_normalized, "
                        "trigger_direction, wait_timeout_s, trigger_delay_ms, "
                        "stability_cv_threshold, baseline_drift_mm_threshold, "
                        "breath_hold_timeout_s, breath_hold_amplitude_tolerance_mm) "
                        "SELECT s.id, :mode, 'max_inspiration', 1.0, 'rising', 30.0, 0, 0.15, 5.0, 25.0, 2.0 "
                        "FROM series s JOIN protocols p ON p.id = s.protocol_id "
                        "WHERE p.name = :name AND s.series_type IN ('helical','axial') "
                        "AND NOT EXISTS (SELECT 1 FROM gating_configs g WHERE g.series_id = s.id)"
                    ),
                    {"mode": breathing_mode, "name": protocol_name},
                )
            except Exception:
                pass
        # Backfill new fields onto existing gating_configs rows that pre-date this migration
        try:
            conn.execute(text(
                "UPDATE gating_configs SET "
                "target_phase = COALESCE(target_phase, 'max_inspiration'), "
                "threshold_normalized = COALESCE(threshold_normalized, 1.0), "
                "trigger_direction = COALESCE(trigger_direction, 'rising'), "
                "wait_timeout_s = COALESCE(wait_timeout_s, 30.0) "
                "WHERE breathing_mode = 'free_breathing'"
            ))
            conn.execute(text(
                "UPDATE scan_session_gating_configs SET "
                "target_phase = COALESCE(target_phase, 'max_inspiration'), "
                "threshold_normalized = COALESCE(threshold_normalized, 1.0), "
                "trigger_direction = COALESCE(trigger_direction, 'rising'), "
                "wait_timeout_s = COALESCE(wait_timeout_s, 30.0) "
                "WHERE breathing_mode = 'free_breathing'"
            ))
        except Exception:
            pass
        conn.commit()


def _cleanup_scan_session_orphans() -> None:
    """Remove stale child rows left by older SQLite connections without FK enforcement."""
    from sqlalchemy import text

    cleanup_sql = [
        (
            "DELETE FROM scan_session_breathing_training_params "
            "WHERE scan_session_fourd_config_id NOT IN (SELECT id FROM scan_session_fourd_configs)"
        ),
        (
            "DELETE FROM scan_session_topogram_params "
            "WHERE scan_session_series_id NOT IN (SELECT id FROM scan_session_series)"
        ),
        (
            "DELETE FROM scan_session_helical_params "
            "WHERE scan_session_series_id NOT IN (SELECT id FROM scan_session_series)"
        ),
        (
            "DELETE FROM scan_session_axial_params "
            "WHERE scan_session_series_id NOT IN (SELECT id FROM scan_session_series)"
        ),
        (
            "DELETE FROM scan_session_recon_series "
            "WHERE scan_session_series_id NOT IN (SELECT id FROM scan_session_series)"
        ),
        (
            "DELETE FROM scan_session_fourd_configs "
            "WHERE scan_session_series_id NOT IN (SELECT id FROM scan_session_series)"
        ),
        (
            "DELETE FROM scan_session_gating_configs "
            "WHERE scan_session_series_id NOT IN (SELECT id FROM scan_session_series)"
        ),
        (
            "DELETE FROM scan_session_contrast_configs "
            "WHERE scan_session_id NOT IN (SELECT id FROM scan_sessions)"
        ),
        (
            "DELETE FROM scan_session_series "
            "WHERE scan_session_id NOT IN (SELECT id FROM scan_sessions)"
        ),
    ]

    with engine.connect() as conn:
        for sql in cleanup_sql:
            try:
                conn.execute(text(sql))
            except Exception:
                pass
        conn.commit()


# =============================================================================
# DRL 默认值 — 数据源：贵司《扫描参数设置.xlsx》协议库
#
# 提取规则：每个 (部位 × 人群) 取协议库中代表性"常规"协议的 Dose report
# CTDIvol / DLP，用于服务模式剂量设置页的系统默认值。
# 对应 Excel 列：Dose report CTDIvol value (mGy)、
# Dose report DLP value (mGy*cm)。
#
# 体重 / 年龄分档对应关系：
#   儿童 (pediatric)  ← Excel 中 "30-50kg" 或 "6yrs+" 档（学龄期）
#   婴幼儿 (infant)   ← Excel 中 "0-10kg" 或 "0-18m" 档
#   成人 (adult)      ← Excel 中 "50-90kg" 标准成人档
#
# 盆腔 (pelvis) 在协议库中无独立成人协议，与"腹部/盆腔"合并扫描；
# 此处暂取与腹部相同的代表值，待医学物理师细化时再分。
#
# ⚠️ 装机前由医学物理师对照本院《扫描参数设置》当前版本复核；
#    Excel 版本号或临床方案更新时需同步更新本表。
# =============================================================================
DRL_SEEDS: list[dict[str, object]] = [
    # ── 成人 (adult) ──
    {"body_part": "头颅", "age_group": "adult", "ctdi_ref": 80.0, "dlp_ref": 1320.0},  # Brain
    {"body_part": "颈部", "age_group": "adult", "ctdi_ref": 80.0, "dlp_ref": 2400.0},  # 颈部软组织
    {"body_part": "胸部", "age_group": "adult", "ctdi_ref": 50.0, "dlp_ref": 1740.0},  # 胸部
    {"body_part": "腹部", "age_group": "adult", "ctdi_ref": 50.0, "dlp_ref": 2000.0},  # 腹部
    {"body_part": "盆腔", "age_group": "adult", "ctdi_ref": 50.0, "dlp_ref": 2000.0},  # 取腹部值，无独立成人盆腔协议
    {"body_part": "脊柱", "age_group": "adult", "ctdi_ref": 50.0, "dlp_ref": 1250.0},  # 腰椎
    # ── 儿童 6yrs+ (pediatric) ──
    {"body_part": "头颅", "age_group": "pediatric", "ctdi_ref": 60.0, "dlp_ref": 720.0},  # 头颅6yrs+
    {"body_part": "胸部", "age_group": "pediatric", "ctdi_ref": 15.0, "dlp_ref": 230.0},  # 胸腔30-50kg
    {"body_part": "腹部", "age_group": "pediatric", "ctdi_ref": 25.0, "dlp_ref": 500.0},  # 腹部/盆腔30-50kg
    {"body_part": "盆腔", "age_group": "pediatric", "ctdi_ref": 25.0, "dlp_ref": 500.0},  # 同腹部
    # ── 婴幼儿 0-18m / 0-10kg (infant) ──
    {"body_part": "头颅", "age_group": "infant", "ctdi_ref": 50.0, "dlp_ref": 600.0},  # 头颅0-18m
    {"body_part": "胸部", "age_group": "infant", "ctdi_ref": 10.0, "dlp_ref": 150.0},  # 胸腔0-10kg
]

LEGACY_DRL_DEFAULTS: dict[tuple[str, str], set[tuple[float, float]]] = {
    ("头颅", "adult"): {(60.0, 1000.0), (59.4, 1168.5)},
    ("颈部", "adult"): {(25.0, 350.0), (25.0, 750.0)},
    ("胸部", "adult"): {(15.0, 500.0), (14.3, 497.64)},
    ("腹部", "adult"): {(20.0, 750.0), (20.0, 798.0)},
    ("盆腔", "adult"): {(20.0, 750.0), (20.0, 798.0)},
    ("脊柱", "adult"): {(15.0, 250.0), (17.0, 425.0)},
    ("头颅", "pediatric"): {(35.0, 600.0), (36.8, 441.6)},
    ("胸部", "pediatric"): {(4.5, 110.0), (8.0, 120.0)},
    ("腹部", "pediatric"): {(10.0, 200.0), (12.0, 239.4)},
    ("盆腔", "pediatric"): {(12.0, 250.0), (12.0, 239.4)},
    ("头颅", "infant"): {(22.0, 350.0), (26.5, 318.0)},
    ("胸部", "infant"): {(2.5, 75.0), (4.0, 60.0)},
}


def _seed_dose_defaults(db) -> None:
    from . import models

    # Seed DoseSettings singleton if missing
    if db.query(models.DoseSettings).filter(models.DoseSettings.id == 1).first() is None:
        db.add(models.DoseSettings(id=1))

    # Seed or refresh built-in DRL entries (idempotent per body_part × age_group).
    existing_entries = {
        (entry.body_part, entry.age_group): entry
        for entry in db.query(models.DrlEntry).all()
    }
    added = 0
    updated = 0
    for seed in DRL_SEEDS:
        key = (seed["body_part"], seed["age_group"])
        existing = existing_entries.get(key)
        if existing is None:
            db.add(models.DrlEntry(**seed))
            added += 1
            continue
        existing_values = (float(existing.ctdi_ref), float(existing.dlp_ref))
        if existing_values in LEGACY_DRL_DEFAULTS.get(key, set()):
            existing.ctdi_ref = seed["ctdi_ref"]
            existing.dlp_ref = seed["dlp_ref"]
            updated += 1

    if added > 0 or updated > 0:
        db.commit()
        print(f"Seeded DRL entries: {added} added, {updated} updated")


EMERGENCY_USERNAME = "emergency"


def _seed_user_management_defaults(db) -> None:
    from . import models

    permission_sets = {
        "system_admin": [
            # 扫描业务
            "scan.view", "scan.execute", "patient.manage", "patient.delete",
            # 协议与剂量
            "protocol.view", "protocol.manage",
            "dose.view", "dose.manage",
            # 服务模式
            "service.enter",
            "hardware.calibration", "hardware.diagnostics", "hardware.storage", "hardware.manual_scan",
            # 数据与接口
            "dicom.manage", "cornerinfo.manage", "organization.manage",
            # 系统与日志
            "system.settings", "log.view", "reports.view",
            # 安全审计
            "user.manage", "audit.view",
        ],
        "technologist": [
            "scan.view", "scan.execute", "patient.manage",
            "protocol.view", "dose.view",
            "reports.view",
        ],
        "service_engineer": [
            "service.enter",
            "hardware.calibration", "hardware.diagnostics", "hardware.storage", "hardware.manual_scan",
            "dicom.manage", "cornerinfo.manage", "organization.manage",
            "system.settings", "log.view", "reports.view",
            "audit.view",
        ],
    }

    # Historic permission sets. Each entry represents a known default snapshot from
    # a past schema. On startup, if a system role's current permissions match any
    # one of these snapshots exactly, we refresh it to the new default. This way
    # subsequent capability refactors stay automatic without overwriting roles
    # an admin has actually customized.
    legacy_permission_sets = {
        "system_admin": [
            # Original (pre-2026-05).
            {
                "scan.view", "scan.execute", "patient.manage",
                "protocol.manage", "dose.manage",
                "service.hardware", "user.manage", "reports.view",
                "audit.view", "system.settings",
            },
            # 2026-05 refactor: business-domain groups, before patient/protocol
            # delete were split out.
            {
                "scan.view", "scan.execute", "patient.manage",
                "protocol.view", "protocol.manage", "dose.view", "dose.manage",
                "service.enter",
                "hardware.calibration", "hardware.diagnostics", "hardware.storage", "hardware.manual_scan",
                "dicom.manage", "cornerinfo.manage", "organization.manage",
                "system.settings", "log.view", "reports.view",
                "user.manage", "audit.view",
            },
        ],
        "technologist": [
            {
                "scan.view", "scan.execute", "patient.manage",
                "protocol.view", "reports.view",
            },
            # 2026-05 refactor — unchanged from the current default, kept for
            # clarity should it diverge later.
            {
                "scan.view", "scan.execute", "patient.manage",
                "protocol.view", "dose.view", "reports.view",
            },
        ],
        "service_engineer": [
            {
                "service.hardware", "system.settings", "reports.view", "audit.view",
            },
            {
                "service.enter",
                "hardware.calibration", "hardware.diagnostics", "hardware.storage", "hardware.manual_scan",
                "dicom.manage", "cornerinfo.manage", "organization.manage",
                "system.settings", "log.view", "reports.view", "audit.view",
            },
        ],
    }

    role_seeds = [
        {
            "code": "system_admin",
            "name": "系统管理员",
            "description": "维护账号、角色、系统参数和审计配置。",
            "permissions": permission_sets["system_admin"],
        },
        {
            "code": "technologist",
            "name": "技师",
            "description": "执行患者登记、检查流程和常规报告查看。",
            "permissions": permission_sets["technologist"],
        },
        {
            "code": "service_engineer",
            "name": "服务工程师",
            "description": "维护服务模式下的硬件、日志和系统配置。",
            "permissions": permission_sets["service_engineer"],
        },
    ]

    changed = False
    existing_roles = {role.code: role for role in db.query(models.UserRole).all()}
    legacy_physicist = existing_roles.get("physicist")
    if legacy_physicist is not None:
        db.query(models.UserAccount).filter(models.UserAccount.role_code == "physicist").update(
            {"role_code": "technologist"}
        )
        db.delete(legacy_physicist)
        changed = True

    for seed in role_seeds:
        existing = existing_roles.get(seed["code"])
        if existing is None:
            db.add(
                models.UserRole(
                    code=seed["code"],
                    name=seed["name"],
                    description=seed["description"],
                    permissions=json.dumps(seed["permissions"], ensure_ascii=False),
                    is_system=True,
                )
            )
            changed = True
            continue

        # Refresh permissions only if the current set matches one of the known
        # historic defaults. If the admin has manually changed permissions, the
        # set won't match any snapshot and we leave it alone.
        legacy_snapshots = legacy_permission_sets.get(seed["code"], [])
        if not existing.is_system or not legacy_snapshots:
            continue
        try:
            current = set(json.loads(existing.permissions or "[]"))
        except json.JSONDecodeError:
            current = set()
        if any(current == snapshot for snapshot in legacy_snapshots):
            existing.permissions = json.dumps(seed["permissions"], ensure_ascii=False)
            changed = True

    now = datetime.utcnow()
    user_seeds = [
        {
            "username": "U0001",
            "display_name": "系统管理员",
            "employee_id": "U0001",
            "department": "系统管理",
            "title": "管理员",
            "role_code": "system_admin",
            "status": "active",
            "login_allowed": True,
            "password_reset_required": True,
            "password_updated_at": now,
        },
        {
            "username": "T1001",
            "display_name": "值班技师",
            "employee_id": "T1001",
            "department": "放射科",
            "title": "CT 技师",
            "role_code": "technologist",
            "status": "active",
            "login_allowed": True,
            "password_reset_required": False,
            "last_login_at": now,
            "password_updated_at": now,
        },
        {
            "username": "T1002",
            "display_name": "扫描技师",
            "employee_id": "T1002",
            "department": "放射科",
            "title": "CT 技师",
            "role_code": "technologist",
            "status": "active",
            "login_allowed": True,
            "password_reset_required": True,
            "password_updated_at": now,
        },
        {
            "username": "T1003",
            "display_name": "质控技师",
            "employee_id": "T1003",
            "department": "放射科",
            "title": "CT 技师",
            "role_code": "technologist",
            "status": "active",
            "login_allowed": True,
            "password_reset_required": True,
            "password_updated_at": now,
        },
        {
            "username": "T1004",
            "display_name": "夜班技师",
            "employee_id": "T1004",
            "department": "放射科",
            "title": "CT 技师",
            "role_code": "technologist",
            "status": "active",
            "login_allowed": True,
            "password_reset_required": True,
            "password_updated_at": now,
        },
        {
            "username": "S2001",
            "display_name": "服务工程师",
            "employee_id": "S2001",
            "department": "设备服务",
            "title": "服务工程师",
            "role_code": "service_engineer",
            "status": "disabled",
            "login_allowed": False,
            "password_reset_required": False,
            "password_updated_at": now,
        },
        {
            "username": EMERGENCY_USERNAME,
            "display_name": "紧急管理员",
            "employee_id": EMERGENCY_USERNAME,
            "department": "急诊",
            "title": "紧急管理员",
            "role_code": "technologist",
            "status": "active",
            "login_allowed": True,
            "password_reset_required": False,
            "password_updated_at": now,
        },
    ]

    for user in db.query(models.UserAccount).all():
        target = (user.employee_id or user.username or "").strip()
        if not target:
            continue
        if user.username == target and user.employee_id == target:
            continue
        username_conflict = (
            db.query(models.UserAccount)
            .filter(models.UserAccount.id != user.id, models.UserAccount.username == target)
            .first()
        )
        employee_conflict = (
            db.query(models.UserAccount)
            .filter(models.UserAccount.id != user.id, models.UserAccount.employee_id == target)
            .first()
        )
        if username_conflict or employee_conflict:
            continue
        user.username = target
        user.employee_id = target
        changed = True

    existing_usernames = {
        username for (username,) in db.query(models.UserAccount.username).all()
    }
    existing_employee_ids = {
        employee_id
        for (employee_id,) in db.query(models.UserAccount.employee_id).all()
        if employee_id
    }
    from .auth_utils import hash_password

    for seed in user_seeds:
        if seed["username"] in existing_usernames or seed["employee_id"] in existing_employee_ids:
            continue
        # Initial password = username (e.g. U0001), forced reset on first login.
        seed_with_hash = {**seed, "password_hash": hash_password(seed["username"])}
        db.add(models.UserAccount(**seed_with_hash))
        changed = True

    # Backfill password_hash for users that exist without one (e.g. legacy databases
    # seeded before the auth column was added). Default password = username.
    for user in db.query(models.UserAccount).filter(models.UserAccount.password_hash.is_(None)).all():
        user.password_hash = hash_password(user.username)
        user.password_reset_required = True
        changed = True

    emergency = (
        db.query(models.UserAccount)
        .filter(models.UserAccount.username == EMERGENCY_USERNAME)
        .first()
    )
    if emergency and (not emergency.login_allowed or emergency.status != "active"):
        emergency.login_allowed = True
        emergency.status = "active"
        emergency.failed_attempts = 0
        emergency.locked_at = None
        changed = True

    if changed:
        db.commit()
        print("Seeded user management defaults")


# Cornerstone.js / OHIF mainstream CT viewer overlay convention.
# Field set + order per corner is fixed (UI invariant); user only toggles
# per-field visibility. Keep in sync with ui-review/src/lib/cornerConfig.ts
# CORNER_FIELD_CATALOG.
DEFAULT_CORNER_CONFIG: dict = {
    "corners": {
        "topLeft": [
            {"key": "patient_name",    "label": "姓名",     "visible": True},
            {"key": "patient_id",      "label": "ID",       "visible": True},
            {"key": "patient_gender",  "label": "性别",     "visible": True},
            {"key": "patient_dob",     "label": "出生日期", "visible": True},
        ],
        "topRight": [
            {"key": "institution_name",  "label": "机构",     "visible": True},
            {"key": "study_description", "label": "检查描述", "visible": True},
            {"key": "study_datetime",    "label": "检查时间", "visible": True},
            {"key": "accession_number",  "label": "登记号",   "visible": True},
        ],
        "bottomLeft": [
            {"key": "series_description", "label": "序列描述", "visible": True},
            {"key": "slice_thickness",    "label": "层厚",     "visible": True},
            {"key": "slice_location",     "label": "层位置",   "visible": True},
            {"key": "kvp",                "label": "kVp",      "visible": True},
            {"key": "mas",                "label": "mAs",      "visible": True},
        ],
        "bottomRight": [
            {"key": "image_index", "label": "图像",      "visible": True},
            {"key": "zoom",        "label": "缩放",      "visible": True},
            {"key": "window",      "label": "窗宽/窗位", "visible": True},
        ],
    }
}


def _corner_config_key_signature(config_json: str) -> tuple[tuple[str, ...], ...] | None:
    """Return a stable tuple of (corner -> tuple of field keys) used to detect
    whether a config still matches a known historic default. Returns None on
    parse errors."""
    try:
        parsed = json.loads(config_json or "{}")
    except json.JSONDecodeError:
        return None
    corners = parsed.get("corners")
    if not isinstance(corners, dict):
        return None
    return tuple(
        tuple(item.get("key", "") for item in corners.get(quadrant, []) if isinstance(item, dict))
        for quadrant in ("topLeft", "topRight", "bottomLeft", "bottomRight")
    )


# Historic factory defaults — used to detect "untouched" corner configs that
# should be auto-migrated to the new Cornerstone-aligned layout. If an existing
# DB has been hand-edited, the signature won't match any entry here and we
# leave it alone.
LEGACY_CORNER_SIGNATURES: list[tuple[tuple[str, ...], ...]] = [
    # Original seed (pre-2026-05): TR mixed scan_time + protocol_name.
    (
        ("patient_name", "patient_id"),
        ("scan_time", "protocol_name"),
        ("kv", "ma"),
        ("series_number", "image_number"),
    ),
    # Pre-OHIF-alignment seed (2026-05): 2 fields per corner, ad-hoc kv/ma/Se/Im.
    (
        ("patient_name", "patient_id"),
        ("institution_name", "scan_time"),
        ("kv", "ma"),
        ("series_number", "image_number"),
    ),
]


def _seed_corner_defaults(db) -> None:
    """Ensure a Default corner template exists and migrate untouched configs."""
    from . import models

    changed = False
    default_json = json.dumps(DEFAULT_CORNER_CONFIG, ensure_ascii=False)
    new_signature = _corner_config_key_signature(default_json)

    default_template = (
        db.query(models.CornerConfig)
        .filter(models.CornerConfig.template_name == "Default")
        .first()
    )
    if default_template is None:
        # No Default template yet — create one. If nothing else is active, mark
        # it active; otherwise leave the user's active template alone.
        any_active = db.query(models.CornerConfig).filter(models.CornerConfig.is_active == True).first()
        db.add(
            models.CornerConfig(
                template_name="Default",
                is_active=any_active is None,
                config_json=default_json,
            )
        )
        changed = True
    else:
        # Refresh the Default template if it still matches a historic default
        # (or is already on the new layout — idempotent).
        existing_sig = _corner_config_key_signature(default_template.config_json)
        if existing_sig != new_signature and existing_sig in LEGACY_CORNER_SIGNATURES:
            default_template.config_json = default_json
            changed = True

    # Auto-migrate any other template still on a historic default. Don't touch
    # templates that have been customized.
    for template in db.query(models.CornerConfig).all():
        if template.template_name == "Default":
            continue
        sig = _corner_config_key_signature(template.config_json)
        if sig in LEGACY_CORNER_SIGNATURES and sig != new_signature:
            template.config_json = default_json
            changed = True

    if changed:
        db.commit()
        print("Seeded / migrated corner defaults")


def assert_database_current(target_engine: Engine = engine) -> None:
    """目标数据库必须先通过 Alembic 建表，避免静默修改结构。"""
    from alembic.config import Config
    from alembic.migration import MigrationContext
    from alembic.script import ScriptDirectory

    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    scripts = ScriptDirectory.from_config(config)
    expected_heads = set(scripts.get_heads())

    with target_engine.connect() as connection:
        current_heads = set(MigrationContext.configure(connection).get_current_heads())

    if current_heads != expected_heads:
        raise RuntimeError(
            "数据库结构未迁移到最新版本。请先在项目根目录运行 "
            "`.\\.venv\\Scripts\\python.exe -m alembic upgrade head`。"
        )


def init_db() -> None:
    from . import models

    if engine.dialect.name == "sqlite":
        # SQLite 仅作为无 DATABASE_URL 时的本地兼容回退，保留旧库升级逻辑。
        Base.metadata.create_all(bind=engine)
        _migrate_protocol_columns()
        _cleanup_scan_session_orphans()
    else:
        assert_database_current()

    db = SessionLocal()
    try:
        _seed_dose_defaults(db)
        _seed_user_management_defaults(db)
        _seed_corner_defaults(db)
        if db.query(models.Protocol).first():
            seed_uses_company_csv = any(
                str(protocol_seed.get("description", "")).startswith(CSV_PROTOCOL_DESCRIPTION_PREFIX)
                for protocol_seed in PROTOCOL_SEEDS
            )
            current_csv_descriptions = {
                str(protocol_seed.get("description", ""))
                for protocol_seed in PROTOCOL_SEEDS
                if str(protocol_seed.get("description", "")).startswith(CSV_PROTOCOL_DESCRIPTION_PREFIX)
            }
            deleted_stale_protocols = 0
            if seed_uses_company_csv and current_csv_descriptions:
                stale_protocols = (
                    db.query(models.Protocol)
                    .filter(
                        models.Protocol.description.like(f"{CSV_PROTOCOL_DESCRIPTION_PREFIX}%"),
                        ~models.Protocol.description.in_(current_csv_descriptions),
                    )
                    .all()
                )
                if stale_protocols:
                    stale_ids = [protocol.id for protocol in stale_protocols]
                    referenced_protocol_ids = {
                        protocol_id
                        for (protocol_id,) in db.query(models.ScanSession.protocol_id)
                        .filter(models.ScanSession.protocol_id.in_(stale_ids))
                        .distinct()
                        .all()
                    }
                    for protocol in stale_protocols:
                        if protocol.id in referenced_protocol_ids:
                            continue
                        db.delete(protocol)
                        deleted_stale_protocols += 1
                    if deleted_stale_protocols:
                        db.flush()

            existing_keys = {
                (
                    protocol.name,
                    protocol.body_part,
                    protocol.age_group,
                    protocol.patient_weight,
                    protocol.scan_mode,
                )
                for protocol in db.query(models.Protocol).all()
                if not seed_uses_company_csv
                or str(protocol.description or "") in current_csv_descriptions
            }
            missing_protocols = [
                protocol_seed
                for protocol_seed in PROTOCOL_SEEDS
                if (
                    protocol_seed["name"],
                    protocol_seed["body_part"],
                    protocol_seed["age_group"],
                    protocol_seed["patient_weight"],
                    protocol_seed["scan_mode"],
                )
                not in existing_keys
            ]

            for protocol_seed in missing_protocols:
                seed_protocol(db, models, protocol_seed)

            renamed_brain_kernels = _sync_factory_brain_kernel_names(db, models)
            normalized_recon_spacing = _sync_factory_recon_spacing(db, models)
            if (
                missing_protocols
                or deleted_stale_protocols
                or renamed_brain_kernels
                or normalized_recon_spacing
            ):
                db.commit()
                print(
                    f"Synced seeded protocols: {len(missing_protocols)} added, "
                    f"{deleted_stale_protocols} stale removed, "
                    f"{renamed_brain_kernels} Brain kernels renamed, "
                    f"{normalized_recon_spacing} recon spacing normalized"
                )
            _seed_gating_protocols(db, models)
            print(f"Seeded protocols: {db.query(models.Protocol).count()}")
            return

        patient = models.Patient(
            name="Test Patient",
            patient_id="P20260330001",
            gender="male",
            age=38,
            birth_date=date(1988, 5, 12),
            height=175.0,
            weight=72.0,
        )
        db.add(patient)
        db.flush()

        for protocol_seed in PROTOCOL_SEEDS:
            seed_protocol(db, models, protocol_seed)

        _seed_gating_protocols(db, models)

        # Seed default corner config (Cornerstone.js / OHIF CT viewer layout).
        # Field set + order per corner is fixed; users only toggle visibility.
        db.add(models.CornerConfig(
            template_name="Default",
            is_active=True,
            config_json=json.dumps(DEFAULT_CORNER_CONFIG, ensure_ascii=False)
        ))

        db.commit()
        print(f"Seeded protocols: {len(PROTOCOL_SEEDS)}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
