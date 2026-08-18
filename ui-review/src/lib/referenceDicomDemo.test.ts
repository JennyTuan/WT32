import { describe, expect, it, vi } from "vitest";

import { loadReferenceDicomManifest } from "./referenceDicomDemo";

const manifest = {
    sourceId: "chest-topogram-demo",
    version: 1,
    sourceKind: "simulation_reference",
    studyDescription: "Reference scout",
    seriesDescription: "Topogram",
    bodyPart: "CHEST",
    count: 1,
    rows: 512,
    columns: 512,
    windowCenter: 50,
    windowWidth: 350,
    urls: ["/dicom/reference.dcm"],
};

describe("reference DICOM manifest loading", () => {
    it("retries a source after a temporary load failure instead of caching null", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(manifest) });
        vi.stubGlobal("fetch", fetchMock);

        await expect(loadReferenceDicomManifest("chest-topogram-demo")).resolves.toBeNull();
        await expect(loadReferenceDicomManifest("chest-topogram-demo")).resolves.toEqual(manifest);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
