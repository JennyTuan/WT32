from __future__ import annotations

from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, false
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
    age = Column(Integer, nullable=False)
    birth_date = Column(Date, nullable=True)
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
    focus_size = Column(String(10), nullable=False, default="small")
    bowtie_type = Column(String(10), nullable=False, default="medium")
    scan_direction = Column(String(20), nullable=True, default="HEAD_TO_FOOT")
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
    focus_size = Column(String(10), nullable=False, default="small")
    bowtie_type = Column(String(10), nullable=False, default="medium")
    scan_direction = Column(String(20), nullable=True, default="HEAD_TO_FOOT")
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
    focus_size = Column(String(10), nullable=False, default="small")
    bowtie_type = Column(String(10), nullable=False, default="medium")
    scan_direction = Column(String(20), nullable=True, default="HEAD_TO_FOOT")
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


class ScanExam(Base):
    __tablename__ = "scan_exams"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="in_progress", server_default="in_progress", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    patient = relationship("Patient")
    scan_sessions = relationship("ScanSession", back_populates="exam")


class ScanSession(Base):
    __tablename__ = "scan_sessions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False, index=True)
    exam_id = Column(Integer, ForeignKey("scan_exams.id", ondelete="RESTRICT"), nullable=True, index=True)
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
    exam = relationship("ScanExam", back_populates="scan_sessions")
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
    fourd_result = relationship(
        "ScanSessionFourDResult",
        back_populates="scan_session",
        cascade="all, delete-orphan",
        uselist=False,
    )
    workflow_actions = relationship(
        "ScanSessionWorkflowAction",
        back_populates="scan_session",
        cascade="all, delete-orphan",
        order_by="ScanSessionWorkflowAction.id",
    )
    series_attempts = relationship(
        "ScanSessionSeriesAttempt",
        back_populates="scan_session",
        cascade="all, delete-orphan",
        order_by="ScanSessionSeriesAttempt.id",
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
    __table_args__ = (
        UniqueConstraint(
            "scan_session_id",
            "series_order",
            name="uq_scan_session_series_order",
        ),
        CheckConstraint(
            "(image_source_id IS NULL AND image_source_version IS NULL) OR "
            "(image_source_id IS NOT NULL AND image_source_version IS NOT NULL)",
            name="ck_scan_session_series_image_source_pair",
        ),
        CheckConstraint(
            "image_source_id IS NULL OR image_source_id IN ("
            "'head-stroke-topogram', "
            "'head-dual-scout-demo', "
            "'brain-helical-demo', "
            "'limbs-helical-demo', "
            "'qin-lung-topogram', "
            "'fourd-scout-demo', "
            "'qin-lung-helical-demo', "
            "'head-topogram-demo', 'head-diagnostic-demo', "
            "'neck-topogram-demo', 'neck-diagnostic-demo', "
            "'chest-topogram-demo', 'chest-diagnostic-demo', "
            "'abdomen-topogram-demo', 'abdomen-diagnostic-demo', "
            "'spine-topogram-demo', 'spine-diagnostic-demo', "
            "'extremity-topogram-demo', 'extremity-diagnostic-demo'"
            ")",
            name="ck_scan_session_series_image_source_allowlist",
        ),
        CheckConstraint(
            "image_source_version IS NULL OR image_source_version = 1",
            name="ck_scan_session_series_image_source_version",
        ),
        CheckConstraint(
            "image_source_id IS NULL OR ("
            "(series_type = 'topogram' AND image_source_id IN ("
            "'head-stroke-topogram', 'head-dual-scout-demo', "
            "'limbs-helical-demo', 'qin-lung-topogram', 'fourd-scout-demo', "
            "'head-topogram-demo', 'neck-topogram-demo', 'chest-topogram-demo', "
            "'abdomen-topogram-demo', 'spine-topogram-demo', 'extremity-topogram-demo'"
            ")) OR "
            "(series_type = 'helical' AND image_source_id IN ("
            "'brain-helical-demo', 'limbs-helical-demo', 'qin-lung-helical-demo', "
            "'head-diagnostic-demo', 'neck-diagnostic-demo', 'chest-diagnostic-demo', "
            "'abdomen-diagnostic-demo', 'spine-diagnostic-demo', 'extremity-diagnostic-demo'"
            ")) OR "
            "(series_type = 'axial' AND image_source_id IN ("
            "'head-diagnostic-demo', 'neck-diagnostic-demo', 'chest-diagnostic-demo', "
            "'abdomen-diagnostic-demo', 'spine-diagnostic-demo', 'extremity-diagnostic-demo'"
            "))"
            ")",
            name="ck_scan_session_series_image_source_type",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    scan_session_id = Column(Integer, ForeignKey("scan_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    template_series_id = Column(Integer, ForeignKey("series.id", ondelete="SET NULL"), nullable=True, index=True)
    series_order = Column(Integer, nullable=False)
    series_type = Column(String(20), nullable=False)
    series_label = Column(String(100), nullable=False)
    contrast_delay = Column(Float, nullable=True)
    trigger_mode = Column(String(30), nullable=True)
    tracking_threshold = Column(Float, nullable=True)
    execution_status = Column(String(20), nullable=False, default="pending", server_default="pending", index=True)
    failure_reason = Column(Text, nullable=True)
    range_confirmed = Column(Boolean, nullable=False, default=False, server_default=false())
    image_source_id = Column(String(100), nullable=True)
    image_source_version = Column(Integer, nullable=True)

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
    scan_planning = relationship(
        "ScanSessionScanPlanning",
        back_populates="session_series",
        cascade="all, delete-orphan",
        foreign_keys="ScanSessionScanPlanning.scan_session_series_id",
        uselist=False,
    )
    fourd_result = relationship(
        "ScanSessionFourDResult",
        back_populates="target_series",
        passive_deletes=True,
        uselist=False,
    )
    attempts = relationship(
        "ScanSessionSeriesAttempt",
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="ScanSessionSeriesAttempt.attempt_number",
    )


class ScanSessionScanPlanning(Base):
    __tablename__ = "scan_session_scan_plannings"
    __table_args__ = (
        CheckConstraint(
            "(range_min_position_mm IS NULL AND range_max_position_mm IS NULL) OR "
            "(range_min_position_mm IS NOT NULL AND range_max_position_mm IS NOT NULL "
            "AND range_min_position_mm <= range_max_position_mm)",
            name="ck_scan_session_planning_range",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    scan_session_series_id = Column(
        Integer,
        ForeignKey("scan_session_series.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    source_topogram_series_id = Column(
        Integer,
        ForeignKey("scan_session_series.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    range_min_position_mm = Column(Float, nullable=True)
    range_max_position_mm = Column(Float, nullable=True)
    scan_direction = Column(String(20), nullable=False, default="HEAD_TO_FOOT")

    session_series = relationship(
        "ScanSessionSeries",
        back_populates="scan_planning",
        foreign_keys=[scan_session_series_id],
    )
    source_topogram_series = relationship(
        "ScanSessionSeries",
        foreign_keys=[source_topogram_series_id],
    )


class ScanSessionFourDResult(Base):
    __tablename__ = "scan_session_fourd_results"
    __table_args__ = (
        UniqueConstraint("scan_session_id", name="uq_scan_session_fourd_results_scan_session"),
        UniqueConstraint("target_series_id", name="uq_scan_session_fourd_results_target_series"),
        CheckConstraint("version >= 1", name="ck_scan_session_fourd_results_version_positive"),
        CheckConstraint("source_kind = 'simulation'", name="ck_scan_session_fourd_results_source_simulation"),
        CheckConstraint(
            "image_source_id = 'fourd-engineer'",
            name="ck_scan_session_fourd_results_image_source",
        ),
        CheckConstraint(
            "image_source_version = 1",
            name="ck_scan_session_fourd_results_image_source_version",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    scan_session_id = Column(Integer, ForeignKey("scan_sessions.id", ondelete="CASCADE"), nullable=False)
    target_series_id = Column(Integer, ForeignKey("scan_session_series.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False, default=1, server_default="1")
    workflow_stage = Column(String(30), nullable=False)
    # 仅保存明确标识的模拟结果，不把它描述为真实设备采集结果。
    source_kind = Column(String(20), nullable=False, default="simulation", server_default="simulation")
    image_source_id = Column(
        String(100),
        nullable=False,
        default="fourd-engineer",
        server_default="fourd-engineer",
    )
    image_source_version = Column(Integer, nullable=False, default=1, server_default="1")
    source_attempt_id = Column(
        Integer,
        ForeignKey("scan_session_series_attempts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    scan_result_json = Column(Text, nullable=False)
    data_review_json = Column(Text, nullable=True)
    rescan_choices_json = Column(Text, nullable=True)
    phase_selections_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    scan_session = relationship("ScanSession", back_populates="fourd_result")
    target_series = relationship("ScanSessionSeries", back_populates="fourd_result")
    source_attempt = relationship("ScanSessionSeriesAttempt")


class ScanSessionWorkflowAction(Base):
    __tablename__ = "scan_session_workflow_actions"
    __table_args__ = (
        UniqueConstraint(
            "scan_session_id",
            "action_id",
            name="uq_scan_session_workflow_actions_session_action_id",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    action_id = Column(String(100), nullable=False)
    scan_session_id = Column(
        Integer,
        ForeignKey("scan_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 审计快照：即使后续删除可编辑序列，也保留动作当时指向的序列 ID。
    target_series_id = Column(Integer, nullable=True, index=True)
    action_type = Column(String(40), nullable=False, index=True)
    reason = Column(Text, nullable=False)
    resulting_session_status = Column(String(20), nullable=False)
    resulting_series_status = Column(String(20), nullable=True)
    next_entry = Column(String(40), nullable=False)
    # 工作流动作不生成剂量数据；已有剂量记录也不会因动作被覆盖或删除。
    dose_log_disposition = Column(
        String(30),
        nullable=False,
        default="not_emitted",
        server_default="not_emitted",
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    scan_session = relationship("ScanSession", back_populates="workflow_actions")
    ended_attempts = relationship(
        "ScanSessionSeriesAttempt",
        back_populates="ended_by_action",
        passive_deletes=True,
    )


class ScanSessionSeriesAttempt(Base):
    __tablename__ = "scan_session_series_attempts"
    __table_args__ = (
        UniqueConstraint(
            "scan_session_series_id",
            "attempt_number",
            name="uq_scan_session_series_attempts_series_number",
        ),
        CheckConstraint(
            "attempt_number >= 1",
            name="ck_scan_session_series_attempts_number_positive",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    scan_session_id = Column(
        Integer,
        ForeignKey("scan_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scan_session_series_id = Column(
        Integer,
        ForeignKey("scan_session_series.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attempt_number = Column(Integer, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    outcome = Column(String(30), nullable=True, index=True)
    end_reason = Column(Text, nullable=True)
    ended_by_action_id = Column(
        Integer,
        ForeignKey("scan_session_workflow_actions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    scan_session = relationship("ScanSession", back_populates="series_attempts")
    series = relationship("ScanSessionSeries", back_populates="attempts")
    ended_by_action = relationship(
        "ScanSessionWorkflowAction",
        back_populates="ended_attempts",
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
    focus_size = Column(String(10), nullable=False, default="small")
    bowtie_type = Column(String(10), nullable=False, default="medium")
    scan_direction = Column(String(20), nullable=True, default="HEAD_TO_FOOT")
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
    focus_size = Column(String(10), nullable=False, default="small")
    bowtie_type = Column(String(10), nullable=False, default="medium")
    scan_direction = Column(String(20), nullable=True, default="HEAD_TO_FOOT")
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
    focus_size = Column(String(10), nullable=False, default="small")
    bowtie_type = Column(String(10), nullable=False, default="medium")
    scan_direction = Column(String(20), nullable=True, default="HEAD_TO_FOOT")
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
    recon_fov = Column(Float, nullable=True)
    center_x = Column(Float, nullable=True)
    center_y = Column(Float, nullable=True)
    metal_artifact_suppression = Column(Boolean, nullable=False, default=False)
    # 派生重建仅保存原型重建服务的可追溯输出，不代表真实设备重建结果。
    source_kind = Column(String(20), nullable=False, default="configured", server_default="configured")
    reconstruction_job_id = Column(String(120), nullable=True, unique=True, index=True)
    output_series_id = Column(String(160), nullable=True)
    image_urls = Column(JSON, nullable=True)

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


class UserRole(Base):
    __tablename__ = "user_roles"

    code = Column(String(40), primary_key=True, index=True)
    name = Column(String(80), nullable=False)
    description = Column(Text, nullable=True)
    permissions = Column(Text, nullable=False, default="[]")
    is_system = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now())

    users = relationship("UserAccount", back_populates="role")


class UserAccount(Base):
    __tablename__ = "user_accounts"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False, unique=True, index=True)
    display_name = Column(String(100), nullable=False)
    employee_id = Column(String(50), nullable=True, unique=True, index=True)
    department = Column(String(80), nullable=True)
    title = Column(String(80), nullable=True)
    role_code = Column(String(40), ForeignKey("user_roles.code", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="active", index=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(120), nullable=True)
    login_allowed = Column(Boolean, nullable=False, default=True)
    password_hash = Column(String(255), nullable=True)
    password_reset_required = Column(Boolean, nullable=False, default=False)
    credential_version = Column(Integer, nullable=False, default=1)
    failed_attempts = Column(Integer, nullable=False, default=0)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    password_updated_at = Column(DateTime(timezone=True), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now())

    role = relationship("UserRole", back_populates="users")


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
    acquisition_type = Column(String(20), nullable=True)
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


class DoseSettings(Base):
    """Singleton row (id=1) holding all system-level dose configuration."""

    __tablename__ = "dose_settings"

    id = Column(Integer, primary_key=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Threshold policy — what to do when scan dose exceeds protocol-level threshold
    # (per-protocol thresholds live on the Protocol model; this only controls global response action)
    threshold_action = Column(String(20), nullable=False, default="warn")  # log_only | warn | require_confirm

    # AEC (Auto Exposure Control) defaults
    aec_enabled = Column(Boolean, nullable=False, default=False)
    aec_noise_level = Column(String(10), nullable=False, default="medium")  # low | medium | high

    # Compliance
    audit_threshold_exceed = Column(Boolean, nullable=False, default=True)


class DrlEntry(Base):
    """Diagnostic Reference Level — by body part × age group."""

    __tablename__ = "drl_entries"

    id = Column(Integer, primary_key=True, index=True)
    body_part = Column(String(50), nullable=False, index=True)  # 头颅 / 胸部 / 腹部 / 盆腔 / 脊柱 / 颈部
    age_group = Column(String(20), nullable=False, index=True)  # adult | pediatric | infant
    ctdi_ref = Column(Float, nullable=False)
    dlp_ref = Column(Float, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("body_part", "age_group", name="uq_drl_part_age"),)


class PersistentDocument(Base):
    """Versioned application state that previously lived in local JSON files.

    Each document is owned by the backend and stored in PostgreSQL/SQLite through
    SQLAlchemy.  The JSON payload preserves the existing API contracts while the
    individual feature schemas remain Pydantic-validated at the router boundary.
    """

    __tablename__ = "persistent_documents"

    key = Column(String(80), primary_key=True)
    payload = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
