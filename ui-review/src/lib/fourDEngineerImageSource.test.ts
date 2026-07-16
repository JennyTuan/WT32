import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadFourDEngineerManifest,
  resetFourDEngineerManifestCache,
  type FourDEngineerManifest,
} from "./fourDEngineerImageSource";

const manifest: FourDEngineerManifest = {
  version: 1,
  source: "test",
  generatedBy: "test",
  bedCount: 1,
  phaseCount: 1,
  phaseLabels: ["0%"],
  sliceCountPerVolume: 1,
  rows: 1,
  columns: 1,
  volumes: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetFourDEngineerManifestCache();
});

describe("4D engineer manifest retries", () => {
  it("drops a cached failed load so an explicit retry performs a fresh request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => manifest });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadFourDEngineerManifest()).resolves.toBeNull();
    await expect(loadFourDEngineerManifest()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetFourDEngineerManifestCache();
    await expect(loadFourDEngineerManifest()).resolves.toEqual(manifest);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
