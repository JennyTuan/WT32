import { describe, expect, it, vi } from "vitest";

import {
    applyScanWorkflowAction,
    createActionId,
    type ApiScanWorkflowAction,
} from "./scanWorkflowActions";
import {
    fetchScanSessionById,
    fetchSelectedScanSession,
    saveSelectedScanSessionId,
    type ApiScanSessionDetail,
} from "./scanSession";

const createScanSession = (id: number): ApiScanSessionDetail => ({
    id,
    patient_id: 5,
    protocol_id: 42,
    status: "in_progress",
    session_name: `scan-session-${id}`,
    name: "Chest routine protocol",
    body_part: "CHEST",
    age_group: "adult",
    patient_weight: "70-90kg",
    patient_position: "HFS",
    table_direction: "head_first",
    acquisition_type: "regular",
    scan_mode: "plain",
    description: null,
    series: [{
        id: id * 10,
        scan_session_id: id,
        template_series_id: 101,
        series_order: 1,
        series_type: "helical",
        series_label: "Chest helical",
        execution_status: "running",
        range_confirmed: true,
        recon_series: [],
    }],
});

const createAction = (scanSessionId: number, actionId: string): ApiScanWorkflowAction => ({
    id: 11,
    action_id: actionId,
    scan_session_id: scanSessionId,
    target_series_id: scanSessionId * 10,
    action_type: "terminate_exam",
    reason: "operator requested termination",
    resulting_session_status: "cancelled",
    resulting_series_status: "interrupted",
    next_entry: "patient_list",
    dose_log_disposition: "not_emitted",
    created_at: "2026-07-16T10:00:00Z",
});

const jsonResponse = <T,>(body: T, status = 200): Response => ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
} as unknown as Response);

describe("scan workflow action identifiers", () => {
    it("reuses a caller-supplied action id and generates a valid default", () => {
        expect(createActionId("workflow-retry-0001")).toBe("workflow-retry-0001");
        expect(createActionId()).toMatch(/^workflow-[A-Za-z0-9-]{8,}$/);
    });
});

describe("scan workflow action client", () => {
    it("posts the action contract and refreshes the selected session cache", async () => {
        const selectedSession = createScanSession(7);
        const updatedSession: ApiScanSessionDetail = {
            ...selectedSession,
            status: "cancelled",
            series: [{
                ...selectedSession.series[0]!,
                execution_status: "interrupted",
                failure_reason: "operator requested termination",
                range_confirmed: false,
            }],
        };
        const actionId = "workflow-terminate-0001";
        const result = {
            action: createAction(selectedSession.id, actionId),
            scan_session: updatedSession,
            replayed: false,
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(selectedSession))
            .mockResolvedValueOnce(jsonResponse(result));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(selectedSession.id);
        await fetchScanSessionById(selectedSession.id);

        await expect(applyScanWorkflowAction(selectedSession.id, {
            action_id: actionId,
            action: "terminate_exam",
            target_series_id: selectedSession.series[0]!.id,
            reason: "operator requested termination",
        })).resolves.toEqual(result);

        await expect(fetchSelectedScanSession()).resolves.toEqual(updatedSession);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining(`/api/scan-sessions/${selectedSession.id}/actions`),
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action_id: actionId,
                    action: "terminate_exam",
                    target_series_id: selectedSession.series[0]!.id,
                    reason: "operator requested termination",
                }),
            },
        );
    });

    it("returns a replayed idempotent response without changing its shape", async () => {
        const session = createScanSession(7);
        const actionId = "workflow-terminate-0001";
        const result = {
            action: createAction(session.id, actionId),
            scan_session: { ...session, status: "cancelled" as const },
            replayed: true,
        };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(result)));

        await expect(applyScanWorkflowAction(session.id, {
            action_id: actionId,
            action: "terminate_exam",
            reason: "operator requested termination",
        })).resolves.toEqual(result);
    });

    it.each([
        [{ detail: "Only a failed or interrupted series can be retried" }, "Only a failed or interrupted series can be retried"],
        [{ detail: { code: "ACTION_ID_CONFLICT", message: "action_id already has another payload" } }, "action_id already has another payload"],
    ])("parses string and object error details", async (body, expectedMessage) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body, 409)));

        await expect(applyScanWorkflowAction(7, {
            action_id: "workflow-retry-0001",
            action: "retry_series",
            target_series_id: 70,
            reason: "retry after review",
        })).rejects.toThrow(expectedMessage);
    });
});
