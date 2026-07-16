import { describe, expect, it, vi } from "vitest";

import type { PersistedFourDResult } from "./fourDResult";
import type { ApiScanSessionDetail } from "./scanSession";
import { resolveCompletedExamViewerState } from "./completedExamViewerState";

const createCompletedFourDSession = (): ApiScanSessionDetail => ({
    id: 17,
    patient_id: 5,
    protocol_id: 42,
    status: "completed",
    session_name: "historical-4d-session",
    name: "4D simulation protocol",
    body_part: "CHEST",
    age_group: "adult",
    patient_weight: "70-90kg",
    patient_position: "HFS",
    table_direction: "head_first",
    acquisition_type: "four_d",
    scan_mode: "4d",
    description: null,
    series: [
        {
            id: 171,
            scan_session_id: 17,
            template_series_id: 101,
            series_order: 1,
            series_type: "4d",
            series_label: "4D acquisition",
            execution_status: "image_ready",
            range_confirmed: true,
            recon_series: [],
        },
    ],
});

const createPersistedResult = (): PersistedFourDResult => ({
    id: 81,
    scanSessionId: 17,
    patientId: 5,
    targetSeriesId: 171,
    version: 4,
    workflowStage: "ready",
    sourceKind: "simulation",
    imageSourceId: "fourd-engineer",
    imageSourceVersion: 1,
    scanResult: {
        bedCount: 1,
        phaseCount: 2,
        scanLength: 25,
        phaseMatrix: [[
            { frameCount: 1, selectedFrame: 0 },
            { frameCount: 1, selectedFrame: 0 },
        ]],
        rescanOccurred: false,
        rescanBedRange: null,
    },
    rescanChoices: undefined,
    phaseSelections: undefined,
    createdAt: "2026-07-16T08:00:00Z",
    updatedAt: "2026-07-16T08:05:00Z",
});

describe("completed exam viewer state", () => {
    it("keeps ordinary completed exams on the existing offline viewer path", async () => {
        const fetchScanSession = vi.fn();
        const fetchResult = vi.fn();

        await expect(resolveCompletedExamViewerState({
            patientId: 5,
            scanSessionId: 17,
            acquisitionType: "regular",
            scanMode: "plain",
        }, { fetchScanSession, fetchResult })).resolves.toEqual({ offlineRecon: true });

        expect(fetchScanSession).not.toHaveBeenCalled();
        expect(fetchResult).not.toHaveBeenCalled();
    });

    it("restores a ready 4D result with patient, session and target bindings", async () => {
        const scanSession = createCompletedFourDSession();
        const persistedResult = createPersistedResult();
        const fetchScanSession = vi.fn().mockResolvedValue(scanSession);
        const fetchResult = vi.fn().mockResolvedValue(persistedResult);

        const state = await resolveCompletedExamViewerState({
            patientId: 5,
            scanSessionId: 17,
            acquisitionType: "four_d",
            scanMode: "4d",
        }, { fetchScanSession, fetchResult });

        expect(fetchScanSession).toHaveBeenCalledWith(17);
        expect(fetchResult).toHaveBeenCalledWith({
            scanSessionId: 17,
            patientId: 5,
            targetSeriesId: 171,
        });
        expect(state).toMatchObject({
            scanSessionId: 17,
            targetSeriesId: 171,
            resultVersion: 4,
            initialBrowseMode: "phase",
            offlineRecon: true,
            scanResult: persistedResult.scanResult,
        });
    });

    it("does not expose a result whose binding differs from the selected target", async () => {
        const mismatchedResult = {
            ...createPersistedResult(),
            targetSeriesId: 999,
        };

        await expect(resolveCompletedExamViewerState({
            patientId: 5,
            scanSessionId: 17,
            acquisitionType: "four_d",
            scanMode: "4d",
        }, {
            fetchScanSession: vi.fn().mockResolvedValue(createCompletedFourDSession()),
            fetchResult: vi.fn().mockResolvedValue(mismatchedResult),
        })).resolves.toEqual({ offlineRecon: true });
    });

    it("falls back to the viewer's explicit unavailable state when persistence cannot be read", async () => {
        await expect(resolveCompletedExamViewerState({
            patientId: 5,
            scanSessionId: 17,
            acquisitionType: "four_d",
            scanMode: "4d",
        }, {
            fetchScanSession: vi.fn().mockResolvedValue(createCompletedFourDSession()),
            fetchResult: vi.fn().mockRejectedValue(new Error("result not found")),
        })).resolves.toEqual({ offlineRecon: true });
    });
});
