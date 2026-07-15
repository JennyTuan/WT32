from __future__ import annotations

import importlib
import os
from dataclasses import dataclass
from typing import Protocol

from .schemas import (
    ReconstructionCapabilities,
    ReconstructionJobCreate,
    ReconstructionJobStatus,
    ReconstructionOutputSeries,
)


class ReconstructionProviderError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ProviderSubmission:
    provider_job_id: str
    status: ReconstructionJobStatus = "queued"
    progress: int = 0


@dataclass(frozen=True)
class ProviderJobUpdate:
    status: ReconstructionJobStatus
    progress: int
    output_series: ReconstructionOutputSeries | None = None
    error_code: str | None = None
    error_message: str | None = None


class ReconstructionProvider(Protocol):
    def capabilities(self) -> ReconstructionCapabilities: ...

    def submit(self, request: ReconstructionJobCreate) -> ProviderSubmission: ...

    def get_status(self, provider_job_id: str) -> ProviderJobUpdate: ...

    def cancel(self, provider_job_id: str) -> ProviderJobUpdate: ...


class UnconfiguredReconstructionProvider:
    def capabilities(self) -> ReconstructionCapabilities:
        return ReconstructionCapabilities(
            service_ready=False,
            provider_name="unconfigured",
            supports_metal_artifact_reduction=False,
            message="重建引擎未配置，请接入厂商 SDK、服务接口或命令行程序。",
        )

    def submit(self, request: ReconstructionJobCreate) -> ProviderSubmission:
        del request
        raise ReconstructionProviderError(
            "RECONSTRUCTION_ENGINE_NOT_CONFIGURED",
            "重建引擎未配置，无法提交重建任务。",
        )

    def get_status(self, provider_job_id: str) -> ProviderJobUpdate:
        del provider_job_id
        raise ReconstructionProviderError(
            "RECONSTRUCTION_ENGINE_NOT_CONFIGURED",
            "重建引擎未配置，无法查询重建任务。",
        )

    def cancel(self, provider_job_id: str) -> ProviderJobUpdate:
        del provider_job_id
        raise ReconstructionProviderError(
            "RECONSTRUCTION_ENGINE_NOT_CONFIGURED",
            "重建引擎未配置，无法取消重建任务。",
        )


def load_provider() -> ReconstructionProvider:
    provider_spec = os.environ.get("WT32_RECONSTRUCTION_PROVIDER", "").strip()
    if not provider_spec:
        return UnconfiguredReconstructionProvider()

    module_name, separator, factory_name = provider_spec.partition(":")
    if not separator or not module_name or not factory_name:
        raise RuntimeError("WT32_RECONSTRUCTION_PROVIDER must use 'module:factory' format")
    module = importlib.import_module(module_name)
    factory = getattr(module, factory_name)
    return factory()
