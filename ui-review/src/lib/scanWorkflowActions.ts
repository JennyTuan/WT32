import { buildApiUrl } from "./apiClient";
import {
    cacheScanSessionIfSelected,
    type ApiScanSessionDetail,
    type ApiScanSessionSeries,
} from "./scanSession";

export type ScanWorkflowActionType =
    | "return_to_edit"
    | "retry_series"
    | "terminate_exam"
    | "finish_with_partial";

export type ScanWorkflowActionNextEntry = "series_edit" | "series_confirm" | "patient_list";

export type ApiScanWorkflowAction = {
    id: number;
    action_id: string;
    scan_session_id: number;
    target_series_id?: number | null;
    action_type: ScanWorkflowActionType;
    reason: string;
    resulting_session_status: ApiScanSessionDetail["status"];
    resulting_series_status?: ApiScanSessionSeries["execution_status"] | null;
    next_entry: ScanWorkflowActionNextEntry;
    dose_log_disposition: "not_emitted";
    created_at: string;
};

export type ApplyScanWorkflowActionPayload = {
    action_id?: string;
    action: ScanWorkflowActionType;
    target_series_id?: number | null;
    reason: string;
};

export type ApplyScanWorkflowActionResponse = {
    action: ApiScanWorkflowAction;
    scan_session: ApiScanSessionDetail;
    replayed: boolean;
};

type ApiErrorBody = {
    detail?: string | {
        code?: string;
        message?: string;
    };
};

const parseActionError = async (response: Response) => {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    const detail = body?.detail;
    if (typeof detail === "string" && detail) return new Error(detail);
    if (detail && typeof detail === "object" && detail.message) {
        return new Error(detail.message);
    }
    return new Error(`Failed to apply scan workflow action: ${response.status}`);
};

export const createActionId = (actionId?: string) => {
    if (actionId) return actionId;

    const randomUuid = globalThis.crypto?.randomUUID?.();
    if (randomUuid) return `workflow-${randomUuid}`;

    return `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export const applyScanWorkflowAction = async (
    scanSessionId: number,
    payload: ApplyScanWorkflowActionPayload,
) => {
    const requestPayload = {
        ...payload,
        action_id: createActionId(payload.action_id),
    };
    const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}/actions`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
    });
    if (!response.ok) throw await parseActionError(response);

    const result = (await response.json()) as ApplyScanWorkflowActionResponse;
    cacheScanSessionIfSelected(result.scan_session);
    return result;
};
