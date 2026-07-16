import type { ApiScanSeriesImageSourceId, ApiScanSessionDetail, ApiScanSessionSeries } from "./scanSession";

export type DependentScanSeriesType = Extract<ApiScanSessionSeries["series_type"], "helical" | "axial" | "4d">;

export const findTargetSeries = (
    series: readonly ApiScanSessionSeries[],
    targetType: DependentScanSeriesType,
) => series.find((item) => item.series_type === targetType) ?? null;

export const findRequiredTopogram = (
    series: readonly ApiScanSessionSeries[],
    targetType: DependentScanSeriesType,
) => {
    const targetSeries = findTargetSeries(series, targetType);
    if (!targetSeries) return null;

    return [...series]
        .filter((item) => item.series_type === "topogram" && item.series_order < targetSeries.series_order)
        .sort((left, right) => right.series_order - left.series_order)[0] ?? null;
};

export const isTopogramDependencyReady = (
    requiredTopogram: ApiScanSessionSeries | null,
    scoutDisplayReady: boolean,
) => !requiredTopogram || (requiredTopogram.execution_status === "image_ready" && scoutDisplayReady);

export type SupportedTopogramImageSourceId = Extract<
    ApiScanSeriesImageSourceId,
    "head-stroke-topogram" | "head-dual-scout-demo" | "limbs-helical-demo" | "qin-lung-topogram"
>;

const SUPPORTED_TOPOGRAM_IMAGE_SOURCES = new Set<SupportedTopogramImageSourceId>([
    "head-stroke-topogram",
    "head-dual-scout-demo",
    "limbs-helical-demo",
    "qin-lung-topogram",
]);

export const resolveTopogramImageSource = (
    requiredTopogram: ApiScanSessionSeries | null,
): SupportedTopogramImageSourceId | null => {
    if (
        !requiredTopogram
        || requiredTopogram.series_type !== "topogram"
        || requiredTopogram.execution_status !== "image_ready"
        || requiredTopogram.image_source_version !== 1
        || !requiredTopogram.image_source_id
    ) {
        return null;
    }
    return SUPPORTED_TOPOGRAM_IMAGE_SOURCES.has(requiredTopogram.image_source_id as SupportedTopogramImageSourceId)
        ? requiredTopogram.image_source_id as SupportedTopogramImageSourceId
        : null;
};

export type ScanSessionExecutionContext = {
    scanSessionId: number;
    patientId: number;
    targetSeriesId: number;
    requiredTopogramId: number | null;
};

export type ScanExecutionBinding = Omit<ScanSessionExecutionContext, "patientId">;

export const buildScanSessionExecutionContext = (
    scanSession: ApiScanSessionDetail,
    targetType: DependentScanSeriesType,
): ScanSessionExecutionContext | null => {
    const targetSeries = findTargetSeries(scanSession.series, targetType);
    if (!targetSeries) return null;

    return {
        scanSessionId: scanSession.id,
        patientId: scanSession.patient_id,
        targetSeriesId: targetSeries.id,
        requiredTopogramId: findRequiredTopogram(scanSession.series, targetType)?.id ?? null,
    };
};

export const isSameScanSessionExecutionContext = (
    left: ScanSessionExecutionContext,
    right: ScanSessionExecutionContext,
) => left.scanSessionId === right.scanSessionId
    && left.patientId === right.patientId
    && left.targetSeriesId === right.targetSeriesId
    && left.requiredTopogramId === right.requiredTopogramId;

export const matchesScanExecutionBinding = (
    context: ScanSessionExecutionContext | null,
    binding: ScanExecutionBinding | null,
) => context !== null
    && binding !== null
    && context.scanSessionId === binding.scanSessionId
    && context.targetSeriesId === binding.targetSeriesId
    && context.requiredTopogramId === binding.requiredTopogramId;

export const isTerminalScanSessionStatus = (
    status: ApiScanSessionDetail["status"],
) => status === "completed" || status === "cancelled";

export const isScanExecutionReady = (
    context: ScanSessionExecutionContext | null,
    requiredTopogram: ApiScanSessionSeries | null,
    scoutDisplayReady: boolean,
) => context !== null && isTopogramDependencyReady(requiredTopogram, scoutDisplayReady);
