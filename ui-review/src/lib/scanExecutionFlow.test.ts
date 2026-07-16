import { describe, expect, it } from "vitest";
import type { ApiScanSessionDetail, ApiScanSessionSeries } from "./scanSession";
import {
    canStartScoutExecution,
    resolvePostExecutionDestination,
    resolvePostScoutScanTypeFromSession,
    resolveSeriesRecoveryAction,
    selectScoutExecutionSeries,
} from "./scanExecutionFlow";

const series = (
    id: number,
    order: number,
    type: ApiScanSessionSeries["series_type"],
    executionStatus: ApiScanSessionSeries["execution_status"] = "pending",
): ApiScanSessionSeries => ({
    id,
    scan_session_id: 9,
    series_order: order,
    series_type: type,
    series_label: `${type}-${id}`,
    execution_status: executionStatus,
    range_confirmed: false,
    recon_series: [],
});

const session = (
    items: ApiScanSessionSeries[],
    acquisitionType: ApiScanSessionDetail["acquisition_type"] = "regular",
): ApiScanSessionDetail => ({
    id: 9,
    patient_id: 3,
    protocol_id: 2,
    status: "in_progress",
    name: "test",
    body_part: "head",
    age_group: "adult",
    patient_weight: "70",
    patient_position: "supine",
    table_direction: "head_first",
    acquisition_type: acquisitionType,
    scan_mode: acquisitionType === "four_d" ? "4d" : "plain",
    series: items,
});

describe("scan execution flow decisions", () => {
    it("uses the persisted session to route regular, gating, and 4D post-scout work", () => {
        expect(resolvePostScoutScanTypeFromSession(session([series(1, 1, "topogram"), series(2, 2, "4d")], "four_d"))).toBe("4d");
        expect(resolvePostScoutScanTypeFromSession(session([series(1, 1, "topogram"), series(2, 2, "helical")], "gating"))).toBe("gated_helical");
        expect(resolvePostScoutScanTypeFromSession(session([series(1, 1, "topogram"), series(2, 2, "axial")]))).toBe("axial");
    });

    it("selects both AP and LAT topograms for a dual-scout acquisition", () => {
        const first = series(11, 1, "topogram");
        const second = series(12, 2, "topogram");
        expect(selectScoutExecutionSeries(session([series(20, 3, "helical"), second, first]), true).map((item) => item.id)).toEqual([11, 12]);
        expect(selectScoutExecutionSeries(session([second, first]), false).map((item) => item.id)).toEqual([11]);
    });

    it("blocks scout triggering until authority, manifest source, and bound targets are ready", () => {
        expect(canStartScoutExecution(true, true, true, 2, 2)).toBe(true);
        expect(canStartScoutExecution(true, true, false, 0, 1)).toBe(true);
        expect(canStartScoutExecution(false, true, true, 2, 2)).toBe(false);
        expect(canStartScoutExecution(true, false, true, 2, 2)).toBe(false);
        expect(canStartScoutExecution(true, true, true, 1, 2)).toBe(false);
    });

    it("maps strict FSM recovery statuses to formal workflow actions", () => {
        expect(resolveSeriesRecoveryAction("running")).toBe("return_to_edit");
        expect(resolveSeriesRecoveryAction("failed")).toBe("retry_series");
        expect(resolveSeriesRecoveryAction("interrupted")).toBe("retry_series");
        expect(resolveSeriesRecoveryAction("pending")).toBeNull();
        expect(() => resolveSeriesRecoveryAction("image_ready")).toThrow();
    });

    it("returns every recoverable scout state to parameter confirmation through return_to_edit", () => {
        expect(resolveSeriesRecoveryAction("pending", "parameter_confirmation")).toBe("return_to_edit");
        expect(resolveSeriesRecoveryAction("running", "parameter_confirmation")).toBe("return_to_edit");
        expect(resolveSeriesRecoveryAction("failed", "parameter_confirmation")).toBe("return_to_edit");
        expect(resolveSeriesRecoveryAction("interrupted", "parameter_confirmation")).toBe("return_to_edit");
        expect(() => resolveSeriesRecoveryAction("image_ready", "parameter_confirmation")).toThrow();
    });

    it("keeps multi-target completion on the next confirmation route instead of the viewer", () => {
        const current = series(2, 2, "helical", "image_ready");
        const next = series(3, 3, "axial", "pending");
        expect(resolvePostExecutionDestination(session([series(1, 1, "topogram", "image_ready"), current, next]))).toEqual({
            kind: "next_series",
            route: "/sequence-confirm",
            targetSeriesId: 3,
        });
        expect(resolvePostExecutionDestination(session([series(1, 1, "topogram", "image_ready"), current]))).toEqual({
            kind: "viewer",
            route: "/image-viewer",
        });
    });

    it("blocks ambiguous repeated target types", () => {
        expect(resolvePostExecutionDestination(session([
            series(1, 1, "topogram", "image_ready"),
            series(2, 2, "helical", "image_ready"),
            series(3, 3, "helical", "pending"),
        ]))).toEqual({ kind: "blocked", route: null });
    });
});
