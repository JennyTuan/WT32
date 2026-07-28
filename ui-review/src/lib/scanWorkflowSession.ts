export type WorkflowSequenceType = "scout" | "helical" | "axial" | "4d" | "other";

export type WorkflowSequence = {
    id: string;
    sourceSeriesId?: number;
    name: string;
    type: WorkflowSequenceType;
    sourceReconIds?: number[];
};

export type WorkflowPlan = {
    id: string;
    protocolId?: number;
    sourceExamId?: number;
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

/**
 * 返回当前扫描计划之后、已绑定扫描会话的下一个计划。
 * 多计划检查必须先完成所有计划，不能在第一个计划完成后直接进入阅片。
 */
export const findNextWorkflowPlan = (
    plans: WorkflowPlan[],
    currentSessionId: number,
): WorkflowPlan | null => {
    const currentPlanIndex = plans.findIndex((plan) => plan.sourceSessionId === currentSessionId);
    if (currentPlanIndex < 0) return null;

    return plans.slice(currentPlanIndex + 1).find(
        (plan) => typeof plan.sourceSessionId === "number" && Number.isFinite(plan.sourceSessionId),
    ) ?? null;
};

export const clearSelectedScanWorkflowPlans = () => {
    localStorage.removeItem(STORAGE_KEY);
};
