import { apiFetch } from "./apiClient";
import type { ApiScanSeriesImageSourceId } from "./scanSession";

export type ReferenceDicomManifest = {
    sourceId: ApiScanSeriesImageSourceId;
    version: 1;
    sourceKind: "simulation_reference";
    studyDescription: string;
    seriesDescription: string;
    bodyPart: string;
    count: number;
    rows: number;
    columns: number;
    windowCenter: number | null;
    windowWidth: number | null;
    urls: string[];
};

type ReferenceBodyPart = "head" | "neck" | "chest" | "abdomen" | "spine" | "extremity";

const REFERENCE_BODY_PARTS = new Set<ReferenceBodyPart>([
    "head", "neck", "chest", "abdomen", "spine", "extremity",
]);

export const isReferenceDicomSourceId = (
    sourceId: ApiScanSeriesImageSourceId | null | undefined,
): sourceId is ApiScanSeriesImageSourceId => Boolean(
    sourceId && [...REFERENCE_BODY_PARTS].some((bodyPart) =>
        sourceId === `${bodyPart}-topogram-demo` || sourceId === `${bodyPart}-diagnostic-demo`),
);

export const resolveReferenceImageSourceId = (
    bodyPart: string | null | undefined,
    seriesType: "topogram" | "helical" | "axial",
): ApiScanSeriesImageSourceId | null => {
    if (!bodyPart || !REFERENCE_BODY_PARTS.has(bodyPart as ReferenceBodyPart)) return null;
    const kind = seriesType === "topogram" ? "topogram" : "diagnostic";
    return `${bodyPart}-${kind}-demo` as ApiScanSeriesImageSourceId;
};

const manifestCache = new Map<ApiScanSeriesImageSourceId, Promise<ReferenceDicomManifest | null>>();

export const loadReferenceDicomManifest = (
    sourceId: ApiScanSeriesImageSourceId,
): Promise<ReferenceDicomManifest | null> => {
    const existing = manifestCache.get(sourceId);
    if (existing) return existing;
    const request = apiFetch(`/api/demo-dicom/reference/${sourceId}`)
        .then((response) => response.ok ? response.json() as Promise<ReferenceDicomManifest> : null)
        .catch(() => null);
    manifestCache.set(sourceId, request);
    return request;
};
