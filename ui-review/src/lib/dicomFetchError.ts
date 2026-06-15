// Classifies DICOM fetch / parse failures into i18n-friendly codes, shared
// across the various ad-hoc viewers (scout, helical preview, cornerstone).
// Callers translate the code via translateDicomLoadFailure.

export type DicomLoadFailureCode =
    | "DICOM_NOT_FOUND"
    | "DICOM_PERMISSION_DENIED"
    | "DICOM_INVALID"
    | "DICOM_TRUNCATED"
    | "UNKNOWN";

export interface DicomLoadFailure {
    code: DicomLoadFailureCode;
    detail?: string;
    serverMessage?: string;
}

const NETWORK_PATTERNS = /length|truncat|aborted|ERR_CONTENT_LENGTH|net::/i;
const KNOWN_CODES: readonly DicomLoadFailureCode[] = [
    "DICOM_NOT_FOUND",
    "DICOM_PERMISSION_DENIED",
    "DICOM_INVALID",
    "DICOM_TRUNCATED",
    "UNKNOWN",
];

export async function classifyDicomFetchFailure(
    res: Response | null,
    err: unknown,
): Promise<DicomLoadFailure> {
    if (res) {
        try {
            const ct = res.headers.get("content-type") ?? "";
            if (ct.includes("application/json")) {
                const body = (await res.clone().json()) as { code?: string; message?: string };
                const code = (KNOWN_CODES as readonly string[]).includes(body.code ?? "")
                    ? (body.code as DicomLoadFailureCode)
                    : "UNKNOWN";
                return { code, serverMessage: body.message };
            }
        } catch {
            // fall through
        }
        if (res.status === 404) return { code: "DICOM_NOT_FOUND" };
        if (res.status === 403) return { code: "DICOM_PERMISSION_DENIED" };
        if (res.status === 422) return { code: "DICOM_INVALID" };
        return { code: "UNKNOWN", detail: `HTTP ${res.status}` };
    }

    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (NETWORK_PATTERNS.test(msg)) {
        return { code: "DICOM_TRUNCATED" };
    }
    if (/parse|invalid|magic|DICM/i.test(msg)) {
        return { code: "DICOM_INVALID" };
    }
    return { code: "UNKNOWN", detail: msg };
}

const CODE_TO_I18N_KEY: Record<DicomLoadFailureCode, string> = {
    DICOM_NOT_FOUND: "dicomError.notFound",
    DICOM_PERMISSION_DENIED: "dicomError.permissionDenied",
    DICOM_INVALID: "dicomError.invalid",
    DICOM_TRUNCATED: "dicomError.truncated",
    UNKNOWN: "dicomError.unknown",
};

export function translateDicomLoadFailure(
    t: (key: string) => string,
    failure: DicomLoadFailure,
): string {
    if (failure.serverMessage) return failure.serverMessage;
    const base = t(CODE_TO_I18N_KEY[failure.code]);
    return failure.detail ? `${base}（${failure.detail}）` : base;
}
