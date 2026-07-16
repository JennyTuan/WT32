export type ViewerBindingIdentity = {
    kind: "4d" | "standard";
    patientId: number | null;
    scanSessionId: number | null | undefined;
    targetSeriesId?: number | null;
    resultVersion?: number | null;
};

export const buildViewerBindingKey = (identity: ViewerBindingIdentity) => [
    identity.kind,
    identity.patientId ?? "none",
    identity.scanSessionId ?? "none",
    identity.targetSeriesId ?? "none",
    identity.resultVersion ?? "none",
].join(":");

export const isViewerBindingKeyVerified = (
    verifiedBindingKey: string | null,
    currentBindingKey: string,
) => verifiedBindingKey === currentBindingKey;
