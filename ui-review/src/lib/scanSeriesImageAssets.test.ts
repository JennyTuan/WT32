import { describe, expect, it } from "vitest";

import { getScanSeriesImageAsset } from "./scanSeriesImageAssets";

describe("scan series image assets", () => {
    it("registers the QIN lung topogram as a single image", () => {
        const asset = getScanSeriesImageAsset("qin-lung-topogram");

        expect(asset?.imageUrls).toEqual([
            "/daae3df7f522b56724aed7e3e544c0fe/series-000002/image-000002.dcm",
        ]);
    });

    it("registers every available QIN lung diagnostic slice", () => {
        const asset = getScanSeriesImageAsset("qin-lung-helical-demo");

        expect(asset?.imageUrls).toHaveLength(120);
        expect(asset?.imageUrls[0]).toBe("/dicom/cap/soft/1-001.dcm");
        expect(asset?.imageUrls[119]).toBe("/dicom/cap/soft/1-120.dcm");
        expect(new Set(asset?.imageUrls).size).toBe(120);
    });

    it("does not invent an asset for an unregistered source", () => {
        expect(getScanSeriesImageAsset("brain-helical-demo")).toBeNull();
        expect(getScanSeriesImageAsset(null)).toBeNull();
    });
});
