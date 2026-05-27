import { apiFetch } from "./apiClient";

export type LanguageCode = "zh-CN" | "en-US";
export type ThemeMode = "light" | "dark" | "auto";
export type TimeFormat = "24h" | "12h";
export type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";
export type LengthUnit = "mm" | "cm";
export type WeightUnit = "kg" | "lb";
export type NetworkMode = "dhcp" | "static";
export type LicenseStatus = "valid" | "expiring" | "expired";

export type GeneralSettings = {
  language: LanguageCode;
  theme: ThemeMode;
  time_format: TimeFormat;
  date_format: DateFormat;
  length_unit: LengthUnit;
  weight_unit: WeightUnit;
};

export type TimeSettings = {
  timezone: string;
  ntp_enabled: boolean;
  ntp_server: string;
  ntp_fallback: string;
  sync_interval_min: number;
};

export type NetworkSettings = {
  hostname: string;
  mode: NetworkMode;
  ip_address: string;
  netmask: string;
  gateway: string;
  dns_primary: string;
  dns_secondary: string;
  proxy_enabled: boolean;
  proxy_url: string;
};

export type DevicePreferences = {
  auto_lock_min: number;
  screensaver_min: number;
  beep_enabled: boolean;
  volume: number;
  brightness: number;
  show_patient_avatar: boolean;
  confirm_before_scan: boolean;
};

export type MaintenanceSettings = {
  auto_logout_min: number;
  boot_self_check: boolean;
  allow_remote_assist: boolean;
  crash_report_upload: boolean;
  daily_restart_enabled: boolean;
  daily_restart_time: string;
};

export type AboutInfo = {
  device_model: string;
  serial_number: string;
  software_version: string;
  firmware_version: string;
  license_status: LicenseStatus;
  license_expires_at: string | null;
};

export type SystemSettingsSnapshot = {
  updated_at: string;
  general: GeneralSettings;
  time: TimeSettings;
  network: NetworkSettings;
  device: DevicePreferences;
  maintenance: MaintenanceSettings;
  about: AboutInfo;
};

export type TimeSyncResult = {
  ok: boolean;
  server: string;
  server_time: string;
  drift_ms: number;
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

export async function getSystemSettings(): Promise<SystemSettingsSnapshot> {
  const res = await apiFetch("/api/system-settings/");
  if (!res.ok) throw await parseError(res, `Failed to load system settings (${res.status})`);
  return res.json();
}

export async function updateSystemSettings(payload: SystemSettingsSnapshot): Promise<SystemSettingsSnapshot> {
  const res = await apiFetch("/api/system-settings/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseError(res, `Failed to update system settings (${res.status})`);
  return res.json();
}

export async function resetSystemSettings(): Promise<SystemSettingsSnapshot> {
  const res = await apiFetch("/api/system-settings/reset", { method: "POST" });
  if (!res.ok) throw await parseError(res, `Failed to reset system settings (${res.status})`);
  return res.json();
}

export async function syncSystemTime(): Promise<TimeSyncResult> {
  const res = await apiFetch("/api/system-settings/time-sync", { method: "POST" });
  if (!res.ok) throw await parseError(res, `Failed to sync time (${res.status})`);
  return res.json();
}
