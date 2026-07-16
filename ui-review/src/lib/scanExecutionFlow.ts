import type { ApiScanSessionDetail, ApiScanSessionSeries } from "./scanSession";

export type PostScoutScanType = "helical" | "axial" | "4d" | "gated_helical" | "gated_axial";

export const resolvePostScoutScanTypeFromSession = (
    scanSession: ApiScanSessionDetail,
): PostScoutScanType | null => {
    const nextSeries = [...scanSession.series]
        .sort((left, right) => left.series_order - right.series_order)
        .find((series) => (
            series.series_type === "helical"
            || series.series_type === "axial"
            || series.series_type === "4d"
        ) && series.execution_status !== "image_ready");

    if (!nextSeries) return null;
    if (scanSession.acquisition_type === "gating") {
        return nextSeries.series_type === "helical" ? "gated_helical" : "gated_axial";
    }
    if (nextSeries.series_type === "helical" || nextSeries.series_type === "axial" || nextSeries.series_type === "4d") {
        return nextSeries.series_type;
    }
    return null;
};

export const selectScoutExecutionSeries = (
    scanSession: ApiScanSessionDetail | null,
    dualScout: boolean,
): ApiScanSessionSeries[] => {
    if (!scanSession) return [];
    const topograms = scanSession.series
        .filter((series) => series.series_type === "topogram")
        .sort((left, right) => left.series_order - right.series_order);
    return dualScout ? topograms.slice(0, 2) : topograms.slice(0, 1);
};

export const canStartScoutExecution = (
    authorityResolved: boolean,
    imageSourceReady: boolean,
    hasBoundSession: boolean,
    targetSeriesCount: number,
    expectedTargetSeriesCount: number,
) => authorityResolved
    && imageSourceReady
    && (!hasBoundSession || targetSeriesCount === expectedTargetSeriesCount);

export type SeriesRecoveryAction = "return_to_edit" | "retry_series" | null;

export const resolveSeriesRecoveryAction = (
    status: ApiScanSessionSeries["execution_status"],
): SeriesRecoveryAction => {
    if (status === "running") return "return_to_edit";
    if (status === "failed" || status === "interrupted") return "retry_series";
    if (status === "pending") return null;
    throw new Error("Series with an image-ready result cannot be retried");
};

export type PostExecutionDestination =
    | { kind: "viewer"; route: "/image-viewer" }
    | {
        kind: "next_series";
        route: "/helical-confirm" | "/sequence-confirm" | "/fourd-confirm";
        targetSeriesId: number;
      }
    | { kind: "blocked"; route: null };

export const resolvePostExecutionDestination = (
    scanSession: ApiScanSessionDetail,
): PostExecutionDestination => {
    const unfinishedTargets = scanSession.series.filter(
        (series) => series.series_type !== "topogram" && series.execution_status !== "image_ready",
    );
    if (unfinishedTargets.length === 0) return { kind: "viewer", route: "/image-viewer" };

    const nextTarget = [...unfinishedTargets]
        .sort((left, right) => left.series_order - right.series_order)
        .find((series) => series.execution_status === "pending");
    if (!nextTarget) return { kind: "blocked", route: null };

    const sameTypeCount = scanSession.series.filter(
        (series) => series.series_type === nextTarget.series_type,
    ).length;
    if (sameTypeCount !== 1) return { kind: "blocked", route: null };

    const route = nextTarget.series_type === "helical"
        ? "/helical-confirm"
        : nextTarget.series_type === "axial"
            ? "/sequence-confirm"
            : nextTarget.series_type === "4d"
                ? "/fourd-confirm"
                : null;
    if (!route) return { kind: "blocked", route: null };
    return { kind: "next_series", route, targetSeriesId: nextTarget.id };
};
