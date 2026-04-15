export type WorkflowSequenceType = "scout" | "helical" | "axial" | "4d" | "other";

export type WorkflowSequence = {
    id: string;
    name: string;
    type: WorkflowSequenceType;
};

export type WorkflowPlan = {
    id: string;
    title: string;
    sourceSessionId?: number;
    sequences: WorkflowSequence[];
};

const STORAGE_KEY = "selectedScanWorkflowPlans";
const LEGACY_4D_FLOW_PROTOCOL_NAMES = new Set(["胸腔自由呼吸（轴扫）"]);

export const saveSelectedScanWorkflowPlans = (plans: WorkflowPlan[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
};

export const loadSelectedScanWorkflowPlans = (): WorkflowPlan[] => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw) as WorkflowPlan[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const clearSelectedScanWorkflowPlans = () => {
    localStorage.removeItem(STORAGE_KEY);
};

export const usesLegacy4DScanFlow = (plans: WorkflowPlan[]): boolean => {
    return plans.some((plan) => LEGACY_4D_FLOW_PROTOCOL_NAMES.has(plan.title.trim()));
};
