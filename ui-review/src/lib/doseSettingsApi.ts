import { buildApiUrl } from "./apiClient";

export type ThresholdAction = "log_only" | "warn" | "require_confirm";
export type NoiseLevel = "low" | "medium" | "high";
export type AgeGroup = "adult" | "pediatric" | "infant";

export type ApiDoseSettings = {
  id: number;
  updated_at: string;

  threshold_action: ThresholdAction;

  dom_enabled: boolean;
  dom_noise_level: NoiseLevel;

  audit_threshold_exceed: boolean;
};

export type DoseSettingsUpdate = Partial<Omit<ApiDoseSettings, "id" | "updated_at">>;

type LegacyDoseSettingsResponse = {
  id: number;
  updated_at: string;
  threshold_action: ThresholdAction;
  aec_enabled: boolean;
  aec_noise_level: NoiseLevel;
  audit_threshold_exceed: boolean;
};

type LegacyDoseSettingsUpdate = {
  threshold_action?: ThresholdAction;
  aec_enabled?: boolean;
  aec_noise_level?: NoiseLevel;
  audit_threshold_exceed?: boolean;
};

export type ApiDrlEntry = {
  id: number;
  body_part: string;
  age_group: AgeGroup;
  ctdi_ref: number;
  dlp_ref: number;
  updated_at: string;
};

export type DrlEntryInput = {
  body_part: string;
  age_group: AgeGroup;
  ctdi_ref: number;
  dlp_ref: number;
};

export async function getDoseSettings(): Promise<ApiDoseSettings> {
  const res = await fetch(buildApiUrl("/api/dose-settings/"));
  if (!res.ok) throw new Error(`Failed to load dose settings (${res.status})`);
  return mapDoseSettings(await res.json());
}

export async function updateDoseSettings(payload: DoseSettingsUpdate): Promise<ApiDoseSettings> {
  const res = await fetch(buildApiUrl("/api/dose-settings/"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toLegacyDoseSettingsPayload(payload)),
  });
  if (!res.ok) throw new Error(`Failed to update dose settings (${res.status})`);
  return mapDoseSettings(await res.json());
}

function mapDoseSettings(settings: LegacyDoseSettingsResponse): ApiDoseSettings {
  return {
    id: settings.id,
    updated_at: settings.updated_at,
    threshold_action: settings.threshold_action,
    dom_enabled: settings.aec_enabled,
    dom_noise_level: settings.aec_noise_level,
    audit_threshold_exceed: settings.audit_threshold_exceed,
  };
}

function toLegacyDoseSettingsPayload(payload: DoseSettingsUpdate): LegacyDoseSettingsUpdate {
  return {
    threshold_action: payload.threshold_action,
    aec_enabled: payload.dom_enabled,
    aec_noise_level: payload.dom_noise_level,
    audit_threshold_exceed: payload.audit_threshold_exceed,
  };
}

export async function listDrlEntries(): Promise<ApiDrlEntry[]> {
  const res = await fetch(buildApiUrl("/api/dose-settings/drl"));
  if (!res.ok) throw new Error(`Failed to list DRL entries (${res.status})`);
  return res.json();
}

export async function replaceDrlEntries(entries: DrlEntryInput[]): Promise<ApiDrlEntry[]> {
  const res = await fetch(buildApiUrl("/api/dose-settings/drl"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.detail ?? ""; } catch { /* ignore */ }
    throw new Error(detail || `Failed to replace DRL entries (${res.status})`);
  }
  return res.json();
}
