from __future__ import annotations

from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PatientBase(BaseModel):
    name: str
    patient_id: str
    gender: str
    birth_date: date
    height: Optional[float] = None
    weight: Optional[float] = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    patient_id: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[date] = None
    height: Optional[float] = None
    weight: Optional[float] = None


class Patient(PatientBase, ORMModel):
    id: int
    created_at: datetime


class ContrastConfigBase(BaseModel):
    protocol_id: int
    contrast_agent: str
    concentration: float
    total_volume: float
    injection_rate: float
    saline_volume: float
    saline_rate: float


class ContrastConfigCreate(ContrastConfigBase):
    pass


class ContrastConfigUpdate(BaseModel):
    protocol_id: Optional[int] = None
    contrast_agent: Optional[str] = None
    concentration: Optional[float] = None
    total_volume: Optional[float] = None
    injection_rate: Optional[float] = None
    saline_volume: Optional[float] = None
    saline_rate: Optional[float] = None


class ContrastConfig(ContrastConfigBase, ORMModel):
    id: int


class ProtocolBase(BaseModel):
    name: str
    body_part: str
    age_group: Literal["adult", "child", "infant"]
    patient_weight: str
    patient_position: Literal["HFS", "FFS", "HFP", "FFP"]
    table_direction: Literal["in", "out"]
    acquisition_type: Literal["regular", "gating", "four_d"] = "regular"
    scan_mode: Literal["plain", "contrast", "4d"]
    is_4d: bool = False
    is_enhance: bool = False
    description: Optional[str] = None


class ProtocolCreate(ProtocolBase):
    is_factory: bool = False
    is_enabled: bool = True


class ProtocolCreateWithSeries(ProtocolCreate):
    series: List[SeriesCreateWithParams] = Field(default_factory=list)


class ProtocolUpdate(BaseModel):
    name: Optional[str] = None
    body_part: Optional[str] = None
    age_group: Optional[Literal["adult", "child", "infant"]] = None
    patient_weight: Optional[str] = None
    patient_position: Optional[Literal["HFS", "FFS", "HFP", "FFP"]] = None
    table_direction: Optional[Literal["in", "out"]] = None
    acquisition_type: Optional[Literal["regular", "gating", "four_d"]] = None
    scan_mode: Optional[Literal["plain", "contrast", "4d"]] = None
    is_4d: Optional[bool] = None
    is_enhance: Optional[bool] = None
    description: Optional[str] = None
    is_enabled: Optional[bool] = None


class SeriesBase(BaseModel):
    protocol_id: int
    series_order: int
    series_type: Literal["topogram", "helical", "axial", "4d"]
    series_label: str
    contrast_delay: Optional[float] = None
    trigger_mode: Optional[Literal["manual", "auto_timing", "bolus_tracking"]] = None
    tracking_threshold: Optional[float] = None


class SeriesCreate(SeriesBase):
    pass


class SeriesUpdate(BaseModel):
    protocol_id: Optional[int] = None
    series_order: Optional[int] = None
    series_type: Optional[Literal["topogram", "helical", "axial", "4d"]] = None
    series_label: Optional[str] = None
    contrast_delay: Optional[float] = None
    trigger_mode: Optional[Literal["manual", "auto_timing", "bolus_tracking"]] = None
    tracking_threshold: Optional[float] = None


class SeriesCreateWithParams(BaseModel):
    series_order: int
    series_type: Literal["topogram", "helical", "axial", "4d"]
    series_label: str
    contrast_delay: Optional[float] = None
    trigger_mode: Optional[Literal["manual", "auto_timing", "bolus_tracking"]] = None
    tracking_threshold: Optional[float] = None
    topogram_param: Optional[TopogramParamUpdate] = None
    helical_param: Optional[HelicalParamUpdate] = None
    axial_param: Optional[AxialParamUpdate] = None
    recon_series: List[ReconSeriesUpdate] = Field(default_factory=list)


class TopogramParamBase(BaseModel):
    series_id: int
    kv: int = 120
    ma: int = 30
    scan_length: float = 80.0
    tube_angle: float = 270.0
    fov: float = 500.0
    collimator: Optional[str] = None
    scan_direction: Optional[str] = "OUT"
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None


class TopogramParamCreate(TopogramParamBase):
    pass


class TopogramParamUpdate(BaseModel):
    series_id: Optional[int] = None
    kv: Optional[int] = None
    ma: Optional[int] = None
    scan_length: Optional[float] = None
    tube_angle: Optional[float] = None
    fov: Optional[float] = None
    collimator: Optional[str] = None
    scan_direction: Optional[str] = None
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None


class TopogramParam(TopogramParamBase, ORMModel):
    id: int


class HelicalParamBase(BaseModel):
    series_id: int
    kv: int
    ma: int
    slice_thickness: float
    pitch: float
    rotation_time: float
    scan_length: float
    fov: float
    collimator: Optional[str] = None
    scan_direction: Optional[str] = "OUT"
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None
    auto_ma: bool = False
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None


class HelicalParamCreate(HelicalParamBase):
    pass


class HelicalParamUpdate(BaseModel):
    series_id: Optional[int] = None
    kv: Optional[int] = None
    ma: Optional[int] = None
    slice_thickness: Optional[float] = None
    pitch: Optional[float] = None
    rotation_time: Optional[float] = None
    scan_length: Optional[float] = None
    fov: Optional[float] = None
    collimator: Optional[str] = None
    scan_direction: Optional[str] = None
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None
    auto_ma: Optional[bool] = None
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None


class HelicalParam(HelicalParamBase, ORMModel):
    id: int


class AxialParamBase(BaseModel):
    series_id: int
    kv: int
    ma: int
    slice_thickness: float
    slice_interval: float
    rotation_time: float
    scan_length: float
    fov: float
    collimator: Optional[str] = None
    scan_direction: Optional[str] = "OUT"
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None
    auto_ma: bool = False
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None
    step_count: Optional[int] = None


class AxialParamCreate(AxialParamBase):
    pass


class AxialParamUpdate(BaseModel):
    series_id: Optional[int] = None
    kv: Optional[int] = None
    ma: Optional[int] = None
    slice_thickness: Optional[float] = None
    slice_interval: Optional[float] = None
    rotation_time: Optional[float] = None
    scan_length: Optional[float] = None
    fov: Optional[float] = None
    collimator: Optional[str] = None
    scan_direction: Optional[str] = None
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None
    auto_ma: Optional[bool] = None
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None
    step_count: Optional[int] = None


class AxialParam(AxialParamBase, ORMModel):
    id: int


class ReconSeriesBase(BaseModel):
    series_id: int
    recon_name: str
    recon_type: Literal["soft", "bone", "lung", "vascular"]
    kernel: str
    matrix: int
    window_width: int
    window_level: int
    slice_thickness: float
    increment: Optional[float] = None
    recon_fov: Optional[float] = None
    center_x: Optional[float] = None
    center_y: Optional[float] = None


class ReconSeriesCreate(ReconSeriesBase):
    pass


class ReconSeriesUpdate(BaseModel):
    series_id: Optional[int] = None
    recon_name: Optional[str] = None
    recon_type: Optional[Literal["soft", "bone", "lung", "vascular"]] = None
    kernel: Optional[str] = None
    matrix: Optional[int] = None
    window_width: Optional[int] = None
    window_level: Optional[int] = None
    slice_thickness: Optional[float] = None
    increment: Optional[float] = None
    recon_fov: Optional[float] = None
    center_x: Optional[float] = None
    center_y: Optional[float] = None


class ReconSeries(ReconSeriesBase, ORMModel):
    id: int


class BreathingTrainingParamBase(BaseModel):
    fourd_config_id: int
    training_duration: float
    target_amplitude: float
    tolerance_range: float


class BreathingTrainingParamCreate(BreathingTrainingParamBase):
    pass


class BreathingTrainingParamUpdate(BaseModel):
    fourd_config_id: Optional[int] = None
    training_duration: Optional[float] = None
    target_amplitude: Optional[float] = None
    tolerance_range: Optional[float] = None


class BreathingTrainingParam(BreathingTrainingParamBase, ORMModel):
    id: int


class FourDConfigBase(BaseModel):
    series_id: int
    breathing_mode: Literal["free_breathing", "gating", "trigger"]
    phase_count: int
    acquisition_time: float
    trigger_threshold: Optional[float] = None


class FourDConfigCreate(FourDConfigBase):
    pass


class FourDConfigUpdate(BaseModel):
    series_id: Optional[int] = None
    breathing_mode: Optional[Literal["free_breathing", "gating", "trigger"]] = None
    phase_count: Optional[int] = None
    acquisition_time: Optional[float] = None
    trigger_threshold: Optional[float] = None


class FourDConfig(FourDConfigBase, ORMModel):
    id: int
    breathing_training_param: Optional[BreathingTrainingParam] = None


GatingBreathingMode = Literal["breath_hold_inspiration", "breath_hold_expiration", "free_breathing"]


class GatingConfigBase(BaseModel):
    series_id: int
    breathing_mode: GatingBreathingMode
    phase_start_pct: float = 30.0
    phase_end_pct: float = 70.0
    trigger_delay_ms: int = 0
    max_triggers_per_cycle: int = 1
    stability_cv_threshold: float = 0.15
    baseline_drift_mm_threshold: float = 5.0
    breath_hold_timeout_s: Optional[float] = 25.0
    breath_hold_amplitude_tolerance_mm: Optional[float] = 2.0


class GatingConfigCreate(GatingConfigBase):
    pass


class GatingConfigUpdate(BaseModel):
    breathing_mode: Optional[GatingBreathingMode] = None
    phase_start_pct: Optional[float] = None
    phase_end_pct: Optional[float] = None
    trigger_delay_ms: Optional[int] = None
    max_triggers_per_cycle: Optional[int] = None
    stability_cv_threshold: Optional[float] = None
    baseline_drift_mm_threshold: Optional[float] = None
    breath_hold_timeout_s: Optional[float] = None
    breath_hold_amplitude_tolerance_mm: Optional[float] = None


class GatingConfig(GatingConfigBase, ORMModel):
    id: int


class Series(SeriesBase, ORMModel):
    id: int


class SeriesDetail(Series, ORMModel):
    topogram_param: Optional[TopogramParam] = None
    helical_param: Optional[HelicalParam] = None
    axial_param: Optional[AxialParam] = None
    recon_series: List[ReconSeries] = Field(default_factory=list)
    fourd_config: Optional[FourDConfig] = None
    gating_config: Optional[GatingConfig] = None


class ProtocolDetail(ProtocolBase, ORMModel):
    id: int
    is_factory: bool = False
    is_enabled: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    contrast_config: Optional[ContrastConfig] = None
    series: List[SeriesDetail] = Field(default_factory=list)


class ProtocolSummary(ProtocolBase, ORMModel):
    id: int
    is_factory: bool = False
    is_enabled: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    series_count: int = 0
    supported_modes: List[str] = Field(default_factory=list)


class ScanSessionStatusUpdate(BaseModel):
    status: Literal["draft", "in_progress", "completed", "cancelled"]


class ScanSessionBase(BaseModel):
    patient_id: int
    protocol_id: int
    session_name: Optional[str] = None


class ScanSessionCreate(ScanSessionBase):
    pass


class ScanSessionAdHocCreate(BaseModel):
    patient_id: int
    source_protocol_id: int
    session_name: Optional[str] = None
    name: str
    body_part: str
    age_group: Literal["adult", "child", "infant"]
    patient_weight: str
    patient_position: str
    table_direction: str
    acquisition_type: Literal["regular", "gating", "four_d"] = "regular"
    scan_mode: Literal["plain", "contrast", "4d"] = "plain"
    description: Optional[str] = None


class ScanSessionUpdate(BaseModel):
    status: Optional[Literal["draft", "in_progress", "completed", "cancelled"]] = None
    session_name: Optional[str] = None
    patient_position: Optional[str] = None
    table_direction: Optional[str] = None
    description: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ScanSessionContrastConfigBase(BaseModel):
    contrast_agent: str
    concentration: float
    total_volume: float
    injection_rate: float
    saline_volume: float
    saline_rate: float


class ScanSessionContrastConfigUpdate(BaseModel):
    contrast_agent: Optional[str] = None
    concentration: Optional[float] = None
    total_volume: Optional[float] = None
    injection_rate: Optional[float] = None
    saline_volume: Optional[float] = None
    saline_rate: Optional[float] = None


class ScanSessionContrastConfig(ScanSessionContrastConfigBase, ORMModel):
    id: int
    scan_session_id: int
    template_contrast_config_id: Optional[int] = None


class ScanSessionSeriesCreate(BaseModel):
    series_order: int
    series_type: Literal["topogram", "helical", "axial", "4d"]
    series_label: str
    contrast_delay: Optional[float] = None
    trigger_mode: Optional[Literal["manual", "auto_timing", "bolus_tracking"]] = None
    tracking_threshold: Optional[float] = None
    topogram_param: Optional[TopogramParamUpdate] = None
    helical_param: Optional[HelicalParamUpdate] = None
    axial_param: Optional[AxialParamUpdate] = None
    recon_series: List[ReconSeriesUpdate] = Field(default_factory=list)


class ScanSessionSeriesUpdate(BaseModel):
    series_label: Optional[str] = None
    contrast_delay: Optional[float] = None
    trigger_mode: Optional[Literal["manual", "auto_timing", "bolus_tracking"]] = None
    tracking_threshold: Optional[float] = None


class ScanSessionTopogramParamUpdate(BaseModel):
    kv: Optional[int] = None
    ma: Optional[int] = None
    scan_length: Optional[float] = None
    tube_angle: Optional[float] = None
    fov: Optional[float] = None
    collimator: Optional[str] = None
    scan_direction: Optional[str] = None
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None


class ScanSessionTopogramParam(ORMModel):
    id: int
    scan_session_series_id: int
    template_param_id: Optional[int] = None
    kv: int
    ma: int
    scan_length: float
    tube_angle: float
    fov: float
    collimator: Optional[str] = None
    scan_direction: Optional[str] = "OUT"
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None


class ScanSessionHelicalParamUpdate(BaseModel):
    kv: Optional[int] = None
    ma: Optional[int] = None
    slice_thickness: Optional[float] = None
    pitch: Optional[float] = None
    rotation_time: Optional[float] = None
    scan_length: Optional[float] = None
    fov: Optional[float] = None
    collimator: Optional[str] = None
    scan_direction: Optional[str] = None
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None
    auto_ma: Optional[bool] = None
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None


class ScanSessionHelicalParam(ORMModel):
    id: int
    scan_session_series_id: int
    template_param_id: Optional[int] = None
    kv: int
    ma: int
    slice_thickness: float
    pitch: float
    rotation_time: float
    scan_length: float
    fov: float
    collimator: Optional[str] = None
    scan_direction: Optional[str] = "OUT"
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None
    auto_ma: bool
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None


class ScanSessionAxialParamUpdate(BaseModel):
    kv: Optional[int] = None
    ma: Optional[int] = None
    slice_thickness: Optional[float] = None
    slice_interval: Optional[float] = None
    rotation_time: Optional[float] = None
    scan_length: Optional[float] = None
    fov: Optional[float] = None
    collimator: Optional[str] = None
    scan_direction: Optional[str] = None
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None
    auto_ma: Optional[bool] = None
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None
    step_count: Optional[int] = None


class ScanSessionAxialParam(ORMModel):
    id: int
    scan_session_series_id: int
    template_param_id: Optional[int] = None
    kv: int
    ma: int
    slice_thickness: float
    slice_interval: float
    rotation_time: float
    scan_length: float
    fov: float
    collimator: Optional[str] = None
    scan_direction: Optional[str] = "OUT"
    dom: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None
    auto_ma: bool
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None
    step_count: Optional[int] = None


class ScanSessionReconSeriesUpdate(BaseModel):
    recon_name: Optional[str] = None
    recon_type: Optional[Literal["soft", "bone", "lung", "vascular"]] = None
    kernel: Optional[str] = None
    matrix: Optional[int] = None
    window_width: Optional[int] = None
    window_level: Optional[int] = None
    slice_thickness: Optional[float] = None
    increment: Optional[float] = None
    recon_fov: Optional[float] = None
    center_x: Optional[float] = None
    center_y: Optional[float] = None


class ScanSessionReconSeries(ORMModel):
    id: int
    scan_session_series_id: int
    template_recon_series_id: Optional[int] = None
    recon_name: str
    recon_type: Literal["soft", "bone", "lung", "vascular"]
    kernel: str
    matrix: int
    window_width: int
    window_level: int
    slice_thickness: float
    increment: Optional[float] = None
    recon_fov: Optional[float] = None
    center_x: Optional[float] = None
    center_y: Optional[float] = None


class ScanSessionBreathingTrainingParamUpdate(BaseModel):
    training_duration: Optional[float] = None
    target_amplitude: Optional[float] = None
    tolerance_range: Optional[float] = None


class ScanSessionBreathingTrainingParam(ORMModel):
    id: int
    scan_session_fourd_config_id: int
    template_param_id: Optional[int] = None
    training_duration: float
    target_amplitude: float
    tolerance_range: float


class ScanSessionFourDConfigUpdate(BaseModel):
    breathing_mode: Optional[Literal["free_breathing", "gating", "trigger"]] = None
    phase_count: Optional[int] = None
    acquisition_time: Optional[float] = None
    trigger_threshold: Optional[float] = None


class ScanSessionFourDConfig(ORMModel):
    id: int
    scan_session_series_id: int
    template_config_id: Optional[int] = None
    breathing_mode: Literal["free_breathing", "gating", "trigger"]
    phase_count: int
    acquisition_time: float
    trigger_threshold: Optional[float] = None
    breathing_training_param: Optional[ScanSessionBreathingTrainingParam] = None


class ScanSessionGatingConfigUpdate(BaseModel):
    breathing_mode: Optional[GatingBreathingMode] = None
    phase_start_pct: Optional[float] = None
    phase_end_pct: Optional[float] = None
    trigger_delay_ms: Optional[int] = None
    max_triggers_per_cycle: Optional[int] = None
    stability_cv_threshold: Optional[float] = None
    baseline_drift_mm_threshold: Optional[float] = None
    breath_hold_timeout_s: Optional[float] = None
    breath_hold_amplitude_tolerance_mm: Optional[float] = None


class ScanSessionGatingConfig(ORMModel):
    id: int
    scan_session_series_id: int
    template_config_id: Optional[int] = None
    breathing_mode: GatingBreathingMode
    phase_start_pct: float
    phase_end_pct: float
    trigger_delay_ms: int
    max_triggers_per_cycle: int
    stability_cv_threshold: float
    baseline_drift_mm_threshold: float
    breath_hold_timeout_s: Optional[float] = None
    breath_hold_amplitude_tolerance_mm: Optional[float] = None


class ScanSessionSeries(ORMModel):
    id: int
    scan_session_id: int
    template_series_id: Optional[int] = None
    series_order: int
    series_type: Literal["topogram", "helical", "axial", "4d"]
    series_label: str
    contrast_delay: Optional[float] = None
    trigger_mode: Optional[Literal["manual", "auto_timing", "bolus_tracking"]] = None
    tracking_threshold: Optional[float] = None
    topogram_param: Optional[ScanSessionTopogramParam] = None
    helical_param: Optional[ScanSessionHelicalParam] = None
    axial_param: Optional[ScanSessionAxialParam] = None
    recon_series: List[ScanSessionReconSeries] = Field(default_factory=list)
    fourd_config: Optional[ScanSessionFourDConfig] = None
    gating_config: Optional[ScanSessionGatingConfig] = None


class ScanSessionDetail(ORMModel):
    id: int
    patient_id: int
    protocol_id: int
    status: Literal["draft", "in_progress", "completed", "cancelled"]
    session_name: Optional[str] = None
    name: str
    body_part: str
    age_group: Literal["adult", "child", "infant"]
    patient_weight: str
    patient_position: str
    table_direction: str
    acquisition_type: Literal["regular", "gating", "four_d"]
    scan_mode: Literal["plain", "contrast", "4d"]
    description: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    contrast_config: Optional[ScanSessionContrastConfig] = None
    series: List[ScanSessionSeries] = Field(default_factory=list)


class ScanSessionSummary(ORMModel):
    id: int
    patient_id: int
    protocol_id: int
    status: Literal["draft", "in_progress", "completed", "cancelled"]
    session_name: Optional[str] = None
    name: str
    body_part: str
    acquisition_type: Literal["regular", "gating", "four_d"]
    scan_mode: Literal["plain", "contrast", "4d"]
    created_at: datetime
    started_at: Optional[datetime] = None

class CornerConfigBase(BaseModel):
    template_name: str
    is_active: bool = False
    config_json: str  # JSON string

class CornerConfigCreate(CornerConfigBase):
    pass

class CornerConfigUpdate(BaseModel):
    template_name: Optional[str] = None
    is_active: Optional[bool] = None
    config_json: Optional[str] = None

class CornerConfig(CornerConfigBase, ORMModel):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
