import { apiFetch } from "./apiClient";
import type { ApiScanSessionDetail } from "./scanSession";
import type { WorkflowPlan, WorkflowSequence } from "./scanWorkflowSession";

export type HeadDualScoutSeries = {
    key: "scout-ap" | "scout-lat";
    view: "AP" | "LAT";
    tubeAngle: number;
    seriesInstanceUid: string;
    seriesDescription: string;
    protocolName: string;
    bodyPart: string;
    imageType: string[];
    rows: number;
    cols: number;
    pixelSpacing: string[];
    sliceThickness: string;
    kv: string;
    mAs: string;
    fov: string;
    imageOrientationPatient: string[];
    imagePositionPatient: string[];
    windowCenter: number | null;
    windowWidth: number | null;
    url: string;
};

export type HeadDualScoutManifest = {
    studyId: string;
    studyName: string;
    sourcePath: string;
    defaultWindowWidth: number;
    defaultWindowLevel: number;
    series: HeadDualScoutSeries[];
};

const HEAD_DUAL_SCOUT_TITLES = ["头部双定位", "head dual scout"];

export const isHeadDualScoutName = (value: string | null | undefined) => {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return HEAD_DUAL_SCOUT_TITLES.some((title) => normalized.includes(title.toLowerCase()));
};

export const isHeadDualScoutWorkflow = (plans: WorkflowPlan[]) =>
    plans.some((plan) => isHeadDualScoutName(plan.title));

export const isHeadDualScoutSession = (session: ApiScanSessionDetail | null) => {
    if (!session) return false;
    return session.description?.includes("image-source:head-dual-scout-demo-v1") === true;
};

let manifestPromise: Promise<HeadDualScoutManifest> | null = null;

export const loadHeadDualScoutManifest = () => {
    if (!manifestPromise) {
        manifestPromise = apiFetch("/api/demo-dicom/head-dual-scout").then(async (response) => {
            if (!response.ok) {
                throw new Error(`Failed to load head dual scout manifest (${response.status})`);
            }
            return response.json() as Promise<HeadDualScoutManifest>;
        });
    }
    return manifestPromise;
};

export const resetHeadDualScoutManifestCache = () => {
    manifestPromise = null;
};

export const getHeadDualScoutSeries = (
    manifest: HeadDualScoutManifest | null,
    key: HeadDualScoutSeries["key"],
) => manifest?.series.find((series) => series.key === key) ?? null;

/**
 * For dual-scout plans, collapse the two scout sequences (AP + LAT) into a
 * single sidebar node since they share one trigger / one parameter confirm /
 * one execute step in the clinical workflow.
 */
export const mergeDualScoutPlanSequences = (plan: WorkflowPlan): WorkflowPlan => {
    if (!isHeadDualScoutName(plan.title)) return plan;
    const scouts = plan.sequences.filter((seq) => seq.type === "scout");
    if (scouts.length < 2) return plan;
    const firstScoutIdx = plan.sequences.findIndex((seq) => seq.type === "scout");
    const merged: WorkflowSequence = {
        ...scouts[0],
        name: "定位像 (AP+LAT)",
    };
    const nextSequences = plan.sequences
        .filter((seq) => seq.type !== "scout")
        .slice();
    nextSequences.splice(firstScoutIdx, 0, merged);
    return { ...plan, sequences: nextSequences };
};
