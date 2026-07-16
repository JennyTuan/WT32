import { describe, expect, it } from "vitest";
import type { ApiScanSeriesImageSourceId, ApiScanSessionSeries } from "./scanSession";
import {
    hasVerifiedSeriesImageSource,
    IMAGE_SOURCE_IDS_BY_SERIES_TYPE,
    isSeriesImageSourceCompatible,
    resolveHelicalResultImageSource,
} from "./scanSeriesImageSource";

const binding = (
    imageSourceId: ApiScanSeriesImageSourceId | null,
    overrides: Partial<Pick<
        ApiScanSessionSeries,
        "series_type" | "execution_status" | "image_source_version"
    >> = {},
) => ({
    series_type: "topogram" as const,
    execution_status: "image_ready" as const,
    image_source_id: imageSourceId,
    image_source_version: 1 as const,
    ...overrides,
});

describe("scan series image source", () => {
    it.each([
        ["head-stroke-topogram", "topogram"],
        ["head-dual-scout-demo", "topogram"],
        ["limbs-helical-demo", "topogram"],
        ["qin-lung-topogram", "topogram"],
        ["fourd-scout-demo", "topogram"],
        ["brain-helical-demo", "helical"],
        ["limbs-helical-demo", "helical"],
        ["qin-lung-helical-demo", "helical"],
    ] as const)("accepts %s as an explicit %s source", (sourceId, seriesType) => {
        expect(isSeriesImageSourceCompatible(sourceId, seriesType)).toBe(true);
        expect(IMAGE_SOURCE_IDS_BY_SERIES_TYPE[seriesType]).toContain(sourceId);
    });

    it.each([
        ["brain-helical-demo", "topogram"],
        ["head-stroke-topogram", "helical"],
        ["qin-lung-topogram", "axial"],
        ["fourd-scout-demo", "4d"],
    ] as const)("rejects %s for incompatible series type %s", (sourceId, seriesType) => {
        expect(isSeriesImageSourceCompatible(sourceId, seriesType)).toBe(false);
    });

    it("does not register per-series axial or 4D image results", () => {
        expect(IMAGE_SOURCE_IDS_BY_SERIES_TYPE.axial).toEqual([]);
        expect(IMAGE_SOURCE_IDS_BY_SERIES_TYPE["4d"]).toEqual([]);
    });

    it("rejects missing compatibility inputs", () => {
        expect(isSeriesImageSourceCompatible(null, "topogram")).toBe(false);
        expect(isSeriesImageSourceCompatible(undefined, "topogram")).toBe(false);
        expect(isSeriesImageSourceCompatible("qin-lung-topogram", null)).toBe(false);
        expect(isSeriesImageSourceCompatible("qin-lung-topogram", undefined)).toBe(false);
    });

    it.each([
        ["head-stroke-topogram", "brain-helical-demo"],
        ["head-dual-scout-demo", "brain-helical-demo"],
        ["limbs-helical-demo", "limbs-helical-demo"],
        ["qin-lung-topogram", "qin-lung-helical-demo"],
    ] as const)("maps %s to its explicit helical result dataset", (source, expected) => {
        expect(resolveHelicalResultImageSource(source)).toBe(expected);
    });

    it("does not infer a result dataset from a missing or incompatible topogram source", () => {
        expect(resolveHelicalResultImageSource(null)).toBeNull();
        expect(resolveHelicalResultImageSource("fourd-scout-demo")).toBeNull();
        expect(resolveHelicalResultImageSource("brain-helical-demo")).toBeNull();
    });

    it("requires an image-ready, compatible, paired v1 source binding", () => {
        expect(hasVerifiedSeriesImageSource(binding("qin-lung-topogram"))).toBe(true);
        expect(hasVerifiedSeriesImageSource(binding("qin-lung-topogram", { image_source_version: null }))).toBe(false);
        expect(hasVerifiedSeriesImageSource(binding(null))).toBe(false);
        expect(hasVerifiedSeriesImageSource(null)).toBe(false);
        expect(hasVerifiedSeriesImageSource(undefined)).toBe(false);
    });

    it.each(["pending", "running", "failed", "interrupted"] as const)(
        "rejects a %s source binding before image readiness",
        (executionStatus) => {
            expect(hasVerifiedSeriesImageSource(binding("qin-lung-topogram", {
                execution_status: executionStatus,
            }))).toBe(false);
        },
    );

    it("rejects a source bound to the wrong series type", () => {
        expect(hasVerifiedSeriesImageSource(binding("brain-helical-demo"))).toBe(false);
        expect(hasVerifiedSeriesImageSource(binding("head-stroke-topogram", { series_type: "helical" }))).toBe(false);
        expect(hasVerifiedSeriesImageSource(binding("qin-lung-topogram", { series_type: "axial" }))).toBe(false);
        expect(hasVerifiedSeriesImageSource(binding("fourd-scout-demo", { series_type: "4d" }))).toBe(false);
    });

    it("rejects unsupported source versions at runtime", () => {
        expect(hasVerifiedSeriesImageSource(binding("qin-lung-topogram", {
            image_source_version: 2 as unknown as 1,
        }))).toBe(false);
    });
});
