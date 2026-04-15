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
