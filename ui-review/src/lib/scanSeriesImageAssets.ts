import type { ApiScanSeriesImageSourceId } from "./scanSession";

export type ScanSeriesImageAsset = {
    imageUrls: readonly string[];
};

const makeNumberedDicomUrls = (
    basePath: string,
    count: number,
    filePrefix: string,
): readonly string[] => Array.from(
    { length: count },
    (_, index) => `${basePath}/${filePrefix}${String(index + 1).padStart(3, "0")}.dcm`,
);

const qinLungDiagnosticBasePath = "/dicom/cap/soft";

/**
 * 已登记扫描结果与项目内静态 DICOM 的唯一映射入口。
 * 后端的 image_source_id 只有在这里存在对应资源时，查看器才能加载影像。
 */
export const SCAN_SERIES_IMAGE_ASSETS = {
    "qin-lung-topogram": {
        imageUrls: [
            "/daae3df7f522b56724aed7e3e544c0fe/series-000002/image-000002.dcm",
        ],
    },
    "qin-lung-helical-demo": {
        imageUrls: makeNumberedDicomUrls(qinLungDiagnosticBasePath, 120, "1-"),
    },
} as const satisfies Partial<Record<ApiScanSeriesImageSourceId, ScanSeriesImageAsset>>;

export const getScanSeriesImageAsset = (
    sourceId: ApiScanSeriesImageSourceId | null | undefined,
): ScanSeriesImageAsset | null => {
    if (!sourceId) return null;
    return SCAN_SERIES_IMAGE_ASSETS[sourceId as keyof typeof SCAN_SERIES_IMAGE_ASSETS] ?? null;
};
