// Friendly Chinese error messages for DICOM fetch / parse failures, shared
// across the various ad-hoc viewers (scout, helical preview, cornerstone).

export interface DicomLoadFailure {
    code: string;
    message: string;
}

const NETWORK_PATTERNS = /length|truncat|aborted|ERR_CONTENT_LENGTH|net::/i;

export async function classifyDicomFetchFailure(
    res: Response | null,
    err: unknown,
): Promise<DicomLoadFailure> {
    if (res) {
        try {
            const ct = res.headers.get("content-type") ?? "";
            if (ct.includes("application/json")) {
                const body = (await res.clone().json()) as { code?: string; message?: string };
                if (body.message) {
                    return { code: body.code ?? "UNKNOWN", message: body.message };
                }
            }
        } catch {
            // fall through
        }
        if (res.status === 404) return { code: "DICOM_NOT_FOUND", message: "影像文件不存在或路径错误" };
        if (res.status === 403) return { code: "DICOM_PERMISSION_DENIED", message: "影像文件无法读取，系统权限被拒绝（可能被安全软件锁定）" };
        if (res.status === 422) return { code: "DICOM_INVALID", message: "影像文件格式错误，无法解析（可能被加密软件锁定或文件已损坏）" };
        return { code: "UNKNOWN", message: `影像加载失败 (HTTP ${res.status})` };
    }

    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (NETWORK_PATTERNS.test(msg)) {
        return { code: "DICOM_TRUNCATED", message: "影像数据传输不完整，可能被加密软件拦截或网络中断" };
    }
    if (/parse|invalid|magic|DICM/i.test(msg)) {
        return { code: "DICOM_INVALID", message: "影像文件格式错误，无法解析（可能被加密软件锁定或文件已损坏）" };
    }
    return { code: "UNKNOWN", message: `影像加载失败：${msg || "未知错误"}` };
}
