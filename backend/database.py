from __future__ import annotations

from datetime import date
import json

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./backend/app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
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


PROTOCOL_SEEDS = [
    *build_protocols("head", "HFS", "in", HEAD_PROTOCOLS),
    *build_protocols("neck", "HFS", "in", NECK_PROTOCOLS),
    *build_protocols("chest", "HFS", "in", CHEST_PROTOCOLS),
    *build_protocols("spine", "HFS", "in", SPINE_PROTOCOLS),
    *build_protocols("abdomen", "HFS", "in", ABDOMEN_PROTOCOLS),
    *build_protocols("extremity", "HFS", "in", EXTREMITY_PROTOCOLS),
]


def infer_recon_type(recon_name: str) -> str:
    if "肺" in recon_name:
        return "lung"
    if "骨" in recon_name or "鼻窦" in recon_name:
        return "bone"
    if "血" in recon_name or "vascular" in recon_name.lower():
        return "vascular"
    return "soft"



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
        "ALTER TABLE protocols ADD COLUMN is_factory BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE protocols ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT 1",
        "ALTER TABLE protocols ADD COLUMN updated_at DATETIME",
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
        # Recon Series additions
        "ALTER TABLE recon_series ADD COLUMN recon_fov FLOAT",
        "ALTER TABLE recon_series ADD COLUMN center_x FLOAT",
        "ALTER TABLE recon_series ADD COLUMN center_y FLOAT",
        # Scan Session Recon Series additions
        "ALTER TABLE scan_session_recon_series ADD COLUMN recon_fov FLOAT",
        "ALTER TABLE scan_session_recon_series ADD COLUMN center_x FLOAT",
        "ALTER TABLE scan_session_recon_series ADD COLUMN center_y FLOAT",
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
            "UPDATE protocols SET is_factory = 0 "
            "WHERE description IS NULL OR description NOT LIKE '%seeded protocol'"
        ))
        conn.execute(text(
            "UPDATE protocols SET is_4d = 1 WHERE scan_mode = '4d'"
        ))
        conn.execute(text(
            "UPDATE protocols SET is_enhance = 1 WHERE scan_mode = 'contrast'"
        ))
        conn.commit()


def init_db() -> None:
    from . import models

    Base.metadata.create_all(bind=engine)
    _migrate_protocol_columns()

    db = SessionLocal()
    try:
        if db.query(models.Protocol).first():
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
            protocol = models.Protocol(
                name=protocol_seed["name"],
                body_part=protocol_seed["body_part"],
                age_group=protocol_seed["age_group"],
                patient_weight=protocol_seed["patient_weight"],
                patient_position=protocol_seed["patient_position"],
                table_direction=protocol_seed["table_direction"],
                scan_mode=protocol_seed["scan_mode"],
                is_4d=protocol_seed["scan_mode"] == "4d",
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
                    )
                )

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
