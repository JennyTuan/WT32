import { describe, expect, it } from "vitest";

import { buildScanStartRequest } from "./deviceProtocol";
import type { ApiScanSessionDetail } from "./scanSession";

describe("buildScanStartRequest", () => {
    it("always sends the fixed medium bowtie filter", () => {
        const session = {
            id: 1,
            patient_id: 2,
            protocol_id: 3,
            status: "draft",
            name: "Test",
            body_part: "head",
            age_group: "adult",
            patient_weight: "50-90kg",
            patient_position: "HFS",
            table_direction: "in",
            acquisition_type: "regular",
            scan_mode: "plain",
            series: [{
                id: 4,
                scan_session_id: 1,
                series_order: 1,
                series_type: "topogram",
                series_label: "Scout",
                execution_status: "pending",
                range_confirmed: false,
                topogram_param: {
                    id: 5,
                    kv: 120,
                    ma: 30,
                    scan_length: 80,
                    tube_angle: 270,
                    fov: 500,
                    bowtie_type: "large",
                },
                recon_series: [{
                    id: 6,
                    recon_name: "Soft tissue",
                    recon_type: "soft",
                    kernel: "S2",
                    matrix: 512,
                    window_width: 400,
                    window_level: 40,
                    slice_thickness: 5,
                    increment: 5,
                    recon_fov: 250,
                    metal_artifact_suppression: false,
                }, {
                    id: 7,
                    recon_name: "Default DFOV",
                    recon_type: "soft",
                    kernel: "S2",
                    matrix: 512,
                    window_width: 400,
                    window_level: 40,
                    slice_thickness: 5,
                    increment: 5,
                    recon_fov: null,
                    metal_artifact_suppression: false,
                }],
            }],
        } satisfies ApiScanSessionDetail;

        const plan = buildScanStartRequest(session).PlanScanStartInfo.SeriesCollection[0];

        expect(plan.ScanParams.BowtieType).toBe("medium");
        expect(plan.ScanParams).not.toHaveProperty("SFOV");
        expect(plan.ReconParamsCollection[0].DFOV).toBe(250);
        expect(plan.ReconParamsCollection[1].DFOV).toBe(500);
    });
});
