import { describe, expect, it } from "vitest";

import { createDraftSeries } from "./api";

describe("createDraftSeries", () => {
    it.each(["topogram", "helical", "axial"] as const)("applies the enabled DOM default to a new %s series", (seriesType) => {
        const series = createDraftSeries(-1, seriesType, 1, "zh-CN", true);
        const dom = series.topogram_param?.dom ?? series.helical_param?.dom ?? series.axial_param?.dom;

        expect(dom).toBe("1");
    });

    it("allows the system-level DOM default to disable a new series", () => {
        const series = createDraftSeries(-1, "helical", 1, "zh-CN", false);

        expect(series.helical_param?.dom).toBe("0");
    });
});
