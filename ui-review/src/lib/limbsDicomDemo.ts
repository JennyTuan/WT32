import { apiFetch } from "./apiClient";
import type { ApiScanSessionDetail } from "./scanSession";
import type { WorkflowPlan } from "./scanWorkflowSession";

export type LimbsDicomDemoSeries = {
    key: "topogram" | "thin-soft" | "thin-bone" | "vr-reference";
    seriesInstanceUid: string;
    seriesDescription: string;
    protocolName: string;
    bodyPart: string;
    imageType: string[];
    count: number;
    rows: number;
    cols: number;
    sliceThickness: string;
    pixelSpacing: string[];
    kv: string;
    mAs: string;
    fov: string;
    matrix: string;
    kernel: string;
    windowCenter: number | null;
    windowWidth: number | null;
    firstFile: string;
    urls: string[];
};

export type LimbsDicomDemoManifest = {
    studyId: string;
    studyName: string;
    sourcePath: string;
    defaultSeriesKey: LimbsDicomDemoSeries["key"];
    defaultVolumePreset: string;
    defaultWindowWidth: number;
    defaultWindowLevel: number;
    series: LimbsDicomDemoSeries[];
};

const LIMBS_HELICAL_TITLES = ["四肢", "limbs", "lower extremity"];

export const isLimbsHelicalName = (value: string | null | undefined) => {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return LIMBS_HELICAL_TITLES.some((title) => normalized.includes(title));
};

export const isLimbsHelicalWorkflow = (plans: WorkflowPlan[]) =>
    plans.some((plan) => isLimbsHelicalName(plan.title));

export const isLimbsHelicalScanSession = (session: ApiScanSessionDetail | null) => {
    if (!session) return false;
    if (session.acquisition_type !== "regular") return false;
    if (session.body_part !== "extremity") return false;
    return isLimbsHelicalName(session.name);
};

let manifestPromise: Promise<LimbsDicomDemoManifest> | null = null;

export const loadLimbsDicomDemoManifest = () => {
    if (!manifestPromise) {
        manifestPromise = apiFetch("/api/demo-dicom/limbs-helical").then(async (response) => {
            if (!response.ok) {
                throw new Error(`Failed to load limbs DICOM demo manifest (${response.status})`);
            }
            return response.json() as Promise<LimbsDicomDemoManifest>;
        });
    }
    return manifestPromise;
};

export const getLimbsDicomSeries = (
    manifest: LimbsDicomDemoManifest | null,
    key: LimbsDicomDemoSeries["key"],
) => manifest?.series.find((series) => series.key === key) ?? null;
