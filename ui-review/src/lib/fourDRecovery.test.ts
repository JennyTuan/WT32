import { describe, expect, it, vi } from "vitest";

import type { PersistedFourDResult } from "./fourDResult";
import {
    FourDRecoveryError,
    loadAuthoritativeFourDRecovery,
    resolveFourDRecoveryDestination,
} from "./fourDRecovery";
import type { ApiScanSessionDetail, ApiScanSessionSeries } from "./scanSession";

const createTarget = (
    overrides: Partial<ApiScanSessionSeries> = {},
): ApiScanSessionSeries => ({
    id: 171,
    scan_session_id: 17,
    template_series_id: 101,
    series_order: 2,
    series_type: "4d",
    series_label: "4D acquisition",
    execution_status: "running",
    failure_reason: null,
    range_confirmed: true,
    recon_series: [],
    ...overrides,
});

const createSession = (
    overrides: Partial<ApiScanSessionDetail> = {},
): ApiScanSessionDetail => ({
    id: 17,
    patient_id: 5,
    protocol_id: 42,
    status: "in_progress",
    session_name: "4d-session",
    name: "4D simulation protocol",
    body_part: "CHEST",
    age_group: "adult",
    patient_weight: "70-90kg",
    patient_position: "HFS",
    table_direction: "head_first",
    acquisition_type: "four_d",
    scan_mode: "4d",
    description: null,
    series: [createTarget()],
    ...overrides,
});

const createResult = (
    overrides: Partial<PersistedFourDResult> = {},
): PersistedFourDResult => ({
    id: 81,
    scanSessionId: 17,
    patientId: 5,
    targetSeriesId: 171,
    version: 1,
    workflowStage: "acquired",
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
    createdAt: "2026-07-16T08:00:00Z",
    updatedAt: "2026-07-16T08:05:00Z",
    ...overrides,
});

const expectRecoveryError = async (
    promise: Promise<unknown>,
    code: FourDRecoveryError["code"],
) => {
    try {
        await promise;
        throw new Error("Expected 4D recovery to fail.");
    } catch (error) {
        expect(error).toBeInstanceOf(FourDRecoveryError);
        expect((error as FourDRecoveryError).code).toBe(code);
    }
};

describe("authoritative 4D recovery", () => {
    it("fresh-loads the selected session and returns a fully bound result", async () => {
        const session = createSession();
        const target = session.series[0];
        const result = createResult();
        const fetchSelectedSession = vi.fn().mockResolvedValue(session);
        const fetchResult = vi.fn().mockResolvedValue(result);

        await expect(loadAuthoritativeFourDRecovery(5, {
            fetchSelectedSession,
            fetchResult,
        })).resolves.toEqual({ session, target, result });

        expect(fetchSelectedSession).toHaveBeenCalledOnce();
        expect(fetchSelectedSession).toHaveBeenCalledWith({ preferCache: false });
        expect(fetchResult).toHaveBeenCalledWith({
            scanSessionId: 17,
            patientId: 5,
            targetSeriesId: 171,
        });
    });

    it("rejects a selected session that belongs to another patient before loading a result", async () => {
        const fetchResult = vi.fn();

        await expectRecoveryError(loadAuthoritativeFourDRecovery(5, {
            fetchSelectedSession: vi.fn().mockResolvedValue(createSession({ patient_id: 6 })),
            fetchResult,
        }), "patient_mismatch");

        expect(fetchResult).not.toHaveBeenCalled();
    });

    it("rejects a target whose session binding is inconsistent", async () => {
        const fetchResult = vi.fn();
        const session = createSession({
            series: [createTarget({ scan_session_id: 999 })],
        });

        await expectRecoveryError(loadAuthoritativeFourDRecovery(5, {
            fetchSelectedSession: vi.fn().mockResolvedValue(session),
            fetchResult,
        }), "target_session_mismatch");

        expect(fetchResult).not.toHaveBeenCalled();
    });

    it("rejects a persisted result returned for another target", async () => {
        await expectRecoveryError(loadAuthoritativeFourDRecovery(5, {
            fetchSelectedSession: vi.fn().mockResolvedValue(createSession()),
            fetchResult: vi.fn().mockResolvedValue(createResult({ targetSeriesId: 999 })),
        }), "result_target_mismatch");
    });

    it("requires exactly one 4D target", async () => {
        const duplicateTarget = createTarget({ id: 172 });

        await expectRecoveryError(loadAuthoritativeFourDRecovery(5, {
            fetchSelectedSession: vi.fn().mockResolvedValue(createSession({
                series: [createTarget(), duplicateTarget],
            })),
            fetchResult: vi.fn(),
        }), "target_count_mismatch");
    });
});

describe("4D recovery destination", () => {
    it.each([
        ["acquired", true, "in_progress", "running", "rescan"],
        ["acquired", false, "in_progress", "running", "image-load"],
        ["rescan_selected", true, "in_progress", "running", "image-load"],
        ["phase_selected", true, "in_progress", "running", "phase-filter"],
        ["phase_selected", true, "in_progress", "image_ready", "phase-filter"],
        ["ready", true, "in_progress", "running", "phase-filter"],
        ["ready", true, "in_progress", "image_ready", "phase-filter"],
        ["ready", true, "completed", "image_ready", "viewer"],
    ] as const)(
        "%s / rescan=%s / %s / %s routes to %s",
        (workflowStage, rescanOccurred, sessionStatus, targetStatus, destination) => {
            expect(resolveFourDRecoveryDestination({
                workflowStage,
                rescanOccurred,
                sessionStatus,
                targetStatus,
            })).toBe(destination);
        },
    );

    it.each([
        ["ready", true, "completed", "running"],
        ["phase_selected", true, "completed", "image_ready"],
        ["ready", true, "cancelled", "image_ready"],
        ["ready", true, "draft", "running"],
        ["ready", true, "in_progress", "failed"],
        ["ready", true, "in_progress", "interrupted"],
        ["acquired", false, "in_progress", "image_ready"],
        ["acquired", false, "in_progress", "pending"],
    ] as const)(
        "blocks inconsistent state %s / rescan=%s / %s / %s",
        (workflowStage, rescanOccurred, sessionStatus, targetStatus) => {
            expect(resolveFourDRecoveryDestination({
                workflowStage,
                rescanOccurred,
                sessionStatus,
                targetStatus,
            })).toBe("blocked");
        },
    );
});
