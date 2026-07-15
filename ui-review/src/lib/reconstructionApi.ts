import { apiFetch } from "./apiClient";

export type ReconstructionJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type ReconstructionOutputSeries = {
  series_id: string;
  series_instance_uid?: string | null;
  series_description: string;
  image_urls: string[];
  image_count: number;
  kernel: string;
  slice_thickness: number;
  slice_spacing: number;
  fov: number;
  matrix: 512 | 1024;
  window_width?: number | null;
  window_level?: number | null;
  metal_artifact_reduction: boolean;
};

export type ReconstructionJob = {
  job_id: string;
  status: ReconstructionJobStatus;
  progress: number;
  request: ReconstructionJobCreate;
  output_series?: ReconstructionOutputSeries | null;
  error_code?: string | null;
  error_message?: string | null;
};

export type ReconstructionJobCreate = {
  scan_session_id?: number;
  source_series: {
    series_id: string;
    series_instance_uid?: string;
    raw_data_reference?: string;
    image_urls: string[];
  };
  parameters: {
    slice_thickness: number;
    slice_spacing: number;
    kernel: string;
    fov: number;
    center_x: number;
    center_y: number;
    z_start?: number;
    z_end?: number;
    matrix: 512 | 1024;
    metal_artifact_reduction: boolean;
    reconstruction_mode?: string;
    window_width: number;
    window_level: number;
  };
  requested_series_description?: string;
};

export class ReconstructionApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReconstructionApiError";
    this.code = code;
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as {
    detail?: { code?: string; message?: string } | string;
  } | null;
  if (!response.ok) {
    const detail = body?.detail;
    const code = typeof detail === "object" && detail?.code ? detail.code : "RECONSTRUCTION_REQUEST_FAILED";
    const message = typeof detail === "object" && detail?.message
      ? detail.message
      : typeof detail === "string"
        ? detail
        : "重建任务请求失败。";
    throw new ReconstructionApiError(code, message);
  }
  return body as T;
}

export async function createReconstructionJob(payload: ReconstructionJobCreate, signal?: AbortSignal) {
  const response = await apiFetch("/api/reconstruction/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  return readResponse<ReconstructionJob>(response);
}

export async function getReconstructionJob(jobId: string, signal?: AbortSignal) {
  const response = await apiFetch(`/api/reconstruction/jobs/${encodeURIComponent(jobId)}`, { signal });
  return readResponse<ReconstructionJob>(response);
}

export async function listReconstructionJobs(scanSessionId: number, signal?: AbortSignal) {
  const response = await apiFetch(`/api/reconstruction/jobs?scan_session_id=${scanSessionId}`, { signal });
  return readResponse<ReconstructionJob[]>(response);
}

export async function waitForReconstructionJob(
  jobId: string,
  signal?: AbortSignal,
  onUpdate?: (job: ReconstructionJob) => void,
) {
  while (!signal?.aborted) {
    const job = await getReconstructionJob(jobId, signal);
    onUpdate?.(job);
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 1000);
      signal?.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }
  throw new DOMException("Aborted", "AbortError");
}
