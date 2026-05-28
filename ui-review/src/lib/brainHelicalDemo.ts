import type { ApiScanSessionDetail } from "./scanSession";
import type { WorkflowPlan } from "./scanWorkflowSession";

const BRAIN_HELICAL_PROTOCOL_IDS = new Set([1]);
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

const parseId = (value: string | number | null | undefined) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
};

const isBrainHelicalProtocolId = (protocolId: string | number | null | undefined) => {
    const parsed = parseId(protocolId);
    return parsed !== null && BRAIN_HELICAL_PROTOCOL_IDS.has(parsed);
};

export const isBrainHelicalWorkflow = (plans: WorkflowPlan[]) =>
    plans.some((plan) => {
        const protocolId = plan.protocolId ?? parseId(plan.id);
        const matchesProtocol = protocolId !== null
            ? isBrainHelicalProtocolId(protocolId)
            : isBrainHelicalName(plan.title);
        return matchesProtocol && plan.sequences.some((sequence) => sequence.type === "helical");
    });

export const isBrainHelicalScanSession = (session: ApiScanSessionDetail | null) => {
    if (!session) return false;
    const hasHelicalSeries = session.series.some((series) => series.series_type === "helical");
    if (!hasHelicalSeries || session.acquisition_type !== "regular") return false;

    return isBrainHelicalProtocolId(session.protocol_id);
};
