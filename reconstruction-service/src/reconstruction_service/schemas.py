from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


ReconstructionJobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class ReconstructionParameters(BaseModel):
    slice_thickness: float = Field(gt=0)
    slice_spacing: float = Field(gt=0)
    kernel: str = Field(min_length=1, max_length=64)
    fov: float = Field(gt=0)
    center_x: float = 0
    center_y: float = 0
    z_start: float | None = None
    z_end: float | None = None
    matrix: Literal[512, 1024] = 512
    metal_artifact_reduction: bool = False
    reconstruction_mode: str | None = Field(default=None, max_length=64)
    window_width: float | None = Field(default=None, gt=0)
    window_level: float | None = None

    @model_validator(mode="after")
    def validate_z_range(self):
        if self.z_start is not None and self.z_end is not None and self.z_start >= self.z_end:
            raise ValueError("z_start must be less than z_end")
        return self


class SourceSeriesReference(BaseModel):
    series_id: str = Field(min_length=1, max_length=160)
    series_instance_uid: str | None = Field(default=None, max_length=160)
    raw_data_reference: str | None = Field(default=None, max_length=1024)
    image_urls: list[str] = Field(default_factory=list)


class ReconstructionJobCreate(BaseModel):
    scan_session_id: int | None = Field(default=None, gt=0)
    source_series: SourceSeriesReference
    parameters: ReconstructionParameters
    requested_series_description: str | None = Field(default=None, max_length=160)


class ReconstructionOutputSeries(BaseModel):
    series_id: str
    series_instance_uid: str | None = None
    series_description: str
    image_urls: list[str] = Field(min_length=1)
    image_count: int = Field(gt=0)
    kernel: str
    slice_thickness: float = Field(gt=0)
    slice_spacing: float = Field(gt=0)
    fov: float = Field(gt=0)
    matrix: Literal[512, 1024]
    window_width: float | None = Field(default=None, gt=0)
    window_level: float | None = None
    metal_artifact_reduction: bool = False


class ReconstructionJob(BaseModel):
    job_id: str
    status: ReconstructionJobStatus
    progress: int = Field(ge=0, le=100)
    request: ReconstructionJobCreate
    provider_job_id: str | None = None
    output_series: ReconstructionOutputSeries | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class ReconstructionCapabilities(BaseModel):
    service_ready: bool
    provider_name: str
    supported_matrices: list[int] = Field(default_factory=lambda: [512, 1024])
    supports_metal_artifact_reduction: bool = False
    message: str | None = None
