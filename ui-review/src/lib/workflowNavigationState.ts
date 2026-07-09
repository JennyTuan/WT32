import { clearScoutPositioningRange } from "./scoutPositioningSession";
import { clearSelectedScanSessionId } from "./scanSession";
import { clearSelectedScanWorkflowPlans } from "./scanWorkflowSession";

const SELECTED_PROTOCOL_KEY = "selectedProtocol";
const DETAIL_TARGET_STORAGE_KEY = "scanConfirmDetailTarget";
const PROTOCOL_SELECT_RESUME_KEY = "protocolSelectResume";
const PROTOCOL_SELECT_SELECTED_IDS_KEY = "protocolSelectSelectedIds";
const PROTOCOL_SELECT_SELECTED_PLAN_KEY = "protocolSelectSelectedPlanId";
const PROTOCOL_SELECT_SELECTED_SEQ_KEY = "protocolSelectSelectedSeqId";

export const clearProtocolSelectState = () => {
    if (typeof window === "undefined") return;

    sessionStorage.removeItem(PROTOCOL_SELECT_RESUME_KEY);
    sessionStorage.removeItem(PROTOCOL_SELECT_SELECTED_IDS_KEY);
    sessionStorage.removeItem(PROTOCOL_SELECT_SELECTED_PLAN_KEY);
    sessionStorage.removeItem(PROTOCOL_SELECT_SELECTED_SEQ_KEY);
};

export const clearSelectedExamWorkflowState = () => {
    if (typeof window === "undefined") return;

    clearSelectedScanSessionId();
    clearSelectedScanWorkflowPlans();
    clearScoutPositioningRange();
    localStorage.removeItem(SELECTED_PROTOCOL_KEY);
    localStorage.removeItem(DETAIL_TARGET_STORAGE_KEY);
    clearProtocolSelectState();
};
