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
    // 旧会话只记录了协议名称（例如 Brain），没有 image-source 标记。来源
    // 必须由实际协议/序列决定，不能让旧的通用定位像回退覆盖脑部演示数据。
    return session.description?.includes("image-source:brain-helical-demo-v1") === true
        || isBrainHelicalName(session.name)
        || session.series.some(
            (series) => series.series_type === "helical" && isBrainHelicalName(series.series_label),
        );
};
