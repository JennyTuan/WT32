from __future__ import annotations

from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./backend/app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(models.Patient).first():
            return

        patient = models.Patient(
            name="Test Patient",
            patient_id="P20260327001",
            gender="male",
            birth_date=date(1988, 5, 12),
            height=175.0,
            weight=72.0,
        )
        db.add(patient)
        db.flush()

        plain_protocol = models.Protocol(
            name="Chest Plain Routine",
            body_part="chest",
            scan_mode="plain",
            description="Topogram plus routine helical and focal axial follow-up.",
        )
        contrast_protocol = models.Protocol(
            name="Liver Triple Phase Contrast",
            body_part="abdomen",
            scan_mode="contrast",
            description="Shared injector config with arterial, venous, and delayed helical phases.",
        )
        db.add_all([plain_protocol, contrast_protocol])
        db.flush()

        db.add(
            models.ContrastConfig(
                protocol_id=contrast_protocol.id,
                contrast_agent="Iohexol 350",
                concentration=350.0,
                total_volume=95.0,
                injection_rate=3.5,
                saline_volume=30.0,
                saline_rate=3.5,
            )
        )

        plain_topogram = models.Series(
            protocol_id=plain_protocol.id,
            series_order=1,
            series_type="topogram",
            series_label="Chest Topogram",
            trigger_mode="manual",
        )
        plain_helical = models.Series(
            protocol_id=plain_protocol.id,
            series_order=2,
            series_type="helical",
            series_label="Chest Helical",
            trigger_mode="manual",
        )
        plain_axial = models.Series(
            protocol_id=plain_protocol.id,
            series_order=3,
            series_type="axial",
            series_label="Lesion Axial Review",
            trigger_mode="manual",
        )

        contrast_topogram = models.Series(
            protocol_id=contrast_protocol.id,
            series_order=1,
            series_type="topogram",
            series_label="Abdomen Topogram",
            trigger_mode="manual",
        )
        arterial = models.Series(
            protocol_id=contrast_protocol.id,
            series_order=2,
            series_type="helical",
            series_label="Arterial Phase",
            contrast_delay=25.0,
            trigger_mode="bolus_tracking",
            tracking_threshold=120.0,
        )
        venous = models.Series(
            protocol_id=contrast_protocol.id,
            series_order=3,
            series_type="helical",
            series_label="Venous Phase",
            contrast_delay=65.0,
            trigger_mode="auto_timing",
        )
        delayed = models.Series(
            protocol_id=contrast_protocol.id,
            series_order=4,
            series_type="helical",
            series_label="Delayed Phase",
            contrast_delay=180.0,
            trigger_mode="auto_timing",
        )
        db.add_all([plain_topogram, plain_helical, plain_axial, contrast_topogram, arterial, venous, delayed])
        db.flush()

        db.add_all(
            [
                models.TopogramParam(
                    series_id=plain_topogram.id,
                    kv=120,
                    ma=40,
                    scan_length=320.0,
                    scan_direction="cranio-caudal",
                    fov=500.0,
                ),
                models.HelicalParam(
                    series_id=plain_helical.id,
                    kv=120,
                    ma=180,
                    slice_thickness=1.0,
                    pitch=1.2,
                    rotation_time=0.5,
                    scan_length=380.0,
                    fov=350.0,
                    ctdi_vol=9.5,
                    auto_ma=True,
                    ma_min=80.0,
                    ma_max=280.0,
                ),
                models.AxialParam(
                    series_id=plain_axial.id,
                    kv=100,
                    ma=220,
                    slice_thickness=1.25,
                    slice_interval=1.25,
                    rotation_time=0.7,
                    scan_length=120.0,
                    fov=250.0,
                    ctdi_vol=11.0,
                    auto_ma=False,
                ),
                models.TopogramParam(
                    series_id=contrast_topogram.id,
                    kv=120,
                    ma=35,
                    scan_length=420.0,
                    scan_direction="cranio-caudal",
                    fov=500.0,
                ),
                models.HelicalParam(
                    series_id=arterial.id,
                    kv=120,
                    ma=210,
                    slice_thickness=1.0,
                    pitch=1.1,
                    rotation_time=0.5,
                    scan_length=420.0,
                    fov=380.0,
                    ctdi_vol=12.0,
                    auto_ma=True,
                    ma_min=100.0,
                    ma_max=320.0,
                ),
                models.HelicalParam(
                    series_id=venous.id,
                    kv=120,
                    ma=200,
                    slice_thickness=1.0,
                    pitch=1.1,
                    rotation_time=0.5,
                    scan_length=420.0,
                    fov=380.0,
                    ctdi_vol=11.6,
                    auto_ma=True,
                    ma_min=90.0,
                    ma_max=300.0,
                ),
                models.HelicalParam(
                    series_id=delayed.id,
                    kv=120,
                    ma=180,
                    slice_thickness=1.0,
                    pitch=1.0,
                    rotation_time=0.5,
                    scan_length=420.0,
                    fov=380.0,
                    ctdi_vol=10.8,
                    auto_ma=True,
                    ma_min=80.0,
                    ma_max=280.0,
                ),
            ]
        )

        db.add_all(
            [
                models.ReconSeries(
                    series_id=plain_helical.id,
                    recon_name="Soft Tissue",
                    recon_type="soft",
                    kernel="B30f",
                    matrix=512,
                    window_width=350,
                    window_level=40,
                    slice_thickness=1.0,
                    increment=0.8,
                ),
                models.ReconSeries(
                    series_id=plain_helical.id,
                    recon_name="Bone",
                    recon_type="bone",
                    kernel="B60f",
                    matrix=512,
                    window_width=1800,
                    window_level=450,
                    slice_thickness=1.0,
                    increment=0.8,
                ),
                models.ReconSeries(
                    series_id=plain_axial.id,
                    recon_name="Lung",
                    recon_type="lung",
                    kernel="B70f",
                    matrix=512,
                    window_width=1500,
                    window_level=-600,
                    slice_thickness=1.25,
                    increment=1.0,
                ),
                models.ReconSeries(
                    series_id=arterial.id,
                    recon_name="Arterial Vascular",
                    recon_type="vascular",
                    kernel="B20f",
                    matrix=512,
                    window_width=700,
                    window_level=150,
                    slice_thickness=1.0,
                    increment=0.7,
                ),
                models.ReconSeries(
                    series_id=venous.id,
                    recon_name="Venous Soft Tissue",
                    recon_type="soft",
                    kernel="B30f",
                    matrix=512,
                    window_width=400,
                    window_level=50,
                    slice_thickness=1.0,
                    increment=0.8,
                ),
                models.ReconSeries(
                    series_id=delayed.id,
                    recon_name="Delayed Soft Tissue",
                    recon_type="soft",
                    kernel="B31f",
                    matrix=512,
                    window_width=380,
                    window_level=45,
                    slice_thickness=1.0,
                    increment=0.8,
                ),
            ]
        )

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
