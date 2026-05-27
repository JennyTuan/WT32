import { apiFetch } from "./apiClient";

export type DicomNodeRole = "archive" | "storage" | "worklist" | "printer";
export type DicomNodeStatus = "unknown" | "online" | "offline";
export type TransferSyntax =
  | "explicit_vr_little_endian"
  | "implicit_vr_little_endian"
  | "jpeg_lossless"
  | "jpeg_2000_lossless";
export type CompressionMode = "none" | "lossless" | "lossy_reference";

export type DicomLocalSettings = {
  ae_title: string;
  bind_host: string;
  port: number;
  receive_enabled: boolean;
  max_associations: number;
  implementation_name: string;
  storage_path: string;
};

export type DicomRemoteNode = {
  id: string;
  name: string;
  ae_title: string;
  host: string;
  port: number;
  role: DicomNodeRole;
  enabled: boolean;
  tls: boolean;
  description?: string | null;
  last_status: DicomNodeStatus;
  last_checked_at?: string | null;
};

export type DicomRoutingSettings = {
  default_destination_id?: string | null;
  auto_send_on_scan_complete: boolean;
  require_operator_confirm: boolean;
  include_dose_report: boolean;
  include_localizer: boolean;
  anonymize_before_send: boolean;
  retry_count: number;
  retry_interval_sec: number;
};

export type DicomTransferSettings = {
  preferred_transfer_syntax: TransferSyntax;
  compression: CompressionMode;
  max_pdu_kb: number;
  association_timeout_sec: number;
  dimse_timeout_sec: number;
};

export type DicomReceiveSettings = {
  accept_unknown_sources: boolean;
  store_incoming: boolean;
  reject_duplicate_instances: boolean;
  import_to_patient_list: boolean;
  retention_days: number;
  allowed_modalities: string[];
};

export type DicomSettingsSnapshot = {
  updated_at: string;
  local: DicomLocalSettings;
  nodes: DicomRemoteNode[];
  routing: DicomRoutingSettings;
  transfer: DicomTransferSettings;
  receive: DicomReceiveSettings;
};

export type DicomConnectionTestResult = {
  ok: boolean;
  status: DicomNodeStatus;
  checked_at: string;
  latency_ms?: number | null;
  message: string;
};

async function parseError(res: Response, fallback: string): Promise<Error> {
  try {
    const data = await res.json();
    return new Error(data?.detail ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function getDicomSettings(): Promise<DicomSettingsSnapshot> {
  const res = await apiFetch("/api/dicom-settings/");
  if (!res.ok) throw await parseError(res, `Failed to load DICOM settings (${res.status})`);
  return res.json();
}

export async function updateDicomSettings(payload: DicomSettingsSnapshot): Promise<DicomSettingsSnapshot> {
  const res = await apiFetch("/api/dicom-settings/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseError(res, `Failed to update DICOM settings (${res.status})`);
  return res.json();
}

export async function resetDicomSettings(): Promise<DicomSettingsSnapshot> {
  const res = await apiFetch("/api/dicom-settings/reset", { method: "POST" });
  if (!res.ok) throw await parseError(res, `Failed to reset DICOM settings (${res.status})`);
  return res.json();
}

export async function testDicomNode(node: DicomRemoteNode): Promise<DicomConnectionTestResult> {
  const res = await apiFetch("/api/dicom-settings/test-node", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node }),
  });
  if (!res.ok) throw await parseError(res, `Failed to test DICOM node (${res.status})`);
  return res.json();
}
