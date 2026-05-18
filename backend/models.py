from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    last_name = Column(String(50), nullable=True)
    first_name = Column(String(50), nullable=True)
    patient_id = Column(String(50), nullable=False, unique=True, index=True)
    id_number = Column(String(50), nullable=True)
    gender = Column(String(20), nullable=False)
    birth_date = Column(Date, nullable=False)
    height = Column(Float, nullable=True)
    weight = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    scan_sessions = relationship("ScanSession", back_populates="patient")


class Protocol(Base):
    __tablename__ = "protocols"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    body_part = Column(String(100), nullable=False)
    age_group = Column(String(20), nullable=False, index=True)
    patient_weight = Column(String(50), nullable=False)
    patient_position = Column(String(10), nullable=False)
    table_direction = Column(String(10), nullable=False)
    acquisition_type = Column(String(20), nullable=False, default="regular", index=True)
    scan_mode = Column(String(20), nullable=False, index=True)
    is_4d = Column(Boolean, nullable=False, default=False)
    is_enhance = Column(Boolean, nullable=False, default=False)
    description = Column(Text, nullable=True)
    is_factory = Column(Boolean, nullable=False, default=False)
    is_enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    contrast_config = relationship(
        "ContrastConfig",
        back_populates="protocol",
        cascade="all, delete-orphan",
        uselist=False,
    )
    series = relationship(
        "Series",
        back_populates="protocol",
        cascade="all, delete-orphan",
        order_by="Series.series_order",
    )
    scan_sessions = relationship("ScanSession", back_populates="protocol")


class ContrastConfig(Base):
    __tablename__ = "contrast_configs"

    id = Column(Integer, primary_key=True, index=True)
    protocol_id = Column(Integer, ForeignKey("protocols.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    contrast_agent = Column(String(100), nullable=False)
    concentration = Column(Float, nullable=False)
    total_volume = Column(Float, nullable=False)
    injection_rate = Column(Float, nullable=False)
    saline_volume = Column(Float, nullable=False)
    saline_rate = Column(Float, nullable=False)

    protocol = relationship("Protocol", back_populates="contrast_config")


class Series(Base):
    __tablename__ = "series"
    __table_args__ = (UniqueConstraint("protocol_id", "series_order", name="uq_protocol_series_order"),)

    id = Column(Integer, primary_key=True, index=True)
    protocol_id = Column(Integer, ForeignKey("protocols.id", ondelete="CASCADE"), nullable=False, index=True)
    series_order = Column(Integer, nullable=False)
    series_type = Column(String(20), nullable=False)
    series_label = Column(String(100), nullable=False)
    contrast_delay = Column(Float, nullable=True)
    trigger_mode = Column(String(30), nullable=True)
    tracking_threshold = Column(Float, nullable=True)

    protocol = relationship("Protocol", back_populates="series")
    topogram_param = relationship(
        "TopogramParam",
        back_populates="series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    helical_param = relationship(
        "HelicalParam",
        back_populates="series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    axial_param = relationship(
        "AxialParam",
        back_populates="series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    recon_series = relationship(
        "ReconSeries",
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="ReconSeries.id",
    )
    fourd_config = relationship(
        "FourDConfig",
        back_populates="series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    gating_config = relationship(
        "GatingConfig",
        back_populates="series",
        cascade="all, delete-orphan",
        uselist=False,
    )


class TopogramParam(Base):
    __tablename__ = "topogram_params"

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id", ondelete="CASCADE"), nullable=False, unique=True)
    kv = Column(Integer, nullable=False, default=120)
    ma = Column(Integer, nullable=False, default=30)
    scan_length = Column(Float, nullable=False, default=80.0)
    tube_angle = Column(Float, nullable=False, default=270.0)
    fov = Column(Float, nullable=False, default=500.0)
    collimator = Column(String(50), nullable=True)
    scan_direction = Column(String(10), nullable=True, default="OUT")
    dom = Column(String(20), nullable=True)
    ctdi_vol = Column(Float, nullable=True)
    dlp = Column(Float, nullable=True)

    series = relationship("Series", back_populates="topogram_param")


class HelicalParam(Base):
    __tablename__ = "helical_params"

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id", ondelete="CASCADE"), nullable=False, unique=True)
    kv = Column(Integer, nullable=False)
    ma = Column(Integer, nullable=False)
    slice_thickness = Column(Float, nullable=False)
    pitch = Column(Float, nullable=False)
    rotation_time = Column(Float, nullable=False)
    scan_length = Column(Float, nullable=False)
    fov = Column(Float, nullable=False)
    collimator = Column(String(50), nullable=True)
    scan_direction = Column(String(10), nullable=True, default="OUT")
    dom = Column(String(20), nullable=True)
    ctdi_vol = Column(Float, nullable=True)
    dlp = Column(Float, nullable=True)
    auto_ma = Column(Boolean, nullable=False, default=False)
    ma_min = Column(Float, nullable=True)
    ma_max = Column(Float, nullable=True)

    series = relationship("Series", back_populates="helical_param")


class AxialParam(Base):
    __tablename__ = "axial_params"

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id", ondelete="CASCADE"), nullable=False, unique=True)
    kv = Column(Integer, nullable=False)
    ma = Column(Integer, nullable=False)
    slice_thickness = Column(Float, nullable=False)
    slice_interval = Column(Float, nullable=False)
    rotation_time = Column(Float, nullable=False)
    scan_length = Column(Float, nullable=False)
    fov = Column(Float, nullable=False)
    collimator = Column(String(50), nullable=True)
    scan_direction = Column(String(10), nullable=True, default="OUT")
    dom = Column(String(20), nullable=True)
    ctdi_vol = Column(Float, nullable=True)
    dlp = Column(Float, nullable=True)
    auto_ma = Column(Boolean, nullable=False, default=False)
    ma_min = Column(Float, nullable=True)
    ma_max = Column(Float, nullable=True)
    step_count = Column(Integer, nullable=True)

    series = relationship("Series", back_populates="axial_param")


class ReconSeries(Base):
    __tablename__ = "recon_series"

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id", ondelete="CASCADE"), nullable=False, index=True)
    recon_name = Column(String(100), nullable=False)
    recon_type = Column(String(20), nullable=False)
    kernel = Column(String(50), nullable=False)
    matrix = Column(Integer, nullable=False)
    window_width = Column(Integer, nullable=False)
    window_level = Column(Integer, nullable=False)
    slice_thickness = Column(Float, nullable=False)
    increment = Column(Float, nullable=True)
    recon_fov = Column(Float, nullable=True)
    center_x = Column(Float, nullable=True)
    center_y = Column(Float, nullable=True)

    series = relationship("Series", back_populates="recon_series")


class FourDConfig(Base):
    __tablename__ = "fourd_configs"

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    breathing_mode = Column(String(30), nullable=False)
    phase_count = Column(Integer, nullable=False)
    acquisition_time = Column(Float, nullable=False)
    trigger_threshold = Column(Float, nullable=True)

    series = relationship("Series", back_populates="fourd_config")
    breathing_training_param = relationship(
        "BreathingTrainingParam",
        back_populates="fourd_config",
        cascade="all, delete-orphan",
        uselist=False,
    )


class BreathingTrainingParam(Base):
    __tablename__ = "breathing_training_params"

    id = Column(Integer, primary_key=True, index=True)
    fourd_config_id = Column(Integer, ForeignKey("fourd_configs.id", ondelete="CASCADE"), nullable=False, unique=True)
    training_duration = Column(Float, nullable=False)
    target_amplitude = Column(Float, nullable=False)
    tolerance_range = Column(Float, nullable=False)

    fourd_config = relationship("FourDConfig", back_populates="breathing_training_param")


class GatingConfig(Base):
    __tablename__ = "gating_configs"

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    # "breath_hold_inspiration" | "breath_hold_expiration" | "free_breathing"
    breathing_mode = Column(String(30), nullable=False)
    # --- free-breathing prospective trigger (axial, 19.2mm bed step) ---
    # target phase preset: max_inspiration / max_expiration / custom
    target_phase = Column(String(20), nullable=True, default="max_inspiration")
    # normalized amplitude threshold in [-2.0, +2.0]; +1 = avg max inspiration, -1 = avg max expiration
    threshold_normalized = Column(Float, nullable=True, default=1.0)
    # trigger direction across threshold: "rising" | "falling"
    trigger_direction = Column(String(10), nullable=True, default="rising")
    # max seconds to wait for one trigger before prompting technician
    wait_timeout_s = Column(Float, nullable=True, default=30.0)
    # --- shared stability thresholds ---
    trigger_delay_ms = Column(Integer, nullable=False, default=0)
    stability_cv_threshold = Column(Float, nullable=False, default=0.15)
    baseline_drift_mm_threshold = Column(Float, nullable=False, default=5.0)
    # --- breath-hold (DIBH) ---
    breath_hold_timeout_s = Column(Float, nullable=True, default=25.0)
    breath_hold_amplitude_tolerance_mm = Column(Float, nullable=True, default=2.0)
    # --- deprecated (kept for SQLite back-compat; not used by new schema) ---
    # NOTE: existing sqlite databases declared these as NOT NULL; provide defaults so
    # ORM inserts succeed without requiring a destructive table rebuild.
    phase_start_pct = Column(Float, nullable=True, default=0.0, server_default="0")
    phase_end_pct = Column(Float, nullable=True, default=0.0, server_default="0")
    max_triggers_per_cycle = Column(Integer, nullable=True, default=1, server_default="1")

    series = relationship("Series", back_populates="gating_config")


class ScanSession(Base):
    __tablename__ = "scan_sessions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False, index=True)
    protocol_id = Column(Integer, ForeignKey("protocols.id", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="draft", index=True)
    session_name = Column(String(120), nullable=True)
    name = Column(String(100), nullable=False, index=True)
    body_part = Column(String(100), nullable=False)
    age_group = Column(String(20), nullable=False, index=True)
    patient_weight = Column(String(50), nullable=False)
    patient_position = Column(String(10), nullable=False)
    table_direction = Column(String(10), nullable=False)
    acquisition_type = Column(String(20), nullable=False, default="regular", index=True)
    scan_mode = Column(String(20), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    patient = relationship("Patient", back_populates="scan_sessions")
    protocol = relationship("Protocol", back_populates="scan_sessions")
    contrast_config = relationship(
        "ScanSessionContrastConfig",
        back_populates="scan_session",
        cascade="all, delete-orphan",
        uselist=False,
    )
    series = relationship(
        "ScanSessionSeries",
        back_populates="scan_session",
        cascade="all, delete-orphan",
        order_by="ScanSessionSeries.series_order",
    )


class ScanSessionContrastConfig(Base):
    __tablename__ = "scan_session_contrast_configs"

    id = Column(Integer, primary_key=True, index=True)
    scan_session_id = Column(Integer, ForeignKey("scan_sessions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    template_contrast_config_id = Column(Integer, ForeignKey("contrast_configs.id", ondelete="SET NULL"), nullable=True)
    contrast_agent = Column(String(100), nullable=False)
    concentration = Column(Float, nullable=False)
    total_volume = Column(Float, nullable=False)
    injection_rate = Column(Float, nullable=False)
    saline_volume = Column(Float, nullable=False)
    saline_rate = Column(Float, nullable=False)

    scan_session = relationship("ScanSession", back_populates="contrast_config")


class ScanSessionSeries(Base):
    __tablename__ = "scan_session_series"
    __table_args__ = (UniqueConstraint("scan_session_id", "series_order", name="uq_scan_session_series_order"),)

    id = Column(Integer, primary_key=True, index=True)
    scan_session_id = Column(Integer, ForeignKey("scan_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    template_series_id = Column(Integer, ForeignKey("series.id", ondelete="SET NULL"), nullable=True, index=True)
    series_order = Column(Integer, nullable=False)
    series_type = Column(String(20), nullable=False)
    series_label = Column(String(100), nullable=False)
    contrast_delay = Column(Float, nullable=True)
    trigger_mode = Column(String(30), nullable=True)
    tracking_threshold = Column(Float, nullable=True)

    scan_session = relationship("ScanSession", back_populates="series")
    topogram_param = relationship(
        "ScanSessionTopogramParam",
        back_populates="session_series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    helical_param = relationship(
        "ScanSessionHelicalParam",
        back_populates="session_series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    axial_param = relationship(
        "ScanSessionAxialParam",
        back_populates="session_series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    recon_series = relationship(
        "ScanSessionReconSeries",
        back_populates="session_series",
        cascade="all, delete-orphan",
        order_by="ScanSessionReconSeries.id",
    )
    fourd_config = relationship(
        "ScanSessionFourDConfig",
        back_populates="session_series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    gating_config = relationship(
        "ScanSessionGatingConfig",
        back_populates="session_series",
        cascade="all, delete-orphan",
        uselist=False,
    )


class ScanSessionTopogramParam(Base):
    __tablename__ = "scan_session_topogram_params"

    id = Column(Integer, primary_key=True, index=True)
    scan_session_series_id = Column(Integer, ForeignKey("scan_session_series.id", ondelete="CASCADE"), nullable=False, unique=True)
    template_param_id = Column(Integer, ForeignKey("topogram_params.id", ondelete="SET NULL"), nullable=True)
    kv = Column(Integer, nullable=False, default=120)
    ma = Column(Integer, nullable=False, default=30)
    scan_length = Column(Float, nullable=False, default=80.0)
    tube_angle = Column(Float, nullable=False, default=270.0)
    fov = Column(Float, nullable=False, default=500.0)
    collimator = Column(String(50), nullable=True)
    scan_direction = Column(String(10), nullable=True, default="OUT")
    dom = Column(String(20), nullable=True)
    ctdi_vol = Column(Float, nullable=True)
    dlp = Column(Float, nullable=True)

    session_series = relationship("ScanSessionSeries", back_populates="topogram_param")


class ScanSessionHelicalParam(Base):
    __tablename__ = "scan_session_helical_params"

    id = Column(Integer, primary_key=True, index=True)
    scan_session_series_id = Column(Integer, ForeignKey("scan_session_series.id", ondelete="CASCADE"), nullable=False, unique=True)
    template_param_id = Column(Integer, ForeignKey("helical_params.id", ondelete="SET NULL"), nullable=True)
    kv = Column(Integer, nullable=False)
    ma = Column(Integer, nullable=False)
    slice_thickness = Column(Float, nullable=False)
    pitch = Column(Float, nullable=False)
    rotation_time = Column(Float, nullable=False)
    scan_length = Column(Float, nullable=False)
    fov = Column(Float, nullable=False)
    collimator = Column(String(50), nullable=True)
    scan_direction = Column(String(10), nullable=True, default="OUT")
    dom = Column(String(20), nullable=True)
    ctdi_vol = Column(Float, nullable=True)
    dlp = Column(Float, nullable=True)
    auto_ma = Column(Boolean, nullable=False, default=False)
    ma_min = Column(Float, nullable=True)
    ma_max = Column(Float, nullable=True)

    session_series = relationship("ScanSessionSeries", back_populates="helical_param")


class ScanSessionAxialParam(Base):
    __tablename__ = "scan_session_axial_params"

    id = Column(Integer, primary_key=True, index=True)
    scan_session_series_id = Column(Integer, ForeignKey("scan_session_series.id", ondelete="CASCADE"), nullable=False, unique=True)
    template_param_id = Column(Integer, ForeignKey("axial_params.id", ondelete="SET NULL"), nullable=True)
    kv = Column(Integer, nullable=False)
    ma = Column(Integer, nullable=False)
    slice_thickness = Column(Float, nullable=False)
    slice_interval = Column(Float, nullable=False)
    rotation_time = Column(Float, nullable=False)
    scan_length = Column(Float, nullable=False)
    fov = Column(Float, nullable=False)
    collimator = Column(String(50), nullable=True)
    scan_direction = Column(String(10), nullable=True, default="OUT")
    dom = Column(String(20), nullable=True)
    ctdi_vol = Column(Float, nullable=True)
    dlp = Column(Float, nullable=True)
    auto_ma = Column(Boolean, nullable=False, default=False)
    ma_min = Column(Float, nullable=True)
    ma_max = Column(Float, nullable=True)
    step_count = Column(Integer, nullable=True)

    session_series = relationship("ScanSessionSeries", back_populates="axial_param")


class ScanSessionReconSeries(Base):
    __tablename__ = "scan_session_recon_series"

    id = Column(Integer, primary_key=True, index=True)
    scan_session_series_id = Column(Integer, ForeignKey("scan_session_series.id", ondelete="CASCADE"), nullable=False, index=True)
    template_recon_series_id = Column(Integer, ForeignKey("recon_series.id", ondelete="SET NULL"), nullable=True)
    recon_name = Column(String(100), nullable=False)
    recon_type = Column(String(20), nullable=False)
    kernel = Column(String(50), nullable=False)
    matrix = Column(Integer, nullable=False)
    window_width = Column(Integer, nullable=False)
    window_level = Column(Integer, nullable=False)
    slice_thickness = Column(Float, nullable=False)
    increment = Column(Float, nullable=True)

    session_series = relationship("ScanSessionSeries", back_populates="recon_series")


class ScanSessionFourDConfig(Base):
    __tablename__ = "scan_session_fourd_configs"

    id = Column(Integer, primary_key=True, index=True)
    scan_session_series_id = Column(Integer, ForeignKey("scan_session_series.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    template_config_id = Column(Integer, ForeignKey("fourd_configs.id", ondelete="SET NULL"), nullable=True)
    breathing_mode = Column(String(30), nullable=False)
    phase_count = Column(Integer, nullable=False)
    acquisition_time = Column(Float, nullable=False)
    trigger_threshold = Column(Float, nullable=True)

    session_series = relationship("ScanSessionSeries", back_populates="fourd_config")
    breathing_training_param = relationship(
        "ScanSessionBreathingTrainingParam",
        back_populates="fourd_config",
        cascade="all, delete-orphan",
        uselist=False,
    )


class ScanSessionBreathingTrainingParam(Base):
    __tablename__ = "scan_session_breathing_training_params"

    id = Column(Integer, primary_key=True, index=True)
    scan_session_fourd_config_id = Column(Integer, ForeignKey("scan_session_fourd_configs.id", ondelete="CASCADE"), nullable=False, unique=True)
    template_param_id = Column(Integer, ForeignKey("breathing_training_params.id", ondelete="SET NULL"), nullable=True)
    training_duration = Column(Float, nullable=False)
    target_amplitude = Column(Float, nullable=False)
    tolerance_range = Column(Float, nullable=False)

    fourd_config = relationship("ScanSessionFourDConfig", back_populates="breathing_training_param")


class ScanSessionGatingConfig(Base):
    __tablename__ = "scan_session_gating_configs"

    id = Column(Integer, primary_key=True, index=True)
    scan_session_series_id = Column(Integer, ForeignKey("scan_session_series.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    template_config_id = Column(Integer, ForeignKey("gating_configs.id", ondelete="SET NULL"), nullable=True)
    breathing_mode = Column(String(30), nullable=False)
    target_phase = Column(String(20), nullable=True, default="max_inspiration")
    threshold_normalized = Column(Float, nullable=True, default=1.0)
    trigger_direction = Column(String(10), nullable=True, default="rising")
    wait_timeout_s = Column(Float, nullable=True, default=30.0)
    trigger_delay_ms = Column(Integer, nullable=False, default=0)
    stability_cv_threshold = Column(Float, nullable=False, default=0.15)
    baseline_drift_mm_threshold = Column(Float, nullable=False, default=5.0)
    breath_hold_timeout_s = Column(Float, nullable=True, default=25.0)
    breath_hold_amplitude_tolerance_mm = Column(Float, nullable=True, default=2.0)
    # deprecated columns retained for sqlite back-compat (existing DB has NOT NULL)
    phase_start_pct = Column(Float, nullable=True, default=0.0, server_default="0")
    phase_end_pct = Column(Float, nullable=True, default=0.0, server_default="0")
    max_triggers_per_cycle = Column(Integer, nullable=True, default=1, server_default="1")

    session_series = relationship("ScanSessionSeries", back_populates="gating_config")


class CornerConfig(Base):
    __tablename__ = "corner_configs"

    id = Column(Integer, primary_key=True, index=True)
    template_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, nullable=False, default=False)
    config_json = Column(Text, nullable=False)  # Stores the JSON representation of the configuration
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now())


class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    level = Column(String(10), nullable=False, index=True)  # DEBUG / INFO / WARNING / ERROR / CRITICAL
    source = Column(String(50), nullable=False, index=True)  # module name, e.g. "scan_sessions", "main"
    event = Column(String(50), nullable=False, index=True)  # short event code, e.g. "scan_started"
    message = Column(Text, nullable=False)
    details = Column(Text, nullable=True)  # optional JSON blob
    scan_session_id = Column(Integer, ForeignKey("scan_sessions.id", ondelete="SET NULL"), nullable=True, index=True)


class DoseLog(Base):
    __tablename__ = "dose_logs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    scanned_at = Column(DateTime(timezone=True), nullable=False, index=True)

    # FKs kept SET NULL so log rows survive even if upstream rows are deleted.
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    scan_session_id = Column(Integer, ForeignKey("scan_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    scan_session_series_id = Column(Integer, ForeignKey("scan_session_series.id", ondelete="SET NULL"), nullable=True, index=True)

    # Snapshots — frozen at write time so the log remains meaningful even after deletes/edits.
    patient_name_snapshot = Column(String(100), nullable=True)
    patient_id_snapshot = Column(String(50), nullable=True, index=True)
    protocol_name_snapshot = Column(String(100), nullable=True)

    # Scan context
    series_order = Column(Integer, nullable=True)
    series_type = Column(String(20), nullable=False, index=True)  # topogram / helical / axial
    series_label = Column(String(100), nullable=True)
    body_part = Column(String(100), nullable=True)
    scan_mode = Column(String(20), nullable=True)

    # Dose parameters (nullable — different series types populate different subsets)
    kv = Column(Integer, nullable=True)
    ma = Column(Float, nullable=True)
    rotation_time = Column(Float, nullable=True)
    pitch = Column(Float, nullable=True)  # helical only
    scan_length = Column(Float, nullable=True)
    collimator = Column(String(50), nullable=True)
    ctdi_vol = Column(Float, nullable=True)
    dlp = Column(Float, nullable=True)

    operator = Column(String(50), nullable=True)  # reserved for future
