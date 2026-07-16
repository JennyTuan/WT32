import { describe, expect, it } from "vitest";
import type { ApiScanSessionDetail, ApiScanSessionSeries } from "./scanSession";
import {
    buildScanSessionExecutionContext,
    findRequiredTopogram,
    findTargetSeries,
    isScanExecutionReady,
    isSameScanSessionExecutionContext,
    isTerminalScanSessionStatus,
    isTopogramDependencyReady,
    matchesScanExecutionBinding,
    resolveTopogramImageSource,
} from "./scanSeriesPrerequisites";

const series = (
    id: number,
    seriesOrder: number,
    seriesType: ApiScanSessionSeries["series_type"],
    executionStatus: ApiScanSessionSeries["execution_status"] = "pending",
) => ({
    id,
    series_order: seriesOrder,
    series_type: seriesType,
    execution_status: executionStatus,
} as ApiScanSessionSeries);

describe("scan series prerequisites", () => {
    it("uses the nearest preceding topogram for the target series", () => {
        const earlier = series(1, 1, "topogram", "image_ready");
        const nearest = series(2, 3, "topogram", "image_ready");
        const target = series(3, 4, "helical");
        const later = series(4, 5, "topogram", "image_ready");

        expect(findRequiredTopogram([earlier, target, later, nearest], "helical")).toBe(nearest);
    });

    it("does not invent a dependency when the target or preceding topogram is absent", () => {
        expect(findRequiredTopogram([series(1, 1, "topogram")], "axial")).toBeNull();
        expect(findRequiredTopogram([series(2, 1, "axial"), series(3, 2, "topogram")], "axial")).toBeNull();
    });

    it("distinguishes a missing target series from a valid target without a topogram", () => {
        const axial = series(2, 1, "axial");

        expect(findTargetSeries([series(1, 1, "topogram")], "axial")).toBeNull();
        expect(findTargetSeries([axial], "axial")).toBe(axial);
        expect(findRequiredTopogram([axial], "axial")).toBeNull();
    });

    it("builds a patient and session-bound execution context only when the target exists", () => {
        const topogram = series(1, 1, "topogram", "image_ready");
        const axial = series(2, 2, "axial");
        const scanSession = {
            id: 10,
            patient_id: 20,
            series: [topogram, axial],
        } as ApiScanSessionDetail;

        expect(buildScanSessionExecutionContext(scanSession, "axial")).toEqual({
            scanSessionId: 10,
            patientId: 20,
            targetSeriesId: 2,
            requiredTopogramId: 1,
        });
        expect(buildScanSessionExecutionContext({ ...scanSession, series: [topogram] }, "axial")).toBeNull();
        expect(isSameScanSessionExecutionContext(
            buildScanSessionExecutionContext(scanSession, "axial")!,
            buildScanSessionExecutionContext(scanSession, "axial")!,
        )).toBe(true);
    });

    it("keeps helical and axial contexts bound to their own nearest preceding topograms", () => {
        const firstTopogram = series(1, 1, "topogram", "image_ready");
        const helical = series(2, 2, "helical");
        const secondTopogram = series(3, 3, "topogram", "image_ready");
        const axial = series(4, 4, "axial");
        const scanSession = {
            id: 10,
            patient_id: 20,
            series: [axial, secondTopogram, helical, firstTopogram],
        } as ApiScanSessionDetail;

        expect(buildScanSessionExecutionContext(scanSession, "helical")).toEqual({
            scanSessionId: 10,
            patientId: 20,
            targetSeriesId: 2,
            requiredTopogramId: 1,
        });
        expect(buildScanSessionExecutionContext(scanSession, "axial")).toEqual({
            scanSessionId: 10,
            patientId: 20,
            targetSeriesId: 4,
            requiredTopogramId: 3,
        });
    });

    it("treats every patient and route identity change as a different execution context", () => {
        const context = {
            scanSessionId: 10,
            patientId: 20,
            targetSeriesId: 30,
            requiredTopogramId: 40,
        };

        expect(isSameScanSessionExecutionContext(context, { ...context, scanSessionId: 11 })).toBe(false);
        expect(isSameScanSessionExecutionContext(context, { ...context, patientId: 21 })).toBe(false);
        expect(isSameScanSessionExecutionContext(context, { ...context, targetSeriesId: 31 })).toBe(false);
        expect(isSameScanSessionExecutionContext(context, { ...context, requiredTopogramId: 41 })).toBe(false);
    });

    it("requires both an image-ready topogram and a ready scout display", () => {
        const pending = series(1, 1, "topogram", "pending");
        const ready = series(2, 1, "topogram", "image_ready");

        expect(isTopogramDependencyReady(null, false)).toBe(true);
        expect(isTopogramDependencyReady(pending, true)).toBe(false);
        expect(isTopogramDependencyReady(ready, false)).toBe(false);
        expect(isTopogramDependencyReady(ready, true)).toBe(true);
    });

    it("only resolves an explicitly registered supported v1 topogram source", () => {
        const ready = series(1, 1, "topogram", "image_ready");

        expect(resolveTopogramImageSource({
            ...ready,
            image_source_id: "head-stroke-topogram",
            image_source_version: 1,
        })).toBe("head-stroke-topogram");
        expect(resolveTopogramImageSource({
            ...ready,
            image_source_id: "fourd-scout-demo",
            image_source_version: 1,
        })).toBeNull();
        expect(resolveTopogramImageSource({
            ...ready,
            image_source_id: "qin-lung-topogram",
            image_source_version: null,
        })).toBeNull();
        expect(resolveTopogramImageSource({
            ...ready,
            image_source_id: null,
            image_source_version: null,
        })).toBeNull();
    });

    it("fails closed when the patient and session execution context is missing", () => {
        expect(isScanExecutionReady(null, null, true)).toBe(false);
        expect(isScanExecutionReady({
            scanSessionId: 10,
            patientId: 20,
            targetSeriesId: 30,
            requiredTopogramId: null,
        }, null, false)).toBe(true);
    });

    it("matches the confirmed session, target series, and topogram as one binding", () => {
        const context = {
            scanSessionId: 10,
            patientId: 20,
            targetSeriesId: 30,
            requiredTopogramId: 40,
        };

        expect(matchesScanExecutionBinding(context, {
            scanSessionId: 10,
            targetSeriesId: 30,
            requiredTopogramId: 40,
        })).toBe(true);
        expect(matchesScanExecutionBinding(context, {
            scanSessionId: 10,
            targetSeriesId: 31,
            requiredTopogramId: 40,
        })).toBe(false);
        expect(matchesScanExecutionBinding(context, {
            scanSessionId: 11,
            targetSeriesId: 30,
            requiredTopogramId: 40,
        })).toBe(false);
        expect(matchesScanExecutionBinding(context, {
            scanSessionId: 10,
            targetSeriesId: 30,
            requiredTopogramId: 41,
        })).toBe(false);
        expect(matchesScanExecutionBinding(null, null)).toBe(false);
    });

    it("treats completed and cancelled sessions as terminal", () => {
        expect(isTerminalScanSessionStatus("draft")).toBe(false);
        expect(isTerminalScanSessionStatus("in_progress")).toBe(false);
        expect(isTerminalScanSessionStatus("completed")).toBe(true);
        expect(isTerminalScanSessionStatus("cancelled")).toBe(true);
    });
});
