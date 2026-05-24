from __future__ import annotations

import csv
from datetime import date
import json
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./backend/app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

CSV_PROTOCOL_DESCRIPTION_PREFIX = "protocol-csv:"


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
            recon("软组织", "Brain2", 512, 100, 40, 5.0, 5.0),
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
            recon("软组织", "Brain2", 512, 100, 600, 2.4, 2.4),
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
            recon("软组织", "Brain2", 512, 100, 600, 4.8, 4.8),
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
        "recons": [recon("骨骼", "Bone2", 512, 4000, 600, 0.6, 0.6)],
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
            recon("软组织", "Brain2", 512, 100, 40, 2.4, 2.4),
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
            recon("软组织", "Brain2", 512, 100, 40, 2.4, 2.4),
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
            recon("软组织", "Brain2", 512, 100, 40, 2.4, 2.4),
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
            recon("软组织", "Brain2", 512, 100, 40, 3.0, 3.0),
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
            recon("软组织", "Brain2", 512, 100, 40, 3.0, 3.0),
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
            recon("软组织", "Brain2", 512, 100, 40, 3.0, 3.0),
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
            recon("软组织", "Brain2", 512, 300, 40, 5.0, 5.0),
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
    {
        "name": "胸腔深吸气屏息（断层）",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {"kv": 120, "ma": 180, "slice_thickness": 1.25, "slice_interval": 20.0, "rotation_time": 1.0, "scan_length": 320.0, "fov": 350.0, "ctdi_vol": 7.5, "dlp": 120.0, "step_count": 16, "auto_ma": False},
        "gating_config": {"breathing_mode": "breath_hold_inspiration"},
        "recons": [
            recon("肺窗", "Lung2", 512, 1500, -700, 1.25, 1.25),
            recon("纵隔窗", "S2", 512, 400, 40, 1.25, 1.25),
        ],
    },
    {
        "name": "胸腔深吸气屏息（螺旋）",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "helical",
        "params": {"kv": 120, "ma": 180, "slice_thickness": 1.25, "pitch": 1.2, "rotation_time": 0.5, "scan_length": 350.0, "fov": 350.0, "ctdi_vol": 8.2, "dlp": 287.0, "auto_ma": False},
        "gating_config": {"breathing_mode": "breath_hold_inspiration"},
        "recons": [
            recon("肺窗", "Lung2", 512, 1500, -700, 1.25, 1.0),
            recon("纵隔窗", "S2", 512, 400, 40, 2.5, 2.0),
        ],
    },
    {
        "name": "胸腔自由呼吸（轴扫）",
        "age_group": "adult",
        "patient_weight": "50-90kg",
        "scan_mode": "plain",
        "series_kind": "axial",
        "params": {"kv": 120, "ma": 120, "slice_thickness": 1.25, "slice_interval": 20.0, "rotation_time": 1.0, "scan_length": 320.0, "fov": 350.0, "ctdi_vol": 5.2, "dlp": 83.2, "step_count": 16, "auto_ma": False},
        "gating_config": {
            "breathing_mode": "free_breathing",
            "target_phase": "max_inspiration",
            "threshold_normalized": 1.0,
            "trigger_direction": "rising",
            "wait_timeout_s": 30.0,
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
        "recons": [recon("骨骼", "S2", 512, 4000, 600, 2.4, None)],
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
        db.add(
            models.ReconSeries(
                series_id=diagnostic_series.id,
                recon_name=recon_seed["name"],
                recon_type=infer_recon_type(recon_seed["name"]),
                kernel=recon_seed["kernel"],
                matrix=recon_seed["matrix"],
                window_width=recon_seed["window_width"],
                window_level=recon_seed["window_level"],
                slice_thickness=recon_seed["slice_thickness"],
                increment=recon_seed["increment"],
                recon_fov=recon_seed.get("recon_fov"),
                center_x=recon_seed.get("center_x"),
                center_y=recon_seed.get("center_y"),
            )
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



def _migrate_protocol_columns() -> None:
    """Add new Protocol columns to existing SQLite database (idempotent)."""
    from sqlalchemy import text

    migrations = [
        # Patient additions
        "ALTER TABLE patients ADD COLUMN last_name VARCHAR(50)",
        "ALTER TABLE patients ADD COLUMN first_name VARCHAR(50)",
        "ALTER TABLE patients ADD COLUMN id_number VARCHAR(50)",
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
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                # Column already exists – safe to ignore
                pass
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


def init_db() -> None:
    from . import models

    Base.metadata.create_all(bind=engine)
    _migrate_protocol_columns()
    _cleanup_scan_session_orphans()

    db = SessionLocal()
    try:
        _seed_dose_defaults(db)
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

            if missing_protocols or deleted_stale_protocols:
                db.commit()
                print(
                    f"Synced seeded protocols: {len(missing_protocols)} added, "
                    f"{deleted_stale_protocols} stale removed"
                )
            print(f"Seeded protocols: {db.query(models.Protocol).count()}")
            return

        patient = models.Patient(
            name="Test Patient",
            patient_id="P20260330001",
            gender="male",
            birth_date=date(1988, 5, 12),
            height=175.0,
            weight=72.0,
        )
        db.add(patient)
        db.flush()

        for protocol_seed in PROTOCOL_SEEDS:
            seed_protocol(db, models, protocol_seed)

        # Seed default corner config
        default_corners = {
            "corners": {
                "topLeft": [
                    {"key": "patient_name", "label": "姓名", "visible": True},
                    {"key": "patient_id", "label": "ID", "visible": True}
                ],
                "topRight": [
                    {"key": "scan_time", "label": "时间", "visible": True},
                    {"key": "protocol_name", "label": "协议", "visible": True}
                ],
                "bottomLeft": [
                    {"key": "kv", "label": "kV", "visible": True},
                    {"key": "ma", "label": "mA", "visible": True}
                ],
                "bottomRight": [
                    {"key": "series_number", "label": "序列号", "visible": True},
                    {"key": "image_number", "label": "图像号", "visible": True}
                ]
            }
        }
        db.add(models.CornerConfig(
            template_name="Default",
            is_active=True,
            config_json=json.dumps(default_corners)
        ))

        db.commit()
        print(f"Seeded protocols: {len(PROTOCOL_SEEDS)}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
