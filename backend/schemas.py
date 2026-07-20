from __future__ import annotations

from datetime import date, datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


FOV_MIN_MM = 50.0
FOV_MAX_MM = 750.0
PrototypeImageSourceId = Literal[
    "head-stroke-topogram",
    "head-dual-scout-demo",
    "brain-helical-demo",
    "limbs-helical-demo",
    "qin-lung-topogram",
    "fourd-scout-demo",
    "qin-lung-helical-demo",
]
PrototypeImageSourceVersion = Literal[1]


class PatientBase(BaseModel):
    name: str
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    patient_id: str
    id_number: Optional[str] = None
    gender: str
    age: int = Field(ge=0)
    birth_date: Optional[date] = None
    height: Optional[float] = None
    weight: Optional[float] = None


class PatientCreate(BaseModel):
    # name is optional on input — backend auto-derives it from last_name + first_name
    # when not provided (one of them must be present).
    name: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    patient_id: str
    id_number: Optional[str] = None
    gender: str
    age: int = Field(ge=0)
    birth_date: Optional[date] = None
    height: Optional[float] = None
    weight: Optional[float] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    patient_id: Optional[str] = None
    id_number: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=0)
    birth_date: Optional[date] = None
    height: Optional[float] = None
    weight: Optional[float] = None


class Patient(PatientBase, ORMModel):
    id: int
    created_at: datetime
    latest_scan_status: Optional[str] = None  # draft / in_progress / completed / cancelled
    latest_scan_session_id: Optional[int] = None
    latest_scan_acquisition_type: Optional[str] = None  # regular / gating / four_d
    latest_scan_mode: Optional[str] = None  # plain / contrast / 4d
    latest_scan_name: Optional[str] = None
    latest_scan_completed_at: Optional[str] = None


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
    fov: float = Field(default=500.0, ge=FOV_MIN_MM, le=FOV_MAX_MM)


class TopogramParamUpdate(BaseModel):
    series_id: Optional[int] = None
    kv: Optional[int] = None
    ma: Optional[int] = None
    scan_length: Optional[float] = None
    tube_angle: Optional[float] = None
    fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)
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
    fov: float = Field(ge=FOV_MIN_MM, le=FOV_MAX_MM)


class HelicalParamUpdate(BaseModel):
    series_id: Optional[int] = None
    kv: Optional[int] = None
    ma: Optional[int] = None
    slice_thickness: Optional[float] = None
    pitch: Optional[float] = None
    rotation_time: Optional[float] = None
    scan_length: Optional[float] = None
    fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)
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
    fov: float = Field(ge=FOV_MIN_MM, le=FOV_MAX_MM)


class AxialParamUpdate(BaseModel):
    series_id: Optional[int] = None
    kv: Optional[int] = None
    ma: Optional[int] = None
    slice_thickness: Optional[float] = None
    slice_interval: Optional[float] = None
    rotation_time: Optional[float] = None
    scan_length: Optional[float] = None
    fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)
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
    recon_fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)


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
    recon_fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)
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
GatingTargetPhase = Literal["max_inspiration", "max_expiration", "custom"]
GatingTriggerDirection = Literal["rising", "falling"]


class GatingConfigBase(BaseModel):
    series_id: int
    breathing_mode: GatingBreathingMode
    # free-breathing prospective trigger
    target_phase: Optional[GatingTargetPhase] = "max_inspiration"
    threshold_normalized: Optional[float] = 1.0
    trigger_direction: Optional[GatingTriggerDirection] = "rising"
    wait_timeout_s: Optional[float] = 30.0
    # shared stability
    trigger_delay_ms: int = 0
    stability_cv_threshold: float = 0.15
    baseline_drift_mm_threshold: float = 5.0
    # breath-hold (DIBH)
    breath_hold_timeout_s: Optional[float] = 25.0
    breath_hold_amplitude_tolerance_mm: Optional[float] = 2.0


class GatingConfigCreate(GatingConfigBase):
    pass


class GatingConfigUpdate(BaseModel):
    breathing_mode: Optional[GatingBreathingMode] = None
    target_phase: Optional[GatingTargetPhase] = None
    threshold_normalized: Optional[float] = None
    trigger_direction: Optional[GatingTriggerDirection] = None
    wait_timeout_s: Optional[float] = None
    trigger_delay_ms: Optional[int] = None
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
    csv_order: Optional[int] = None
    series_count: int = 0
    supported_modes: List[str] = Field(default_factory=list)


class DoseReferenceParam(ORMModel):
    """Parameters required to estimate a reference dose for historical logs."""

    ma: Optional[float] = None
    kv: Optional[float] = None
    rotation_time: Optional[float] = None
    pitch: Optional[float] = None
    scan_length: Optional[float] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None


class ProtocolDoseReferenceSeries(ORMModel):
    series_type: str
    helical_param: Optional[DoseReferenceParam] = None
    axial_param: Optional[DoseReferenceParam] = None
    topogram_param: Optional[DoseReferenceParam] = None


class ProtocolDoseReference(ORMModel):
    name: str
    series: List[ProtocolDoseReferenceSeries] = Field(default_factory=list)


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


class ScanSessionSeriesExecutionUpdate(BaseModel):
    execution_status: Optional[
        Literal["pending", "running", "image_ready", "failed", "interrupted"]
    ] = None
    failure_reason: Optional[str] = Field(default=None, max_length=500)
    range_confirmed: Optional[bool] = None
    image_source_id: Optional[PrototypeImageSourceId] = Field(
        default=None,
        max_length=100,
    )
    image_source_version: Optional[PrototypeImageSourceVersion] = Field(
        default=None,
        ge=1,
    )

    @model_validator(mode="after")
    def validate_image_source_pair(self) -> "ScanSessionSeriesExecutionUpdate":
        if (self.image_source_id is None) != (self.image_source_version is None):
            raise ValueError(
                "image_source_id and image_source_version must be provided together"
            )
        return self


class ScanSessionTopogramParamUpdate(BaseModel):
    kv: Optional[int] = None
    ma: Optional[int] = None
    scan_length: Optional[float] = None
    tube_angle: Optional[float] = None
    fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)
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
    fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)
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
    fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)
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


class ScanSessionReconSeriesCreate(BaseModel):
    recon_name: str = "重建"
    recon_type: Literal["soft", "bone", "lung", "vascular"] = "soft"
    kernel: str = "STANDARD"
    matrix: int = 512
    window_width: int = 400
    window_level: int = 40
    slice_thickness: float = 1.0
    increment: Optional[float] = None
    recon_fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)
    center_x: Optional[float] = None
    center_y: Optional[float] = None


class ScanSessionReconSeriesUpdate(BaseModel):
    recon_name: Optional[str] = None
    recon_type: Optional[Literal["soft", "bone", "lung", "vascular"]] = None
    kernel: Optional[str] = None
    matrix: Optional[int] = None
    window_width: Optional[int] = None
    window_level: Optional[int] = None
    slice_thickness: Optional[float] = None
    increment: Optional[float] = None
    recon_fov: Optional[float] = Field(default=None, ge=FOV_MIN_MM, le=FOV_MAX_MM)
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
    target_phase: Optional[GatingTargetPhase] = None
    threshold_normalized: Optional[float] = None
    trigger_direction: Optional[GatingTriggerDirection] = None
    wait_timeout_s: Optional[float] = None
    trigger_delay_ms: Optional[int] = None
    stability_cv_threshold: Optional[float] = None
    baseline_drift_mm_threshold: Optional[float] = None
    breath_hold_timeout_s: Optional[float] = None
    breath_hold_amplitude_tolerance_mm: Optional[float] = None


class ScanSessionGatingConfig(ORMModel):
    id: int
    scan_session_series_id: int
    template_config_id: Optional[int] = None
    breathing_mode: GatingBreathingMode
    target_phase: Optional[GatingTargetPhase] = None
    threshold_normalized: Optional[float] = None
    trigger_direction: Optional[GatingTriggerDirection] = None
    wait_timeout_s: Optional[float] = None
    trigger_delay_ms: int
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
    execution_status: Literal[
        "pending", "running", "image_ready", "failed", "interrupted"
    ] = "pending"
    failure_reason: Optional[str] = None
    range_confirmed: bool = False
    image_source_id: Optional[PrototypeImageSourceId] = None
    image_source_version: Optional[PrototypeImageSourceVersion] = None
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


ScanSessionWorkflowActionType = Literal[
    "return_to_edit",
    "retry_series",
    "terminate_exam",
    "finish_with_partial",
]


class ScanSessionWorkflowActionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_id: str = Field(
        min_length=8,
        max_length=100,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    )
    action: ScanSessionWorkflowActionType
    target_series_id: Optional[int] = Field(default=None, ge=1)
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_action_target_and_reason(self):
        self.reason = self.reason.strip()
        if not self.reason:
            raise ValueError("reason must not be blank")
        if self.action in {"return_to_edit", "retry_series"} and self.target_series_id is None:
            raise ValueError(f"target_series_id is required for {self.action}")
        return self


class ScanSessionWorkflowAction(ORMModel):
    id: int
    action_id: str
    scan_session_id: int
    target_series_id: Optional[int] = None
    action_type: ScanSessionWorkflowActionType
    reason: str
    resulting_session_status: Literal["draft", "in_progress", "completed", "cancelled"]
    resulting_series_status: Optional[
        Literal["pending", "running", "image_ready", "failed", "interrupted"]
    ] = None
    next_entry: Literal["series_edit", "series_confirm", "patient_list"]
    dose_log_disposition: Literal["not_emitted"]
    created_at: datetime


class ScanSessionWorkflowActionResponse(BaseModel):
    replayed: bool
    action: ScanSessionWorkflowAction
    scan_session: ScanSessionDetail


class ScanSessionSeriesAttempt(ORMModel):
    id: int
    scan_session_id: int
    scan_session_series_id: int
    attempt_number: int
    started_at: datetime
    ended_at: Optional[datetime] = None
    outcome: Optional[
        Literal["image_ready", "failed", "interrupted", "returned_to_edit"]
    ] = None
    end_reason: Optional[str] = None
    ended_by_action_id: Optional[int] = None


FourDResultWorkflowStage = Literal["acquired", "rescan_selected", "phase_selected", "ready"]
FOUR_D_RESULT_STAGE_ORDER: Dict[str, int] = {
    "acquired": 0,
    "rescan_selected": 1,
    "phase_selected": 2,
    "ready": 3,
}


class FourDBedPhaseCell(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    frame_count: int = Field(ge=1)
    selected_frame: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_selected_frame(self) -> "FourDBedPhaseCell":
        if self.selected_frame >= self.frame_count:
            raise ValueError("selected_frame must be smaller than frame_count")
        return self


class FourDScanResultSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    bed_count: int = Field(ge=1)
    phase_count: int = Field(ge=1)
    scan_length: float = Field(gt=0)
    phase_matrix: List[List[FourDBedPhaseCell]]
    rescan_occurred: bool
    rescan_bed_range: Optional[List[int]] = Field(default=None, min_length=2, max_length=2)

    @model_validator(mode="after")
    def validate_result_shape(self) -> "FourDScanResultSnapshot":
        if len(self.phase_matrix) != self.bed_count:
            raise ValueError("phase_matrix row count must equal bed_count")
        if any(len(row) != self.phase_count for row in self.phase_matrix):
            raise ValueError("each phase_matrix row must contain phase_count cells")

        if self.rescan_occurred != (self.rescan_bed_range is not None):
            raise ValueError("rescan_occurred must match rescan_bed_range availability")
        if self.rescan_bed_range is not None:
            start, end = self.rescan_bed_range
            if start < 0 or end < start or end >= self.bed_count:
                raise ValueError("rescan_bed_range must be within the scan bed range")
        return self


class ScanSessionFourDResultUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    patient_id: int = Field(gt=0)
    target_series_id: int = Field(gt=0)
    expected_version: int = Field(ge=0)
    workflow_stage: FourDResultWorkflowStage
    scan_result: FourDScanResultSnapshot
    rescan_choices: Optional[Dict[str, Literal["first", "rescan"]]] = None
    phase_selections: Optional[Dict[str, int]] = None

    @model_validator(mode="after")
    def validate_workflow_snapshot(self) -> "ScanSessionFourDResultUpsert":
        stage_order = FOUR_D_RESULT_STAGE_ORDER[self.workflow_stage]
        expected_rescan_keys: set[str] = set()
        if self.scan_result.rescan_bed_range is not None:
            start, end = self.scan_result.rescan_bed_range
            expected_rescan_keys = {str(index) for index in range(start, end + 1)}

        choice_keys = set(self.rescan_choices or {})
        if not choice_keys.issubset(expected_rescan_keys):
            raise ValueError("rescan_choices contains a bed outside rescan_bed_range")
        if stage_order >= FOUR_D_RESULT_STAGE_ORDER["rescan_selected"] and expected_rescan_keys:
            if self.rescan_choices is None or choice_keys != expected_rescan_keys:
                raise ValueError("rescan_choices must cover every bed in rescan_bed_range")
        if self.workflow_stage == "acquired" and self.rescan_choices is not None:
            raise ValueError("acquired results cannot contain rescan_choices")

        duplicate_cells = {
            f"{bed_index}-{phase_index}"
            for bed_index, row in enumerate(self.scan_result.phase_matrix)
            for phase_index, cell in enumerate(row)
            if cell.frame_count > 1
        }
        selection_keys = set(self.phase_selections or {})
        if not selection_keys.issubset(duplicate_cells):
            raise ValueError("phase_selections contains a non-duplicate or unknown cell")
        for key, selected_frame in (self.phase_selections or {}).items():
            bed_raw, phase_raw = key.split("-", 1)
            bed_index = int(bed_raw)
            phase_index = int(phase_raw)
            frame_count = self.scan_result.phase_matrix[bed_index][phase_index].frame_count
            if selected_frame < 0 or selected_frame >= frame_count:
                raise ValueError("phase selection must reference an available frame")

        if stage_order >= FOUR_D_RESULT_STAGE_ORDER["phase_selected"]:
            if self.phase_selections is None or selection_keys != duplicate_cells:
                raise ValueError("phase_selections must resolve every duplicate cell")
        elif self.phase_selections is not None:
            raise ValueError("phase_selections require phase_selected or ready workflow stage")
        return self


class ScanSessionFourDResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    scan_session_id: int
    patient_id: int
    target_series_id: int
    version: int = Field(ge=1)
    workflow_stage: FourDResultWorkflowStage
    source_kind: Literal["simulation"]
    image_source_id: Literal["fourd-engineer"]
    image_source_version: Literal[1]
    source_attempt_id: Optional[int] = Field(default=None, ge=1)
    scan_result: FourDScanResultSnapshot
    rescan_choices: Optional[Dict[str, Literal["first", "rescan"]]] = None
    phase_selections: Optional[Dict[str, int]] = None
    created_at: datetime
    updated_at: datetime


class ScanSessionFourDResultFinalize(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    patient_id: int = Field(gt=0)
    target_series_id: int = Field(gt=0)
    expected_version: int = Field(ge=1)


class ScanSessionFourDResultFinalizeResponse(BaseModel):
    replayed: bool
    result: ScanSessionFourDResult
    scan_session: ScanSessionDetail


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


# ---------------- User Management ----------------

UserStatus = Literal["active", "locked", "disabled"]


class UserRoleBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = None
    permissions: List[str] = Field(default_factory=list)


class UserRoleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


class UserRole(UserRoleBase):
    code: str
    is_system: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    user_count: int = 0


class UserAccountBase(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    display_name: str = Field(min_length=1, max_length=100)
    employee_id: Optional[str] = Field(default=None, max_length=50)
    department: Optional[str] = Field(default=None, max_length=80)
    title: Optional[str] = Field(default=None, max_length=80)
    role_code: str = Field(min_length=1, max_length=40)
    status: UserStatus = "active"
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=120)
    login_allowed: bool = True


class UserAccountCreate(BaseModel):
    username: Optional[str] = Field(default=None, max_length=50)
    display_name: str = Field(min_length=1, max_length=100)
    employee_id: Optional[str] = Field(default=None, max_length=50)
    department: Optional[str] = Field(default=None, max_length=80)
    title: Optional[str] = Field(default=None, max_length=80)
    role_code: str = Field(min_length=1, max_length=40)
    status: UserStatus = "active"
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=120)
    login_allowed: bool = True
    password_reset_required: bool = True


class UserAccountUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=2, max_length=50)
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    employee_id: Optional[str] = Field(default=None, max_length=50)
    department: Optional[str] = Field(default=None, max_length=80)
    title: Optional[str] = Field(default=None, max_length=80)
    role_code: Optional[str] = Field(default=None, min_length=1, max_length=40)
    status: Optional[UserStatus] = None
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=120)
    login_allowed: Optional[bool] = None
    password_reset_required: Optional[bool] = None
    failed_attempts: Optional[int] = Field(default=None, ge=0)


class UserAccount(UserAccountBase):
    id: int
    role_name: Optional[str] = None
    password_reset_required: bool = False
    credential_version: int = 1
    failed_attempts: int = 0
    last_login_at: Optional[datetime] = None
    password_updated_at: Optional[datetime] = None
    locked_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class UserManagementSnapshot(BaseModel):
    users: List[UserAccount]
    roles: List[UserRole]


class GeneratedUserCode(BaseModel):
    code: str


# ---------------- System Log ----------------

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class SystemLogCreate(BaseModel):
    level: LogLevel
    source: str
    event: str
    message: str
    details: Optional[str] = None
    scan_session_id: Optional[int] = None


class SystemLog(ORMModel):
    id: int
    timestamp: datetime
    level: str
    source: str
    event: str
    message: str
    details: Optional[str] = None
    scan_session_id: Optional[int] = None


# ---------------- Dose Log ----------------

class DoseLog(ORMModel):
    id: int
    created_at: datetime
    scanned_at: datetime

    patient_id: Optional[int] = None
    scan_session_id: Optional[int] = None
    scan_session_series_id: Optional[int] = None

    patient_name_snapshot: Optional[str] = None
    patient_id_snapshot: Optional[str] = None
    protocol_name_snapshot: Optional[str] = None

    series_order: Optional[int] = None
    series_type: str
    series_label: Optional[str] = None
    body_part: Optional[str] = None
    acquisition_type: Optional[str] = None
    scan_mode: Optional[str] = None

    kv: Optional[int] = None
    ma: Optional[float] = None
    rotation_time: Optional[float] = None
    pitch: Optional[float] = None
    scan_length: Optional[float] = None
    collimator: Optional[str] = None
    ctdi_vol: Optional[float] = None
    dlp: Optional[float] = None

    operator: Optional[str] = None


# ===== Dose Settings =====

ThresholdAction = Literal["log_only", "warn", "require_confirm"]
NoiseLevel = Literal["low", "medium", "high"]
AgeGroup = Literal["adult", "pediatric", "infant"]


class DoseSettingsBase(BaseModel):
    threshold_action: ThresholdAction = "warn"

    aec_enabled: bool = True
    aec_noise_level: NoiseLevel = "medium"

    audit_threshold_exceed: bool = True


class DoseSettings(ORMModel, DoseSettingsBase):
    id: int
    updated_at: datetime


class DoseSettingsUpdate(BaseModel):
    threshold_action: Optional[ThresholdAction] = None
    aec_enabled: Optional[bool] = None
    aec_noise_level: Optional[NoiseLevel] = None
    audit_threshold_exceed: Optional[bool] = None


class DrlEntryBase(BaseModel):
    body_part: str
    age_group: AgeGroup
    ctdi_ref: float = Field(ge=0)
    dlp_ref: float = Field(ge=0)


class DrlEntry(ORMModel, DrlEntryBase):
    id: int
    updated_at: datetime


class DrlBulkReplace(BaseModel):
    entries: List[DrlEntryBase]
