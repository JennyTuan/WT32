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
    scan_mode: Literal["plain", "contrast", "4d"]
    description: Optional[str] = None


class ProtocolCreate(ProtocolBase):
    pass


class ProtocolUpdate(BaseModel):
    name: Optional[str] = None
    body_part: Optional[str] = None
    scan_mode: Optional[Literal["plain", "contrast", "4d"]] = None
    description: Optional[str] = None


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


class TopogramParamBase(BaseModel):
    series_id: int
    kv: int
    ma: int
    scan_length: float
    scan_direction: Literal["cranio-caudal", "caudo-cranial"]
    fov: float


class TopogramParamCreate(TopogramParamBase):
    pass


class TopogramParamUpdate(BaseModel):
    series_id: Optional[int] = None
    kv: Optional[int] = None
    ma: Optional[int] = None
    scan_length: Optional[float] = None
    scan_direction: Optional[Literal["cranio-caudal", "caudo-cranial"]] = None
    fov: Optional[float] = None


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
    ctdi_vol: Optional[float] = None
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
    ctdi_vol: Optional[float] = None
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
    ctdi_vol: Optional[float] = None
    auto_ma: bool = False
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None


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
    ctdi_vol: Optional[float] = None
    auto_ma: Optional[bool] = None
    ma_min: Optional[float] = None
    ma_max: Optional[float] = None


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
    increment: float


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


class Series(SeriesBase, ORMModel):
    id: int


class SeriesDetail(Series, ORMModel):
    topogram_param: Optional[TopogramParam] = None
    helical_param: Optional[HelicalParam] = None
    axial_param: Optional[AxialParam] = None
    recon_series: List[ReconSeries] = Field(default_factory=list)
    fourd_config: Optional[FourDConfig] = None


class ProtocolDetail(ProtocolBase, ORMModel):
    id: int
    created_at: datetime
    contrast_config: Optional[ContrastConfig] = None
    series: List[SeriesDetail] = Field(default_factory=list)
