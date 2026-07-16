import { describe, expect, it } from "vitest";
import { arePhaseSelectionsEqual } from "./fourDPhaseSelection";

describe("4D phase selection persistence guard", () => {
    it("compares selections independent of object key order", () => {
        expect(arePhaseSelectionsEqual({ "0-1": 1, "2-3": 0 }, { "2-3": 0, "0-1": 1 })).toBe(true);
        expect(arePhaseSelectionsEqual({ "0-1": 1 }, { "0-1": 0 })).toBe(false);
    });
});
