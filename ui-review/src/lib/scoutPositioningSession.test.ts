import { describe, expect, it } from "vitest";

import { mapCropBoxToScoutRange, mapScoutRangeToCropBox } from "./scoutPositioningSession";

describe("scout positioning range mapping", () => {
    it("keeps the simulated gantry range normalized when a crop box is converted back to positions", () => {
        const range = mapCropBoxToScoutRange({ y: 0.2, height: 0.46 });

        expect(range).toEqual({ start: 412, end: 623.6 });
        expect(mapScoutRangeToCropBox(range)).toMatchObject({ y: 0.2, height: 0.46 });
    });

    it("clamps an out-of-bounds crop box to the supported simulation range", () => {
        expect(mapCropBoxToScoutRange({ y: -0.2, height: 1.5 })).toEqual({ start: 320, end: 780 });
    });
});
