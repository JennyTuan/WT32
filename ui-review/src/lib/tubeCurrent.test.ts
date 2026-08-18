import { describe, expect, it } from "vitest";

import { clampMa, getMaLimit, getMaOptions } from "./tubeCurrent";

describe("tube current limits", () => {
    it("uses the shared 140 kV limits for each focus size", () => {
        expect(getMaLimit(140, "small")).toBe(200);
        expect(getMaLimit(140, "large")).toBe(300);
        expect(clampMa(215, 140, "small")).toBe(200);
        expect(getMaOptions(140, "small")).toEqual(["50", "100", "150", "200"]);
    });
});
