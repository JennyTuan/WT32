import type { ApiScanSeriesImageSourceId, ApiScanSessionSeries } from "./scanSession";

export const SUPPORTED_IMAGE_SOURCE_VERSION = 1 as const;

type ScanSeriesType = ApiScanSessionSeries["series_type"];

export const IMAGE_SOURCE_IDS_BY_SERIES_TYPE = {
    topogram: [
        "head-stroke-topogram",
        "head-dual-scout-demo",
        "limbs-helical-demo",
        "qin-lung-topogram",
        "fourd-scout-demo",
    ],
    helical: [
        "brain-helical-demo",
        "limbs-helical-demo",
        "qin-lung-helical-demo",
    ],
    axial: [],
    "4d": [],
} as const satisfies Readonly<Record<ScanSeriesType, readonly ApiScanSeriesImageSourceId[]>>;

export const isSeriesImageSourceCompatible = (
    sourceId: ApiScanSeriesImageSourceId | null | undefined,
    seriesType: ScanSeriesType | null | undefined,
): boolean => {
    if (!sourceId || !seriesType) return false;

    return (IMAGE_SOURCE_IDS_BY_SERIES_TYPE[seriesType] as readonly ApiScanSeriesImageSourceId[]).includes(sourceId);
};

type SeriesImageSourceBinding = Pick<
    ApiScanSessionSeries,
    "series_type" | "execution_status" | "image_source_id" | "image_source_version"
>;

export const hasVerifiedSeriesImageSource = (
    series: SeriesImageSourceBinding | null | undefined,
): series is SeriesImageSourceBinding & {
    execution_status: "image_ready";
    image_source_id: ApiScanSeriesImageSourceId;
    image_source_version: typeof SUPPORTED_IMAGE_SOURCE_VERSION;
} => Boolean(
    series
    && series.execution_status === "image_ready"
    && series.image_source_version === SUPPORTED_IMAGE_SOURCE_VERSION
    && isSeriesImageSourceCompatible(series.image_source_id, series.series_type),
);

export const resolveHelicalResultImageSource = (
    topogramSourceId: ApiScanSeriesImageSourceId | null | undefined,
): Extract<ApiScanSeriesImageSourceId, "brain-helical-demo" | "limbs-helical-demo" | "qin-lung-helical-demo"> | null => {
    switch (topogramSourceId) {
        case "head-stroke-topogram":
        case "head-dual-scout-demo":
            return "brain-helical-demo";
        case "limbs-helical-demo":
            return "limbs-helical-demo";
        case "qin-lung-topogram":
            return "qin-lung-helical-demo";
        default:
            return null;
    }
};
