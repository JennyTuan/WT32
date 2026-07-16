import { describe, expect, it, vi } from "vitest";

import {
    fetchFourDResult,
    finalizeFourDResult,
    FourDResultRequestError,
    saveFourDResult,
} from "./fourDResult";
import {
    fetchSelectedScanSession,
    saveSelectedScanSessionId,
    type ApiScanSessionDetail,
} from "./scanSession";

const apiScanResult = {
    bed_count: 2,
    phase_count: 2,
    scan_length: 165,
    phase_matrix: [
        [
            { frame_count: 1, selected_frame: 0 },
            { frame_count: 2, selected_frame: 1 },
        ],
        [
            { frame_count: 1, selected_frame: 0 },
            { frame_count: 1, selected_frame: 0 },
        ],
    ],
    rescan_occurred: true,
    rescan_bed_range: [0, 1] as [number, number],
};

const createApiResult = (overrides: Record<string, unknown> = {}) => ({
    id: 91,
    scan_session_id: 7,
    patient_id: 5,
    target_series_id: 70,
    version: 4,
    workflow_stage: "phase_selected",
    source_kind: "simulation",
    image_source_id: "fourd-engineer",
    image_source_version: 1,
    source_attempt_id: 303,
    scan_result: apiScanResult,
    rescan_choices: { 0: "rescan" },
    phase_selections: { "0-1": 1 },
    created_at: "2026-07-16T10:00:00Z",
    updated_at: "2026-07-16T10:05:00Z",
    ...overrides,
});

const createCompletedScanSession = (): ApiScanSessionDetail => ({
    id: 7,
    patient_id: 5,
    protocol_id: 42,
    status: "completed",
    session_name: "4D lung simulation",
    name: "4D lung simulation",
    body_part: "CHEST",
    age_group: "adult",
    patient_weight: "70-90kg",
    patient_position: "HFS",
    table_direction: "head_first",
    acquisition_type: "four_d",
    scan_mode: "4d",
    description: "Reference simulation only",
    series: [{
        id: 70,
        scan_session_id: 7,
        template_series_id: 101,
        series_order: 1,
        series_type: "4d",
        series_label: "4D target",
        execution_status: "image_ready",
        range_confirmed: true,
        image_source_id: null,
        image_source_version: null,
        recon_series: [],
    }],
});

const jsonResponse = <T,>(body: T, status = 200): Response => ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
} as unknown as Response);

describe("4D result persistence client", () => {
    it("sends the save contract and maps persisted provenance into client fields", async () => {
        const responseBody = createApiResult();
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
        vi.stubGlobal("fetch", fetchMock);

        const result = await saveFourDResult({
            scanSessionId: 7,
            patientId: 5,
            targetSeriesId: 70,
            expectedVersion: 3,
            workflowStage: "phase_selected",
            state: {
                scanResult: {
                    bedCount: 2,
                    phaseCount: 2,
                    scanLength: 165,
                    phaseMatrix: [
                        [
                            { frameCount: 1, selectedFrame: 0 },
                            { frameCount: 2, selectedFrame: 1 },
                        ],
                        [
                            { frameCount: 1, selectedFrame: 0 },
                            { frameCount: 1, selectedFrame: 0 },
                        ],
                    ],
                    rescanOccurred: true,
                    rescanBedRange: [0, 1],
                },
                rescanChoices: { 0: "rescan" },
                phaseSelections: { "0-1": 1 },
            },
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/scan-sessions/7/fourd-result"),
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patient_id: 5,
                    target_series_id: 70,
                    expected_version: 3,
                    workflow_stage: "phase_selected",
                    scan_result: apiScanResult,
                    rescan_choices: { 0: "rescan" },
                    phase_selections: { "0-1": 1 },
                }),
            },
        );
        expect(result).toEqual({
            id: 91,
            scanSessionId: 7,
            patientId: 5,
            targetSeriesId: 70,
            version: 4,
            workflowStage: "phase_selected",
            sourceKind: "simulation",
            imageSourceId: "fourd-engineer",
            imageSourceVersion: 1,
            sourceAttemptId: 303,
            scanResult: {
                bedCount: 2,
                phaseCount: 2,
                scanLength: 165,
                phaseMatrix: [
                    [
                        { frameCount: 1, selectedFrame: 0 },
                        { frameCount: 2, selectedFrame: 1 },
                    ],
                    [
                        { frameCount: 1, selectedFrame: 0 },
                        { frameCount: 1, selectedFrame: 0 },
                    ],
                ],
                rescanOccurred: true,
                rescanBedRange: [0, 1],
            },
            rescanChoices: { 0: "rescan" },
            phaseSelections: { "0-1": 1 },
            createdAt: "2026-07-16T10:00:00Z",
            updatedAt: "2026-07-16T10:05:00Z",
        });
    });

    it("reads a result with binding query parameters and preserves provenance", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(createApiResult({
            source_attempt_id: null,
            workflow_stage: "acquired",
            rescan_choices: null,
            phase_selections: null,
        })));
        vi.stubGlobal("fetch", fetchMock);

        const result = await fetchFourDResult({
            scanSessionId: 7,
            patientId: 5,
            targetSeriesId: 70,
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/scan-sessions/7/fourd-result?patient_id=5&target_series_id=70"),
        );
        expect(result).toMatchObject({
            scanSessionId: 7,
            patientId: 5,
            targetSeriesId: 70,
            workflowStage: "acquired",
            sourceKind: "simulation",
            imageSourceId: "fourd-engineer",
            imageSourceVersion: 1,
        });
        expect(result.sourceAttemptId).toBeUndefined();
        expect(result.rescanChoices).toBeUndefined();
        expect(result.phaseSelections).toBeUndefined();
    });
});

describe("4D result finalization client", () => {
    it("posts the atomic finalize contract, maps the result, and refreshes the selected cache", async () => {
        const scanSession = createCompletedScanSession();
        const responseBody = {
            replayed: false,
            result: createApiResult({ workflow_stage: "ready", version: 5 }),
            scan_session: scanSession,
        };
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(scanSession.id);

        const finalized = await finalizeFourDResult({
            scanSessionId: 7,
            patientId: 5,
            targetSeriesId: 70,
            expectedVersion: 4,
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/scan-sessions/7/fourd-result/finalize"),
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patient_id: 5,
                    target_series_id: 70,
                    expected_version: 4,
                }),
            },
        );
        expect(finalized).toMatchObject({
            replayed: false,
            result: {
                workflowStage: "ready",
                version: 5,
                imageSourceId: "fourd-engineer",
                imageSourceVersion: 1,
                sourceAttemptId: 303,
            },
            scanSession,
        });
        await expect(fetchSelectedScanSession()).resolves.toEqual(scanSession);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retains the non-success status on FourDResultRequestError", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
            detail: "4D result version conflict",
        }, 409)));

        const request = finalizeFourDResult({
            scanSessionId: 7,
            patientId: 5,
            targetSeriesId: 70,
            expectedVersion: 3,
        });

        await expect(request).rejects.toMatchObject({
            name: "FourDResultRequestError",
            message: "4D result version conflict",
            status: 409,
        });
        await request.catch((error: unknown) => {
            expect(error).toBeInstanceOf(FourDResultRequestError);
        });
    });
});
