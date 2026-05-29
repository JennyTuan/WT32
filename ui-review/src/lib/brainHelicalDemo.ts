import type { ApiScanSessionDetail } from "./scanSession";
import type { WorkflowPlan } from "./scanWorkflowSession";

const BRAIN_HELICAL_TITLE = "\u8111\u90e8\u87ba\u65cb";
const LEGACY_MOJIBAKE_BRAIN_HELICAL_TITLE = "\u9474\u6226\u5134\u94FB\u70D8\u68C6";

export const isBrainHelicalName = (value: string | null | undefined) => {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return (
        value.includes(BRAIN_HELICAL_TITLE) ||
        value.includes(LEGACY_MOJIBAKE_BRAIN_HELICAL_TITLE) ||
        /\bbrain\b/i.test(value) ||
        normalized.startsWith("brain_") ||
        normalized.startsWith("brain/")
    );
};

export const isBrainHelicalWorkflow = (plans: WorkflowPlan[]) =>
    plans.some((plan) => isBrainHelicalName(plan.title));

export const isBrainHelicalScanSession = (session: ApiScanSessionDetail | null) => {
    if (!session) return false;
    if (session.acquisition_type !== "regular") return false;
    return session.body_part === "head";
};
