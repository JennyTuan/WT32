from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    patient_id = Column(String(50), nullable=False, unique=True, index=True)
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
    scan_mode = Column(String(20), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

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


class TopogramParam(Base):
    __tablename__ = "topogram_params"

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id", ondelete="CASCADE"), nullable=False, unique=True)
    kv = Column(Integer, nullable=False, default=120)
    ma = Column(Integer, nullable=False, default=30)
    scan_length = Column(Float, nullable=False, default=80.0)
    tube_angle = Column(Float, nullable=False, default=270.0)
    fov = Column(Float, nullable=False, default=500.0)
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
