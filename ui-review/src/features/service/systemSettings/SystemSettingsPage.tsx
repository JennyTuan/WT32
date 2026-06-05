import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Globe2,
  Info,
  Network,
  RefreshCw,
  RotateCcw,
  Save,
  Sliders,
  Timer,
  type LucideIcon,
} from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import {
  getSystemSettings,
  resetSystemSettings,
  syncSystemTime,
  updateSystemSettings,
  type GeneralSettings,
  type LicenseStatus,
  type NetworkSettings,
  type SystemSettingsSnapshot,
  type TimeSettings,
} from "../../../lib/systemSettingsApi";
import { useI18n } from "../../../lib/i18nContext";
import type { TranslationKey } from "../../../lib/i18n";

const LANGUAGE_OPTIONS: GeneralSettings["language"][] = ["zh-CN", "en-US"];
const LANGUAGE_LABEL_KEYS: Record<GeneralSettings["language"], TranslationKey> = {
  "zh-CN": "language.zh-CN",
  "en-US": "language.en-US",
};

const THEME_OPTIONS: GeneralSettings["theme"][] = ["light", "dark", "auto"];
const THEME_LABEL_KEYS: Record<GeneralSettings["theme"], TranslationKey> = {
  light: "systemSettings.theme.light",
  dark: "systemSettings.theme.dark",
  auto: "systemSettings.theme.auto",
};

const TIME_FORMAT_OPTIONS: GeneralSettings["time_format"][] = ["24h", "12h"];

const DATE_FORMAT_OPTIONS: GeneralSettings["date_format"][] = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"];

const LENGTH_UNIT_OPTIONS: GeneralSettings["length_unit"][] = ["mm", "cm"];
const LENGTH_UNIT_LABEL_KEYS: Record<GeneralSettings["length_unit"], TranslationKey> = {
  mm: "systemSettings.unit.mm",
  cm: "systemSettings.unit.cm",
};

const WEIGHT_UNIT_OPTIONS: GeneralSettings["weight_unit"][] = ["kg", "lb"];
const WEIGHT_UNIT_LABEL_KEYS: Record<GeneralSettings["weight_unit"], TranslationKey> = {
  kg: "systemSettings.unit.kg",
  lb: "systemSettings.unit.lb",
};

const TIMEZONE_OPTIONS = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/Los_Angeles",
  "America/New_York",
  "UTC",
];

const LICENSE_LABELS: Record<LicenseStatus, { labelKey: TranslationKey; tone: "ok" | "warn" | "err" }> = {
  valid: { labelKey: "systemSettings.license.valid", tone: "ok" },
  expiring: { labelKey: "systemSettings.license.expiring", tone: "warn" },
  expired: { labelKey: "systemSettings.license.expired", tone: "err" },
};

const isIpLike = (value: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value.trim());
const isHostnameLike = (value: string) => /^[a-zA-Z0-9-]{1,63}$/.test(value.trim());

export default function SystemSettingsPage() {
  const { setLanguage, t } = useI18n();
  const [settings, setSettings] = useState<SystemSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; msg: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((tone: "success" | "error", msg: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ tone, msg });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getSystemSettings();
      setSettings(data);
      setLanguage(data.general.language);
      setDirty(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("systemSettings.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [setLanguage, t]);

  useEffect(() => {
    load();
  }, [load]);

  const validationIssues = useMemo(() => {
    if (!settings) return [];
    const issues: string[] = [];
    if (!isHostnameLike(settings.network.hostname)) issues.push(t("systemSettings.validation.hostname"));
    if (settings.network.mode === "static") {
      if (!isIpLike(settings.network.ip_address)) issues.push(t("systemSettings.validation.ipAddress"));
      if (!isIpLike(settings.network.netmask)) issues.push(t("systemSettings.validation.netmask"));
      if (!isIpLike(settings.network.gateway)) issues.push(t("systemSettings.validation.gateway"));
    }
    if (settings.network.dns_primary && !isIpLike(settings.network.dns_primary)) issues.push(t("systemSettings.validation.dnsPrimary"));
    if (settings.network.dns_secondary && !isIpLike(settings.network.dns_secondary)) issues.push(t("systemSettings.validation.dnsSecondary"));
    if (settings.time.ntp_enabled && !settings.time.ntp_server.trim()) issues.push(t("systemSettings.validation.ntpServer"));
    return issues;
  }, [settings, t]);

  const mutate = (updater: (current: SystemSettingsSnapshot) => SystemSettingsSnapshot) => {
    setSettings((current) => (current ? updater(current) : current));
    setDirty(true);
  };

  const updateGeneral = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => {
    mutate((current) => ({ ...current, general: { ...current.general, [key]: value } }));
  };
  const handleLanguageChange = (value: GeneralSettings["language"]) => {
    setLanguage(value);
    updateGeneral("language", value);
  };
  const updateTime = <K extends keyof TimeSettings>(key: K, value: TimeSettings[K]) => {
    mutate((current) => ({ ...current, time: { ...current.time, [key]: value } }));
  };
  const updateNetwork = <K extends keyof NetworkSettings>(key: K, value: NetworkSettings[K]) => {
    mutate((current) => ({ ...current, network: { ...current.network, [key]: value } }));
  };
  const handleSave = async () => {
    if (!settings || validationIssues.length > 0) return;
    setSaving(true);
    try {
      const updated = await updateSystemSettings(settings);
      setSettings(updated);
      setLanguage(updated.general.language);
      setDirty(false);
      showToast("success", t("systemSettings.noticeSaved"));
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("systemSettings.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(t("systemSettings.confirmReset"))) return;
    setSaving(true);
    try {
      const next = await resetSystemSettings();
      setSettings(next);
      setLanguage(next.general.language);
      setDirty(false);
      showToast("success", t("systemSettings.noticeReset"));
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("systemSettings.errorReset"));
    } finally {
      setSaving(false);
    }
  };

  const handleSyncTime = async () => {
    setSyncing(true);
    try {
      const result = await syncSystemTime();
      showToast("success", t("systemSettings.timeSync.notice", { server: result.server, drift: result.drift_ms.toFixed(1) }));
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("systemSettings.errorSyncTime"));
    } finally {
      setSyncing(false);
    }
  };

  if (loading || !settings) {
    return (
      <ServiceModeShell currentRoute="/service/settings/system-settings" footerStatus={{ label: "IDLE", tone: "idle" }}>
        <section className="flex h-full items-center justify-center bg-[#F8FBFF]">
          <div className="flex items-center gap-3 text-[13px] font-bold text-[#7B92A8]">
            <RefreshCw size={16} className="animate-spin text-[#4D94FF]" />
            {loadError ?? t("systemSettings.loading")}
          </div>
        </section>
      </ServiceModeShell>
    );
  }

  const license = LICENSE_LABELS[settings.about.license_status];

  return (
    <ServiceModeShell currentRoute="/service/settings/system-settings" footerStatus={{ label: dirty ? "EDIT" : "IDLE", tone: dirty ? "active" : "idle" }}>
      <section className="relative flex h-full min-h-0 flex-col bg-[#F8FBFF]">
        <div className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-[#E2EBF5] bg-white px-5">
          <div className="min-w-0">
            <div className="truncate text-[16px] font-black leading-tight text-[#1E293B]">{t("systemSettings.title")}</div>
            <div className="mt-1 truncate text-[12px] text-[#7B92A8]">{t("systemSettings.subtitle")}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {validationIssues[0] ? (
              <StatusMessage text={validationIssues[0]} title={validationIssues.join("; ")} count={validationIssues.length} />
            ) : null}
            <HeaderButton icon={RefreshCw} label={t("common.refresh")} onClick={load} disabled={saving} />
            <HeaderButton icon={RotateCcw} label={t("common.default")} onClick={handleReset} disabled={saving} />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty || validationIssues.length > 0}
              className="flex h-9 items-center gap-1.5 rounded-md bg-[#1D4ED8] px-4 text-[12px] font-bold text-white hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={14} /> {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>

        {toast && (
          <div
            role="status"
            className={`pointer-events-none absolute right-5 top-[68px] z-30 flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-bold shadow-lg ${
              toast.tone === "success"
                ? "border-[#C8E6C9] bg-[#E8F5E9] text-[#1B5E20]"
                : "border-[#FFCDD2] bg-[#FFEBEE] text-[#C62828]"
            }`}
          >
            {toast.tone === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            <span>{toast.msg}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
          <div className="grid gap-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title={t("systemSettings.panelGeneral")} icon={Sliders}>
              <div className="grid grid-cols-2 gap-2.5">
                <SelectField label={t("systemSettings.language")} value={settings.general.language} onChange={(v) => handleLanguageChange(v as GeneralSettings["language"])}>
                  {LANGUAGE_OPTIONS.map((value) => <option key={value} value={value}>{t(LANGUAGE_LABEL_KEYS[value])}</option>)}
                </SelectField>
                <SelectField label={t("systemSettings.theme")} value={settings.general.theme} onChange={(v) => updateGeneral("theme", v as GeneralSettings["theme"])}>
                  {THEME_OPTIONS.map((value) => <option key={value} value={value}>{t(THEME_LABEL_KEYS[value])}</option>)}
                </SelectField>
                <SelectField label={t("systemSettings.timeFormat")} value={settings.general.time_format} onChange={(v) => updateGeneral("time_format", v as GeneralSettings["time_format"])}>
                  {TIME_FORMAT_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                </SelectField>
                <SelectField label={t("systemSettings.dateFormat")} value={settings.general.date_format} onChange={(v) => updateGeneral("date_format", v as GeneralSettings["date_format"])}>
                  {DATE_FORMAT_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                </SelectField>
                <SelectField label={t("systemSettings.lengthUnit")} value={settings.general.length_unit} onChange={(v) => updateGeneral("length_unit", v as GeneralSettings["length_unit"])}>
                  {LENGTH_UNIT_OPTIONS.map((value) => <option key={value} value={value}>{t(LENGTH_UNIT_LABEL_KEYS[value])}</option>)}
                </SelectField>
                <SelectField label={t("systemSettings.weightUnit")} value={settings.general.weight_unit} onChange={(v) => updateGeneral("weight_unit", v as GeneralSettings["weight_unit"])}>
                  {WEIGHT_UNIT_OPTIONS.map((value) => <option key={value} value={value}>{t(WEIGHT_UNIT_LABEL_KEYS[value])}</option>)}
                </SelectField>
              </div>
            </Panel>

            <Panel
              title={t("systemSettings.panelTime")}
              icon={Clock}
              action={
                <button
                  type="button"
                  onClick={handleSyncTime}
                  disabled={syncing || !settings.time.ntp_enabled}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-[#EAF3FF] px-3 text-[12px] font-bold text-[#1D4ED8] hover:bg-[#DCEBFF] disabled:opacity-40"
                >
                  <Timer size={14} /> {syncing ? t("systemSettings.syncing") : t("systemSettings.syncNow")}
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-2.5">
                <SelectField label={t("systemSettings.timezone")} value={settings.time.timezone} onChange={(v) => updateTime("timezone", v)}>
                  {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </SelectField>
                <NumberField label={t("systemSettings.syncInterval")} value={settings.time.sync_interval_min} min={5} max={1440} onChange={(v) => updateTime("sync_interval_min", v)} />
                <TextField label={t("systemSettings.time.ntpServer")} value={settings.time.ntp_server} onChange={(v) => updateTime("ntp_server", v)} mono />
                <TextField label={t("systemSettings.time.ntpFallback")} value={settings.time.ntp_fallback} onChange={(v) => updateTime("ntp_fallback", v)} mono />
                <div className="col-span-2">
                  <SwitchRow label={t("systemSettings.time.ntpAuto")} checked={settings.time.ntp_enabled} onChange={(v) => updateTime("ntp_enabled", v)} />
                </div>
              </div>
            </Panel>

            <Panel title={t("systemSettings.panelNetwork")} icon={Network}>
              <div className="grid grid-cols-2 gap-2.5">
                <TextField label={t("systemSettings.network.hostname")} value={settings.network.hostname} onChange={(v) => updateNetwork("hostname", v)} mono maxLength={63} />
                <SelectField label={t("systemSettings.ipMode")} value={settings.network.mode} onChange={(v) => updateNetwork("mode", v as NetworkSettings["mode"])}>
                  <option value="dhcp">{t("systemSettings.network.dhcp")}</option>
                  <option value="static">{t("systemSettings.network.static")}</option>
                </SelectField>
                <TextField label={t("systemSettings.network.ipAddress")} value={settings.network.ip_address} onChange={(v) => updateNetwork("ip_address", v)} mono disabled={settings.network.mode === "dhcp"} />
                <TextField label={t("systemSettings.network.netmask")} value={settings.network.netmask} onChange={(v) => updateNetwork("netmask", v)} mono disabled={settings.network.mode === "dhcp"} />
                <TextField label={t("systemSettings.network.gateway")} value={settings.network.gateway} onChange={(v) => updateNetwork("gateway", v)} mono disabled={settings.network.mode === "dhcp"} />
                <TextField label={t("systemSettings.network.dnsPrimary")} value={settings.network.dns_primary} onChange={(v) => updateNetwork("dns_primary", v)} mono />
                <TextField label={t("systemSettings.network.dnsSecondary")} value={settings.network.dns_secondary} onChange={(v) => updateNetwork("dns_secondary", v)} mono />
                <TextField label={t("systemSettings.network.proxyUrl")} value={settings.network.proxy_url} onChange={(v) => updateNetwork("proxy_url", v)} mono disabled={!settings.network.proxy_enabled} />
                <div className="col-span-2">
                  <SwitchRow label={t("systemSettings.network.proxyEnabled")} checked={settings.network.proxy_enabled} onChange={(v) => updateNetwork("proxy_enabled", v)} />
                </div>
              </div>
            </Panel>

            <Panel title={t("systemSettings.panelAbout")} icon={Info}>
              <div className="flex flex-col gap-2 text-[12px]">
                <ReadRow icon={Cpu} label={t("systemSettings.about.deviceModel")} value={settings.about.device_model} />
                <ReadRow icon={Cpu} label={t("systemSettings.about.serialNumber")} value={settings.about.serial_number} mono />
                <ReadRow icon={Globe2} label={t("systemSettings.about.softwareVersion")} value={settings.about.software_version} mono />
                <ReadRow icon={Globe2} label={t("systemSettings.about.firmwareVersion")} value={settings.about.firmware_version} mono />
                <div className="flex h-9 items-center justify-between rounded-md bg-[#F8FAFC] px-3">
                  <span className="text-[11px] font-bold text-[#64748B]">{t("systemSettings.about.license")}</span>
                  <div className="flex items-center gap-2">
                    <LicenseBadge tone={license.tone}>{t(license.labelKey)}</LicenseBadge>
                    <span className="font-mono text-[12px] font-bold text-[#334155]">
                      {settings.about.license_expires_at ?? "--"}
                    </span>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </section>
    </ServiceModeShell>
  );
}

function HeaderButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 items-center gap-1.5 rounded-md border border-[#D1DCEB] bg-white px-3 text-[12px] font-bold text-[#4F6479] hover:bg-[#F5F8FC] disabled:opacity-40"
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function StatusMessage({ text, title, count }: { text: string; title?: string; count?: number }) {
  return (
    <span
      className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-[#FED7AA] bg-[#FFF7ED] px-2 text-[12px] font-bold text-[#D97706]"
      title={title ?? text}
    >
      <AlertTriangle size={14} />
      {count && count > 1 ? <span className="font-mono">{count}</span> : null}
    </span>
  );
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-md border border-[#D8E4F2] bg-white shadow-sm">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#EEF2F7] px-3">
        <h2 className="flex items-center gap-2 text-[12px] font-black text-[#334155]">
          <Icon size={15} className="text-[#1D4ED8]" />
          {title}
        </h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  mono,
  maxLength,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[10px] font-bold text-[#7B92A8]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        disabled={disabled}
        className={`h-8 w-full min-w-0 rounded-md border border-[#D6E2EF] bg-[#F8FAFC] px-2 text-[12px] font-bold text-[#1E293B] outline-none focus:border-[#4D94FF] focus:bg-white disabled:cursor-not-allowed disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[10px] font-bold text-[#7B92A8]">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : min}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        className="h-8 w-full min-w-0 rounded-md border border-[#D6E2EF] bg-[#F8FAFC] px-2 text-right text-[12px] font-bold text-[#1E293B] outline-none focus:border-[#4D94FF] focus:bg-white"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[10px] font-bold text-[#7B92A8]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full min-w-0 rounded-md border border-[#D6E2EF] bg-[#F8FAFC] px-2 text-[12px] font-bold text-[#1E293B] outline-none focus:border-[#4D94FF] focus:bg-white"
      >
        {children}
      </select>
    </label>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex h-8 min-w-0 items-center justify-between gap-3 rounded-md bg-[#F8FAFC] px-2">
      <span className="truncate text-[12px] font-bold text-[#334155]">{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-[#2563EB]" : "bg-[#CBD5E1]"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

function ReadRow({ icon: Icon, label, value, mono }: { icon: LucideIcon; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex h-9 items-center justify-between rounded-md bg-[#F8FAFC] px-3">
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#64748B]">
        <Icon size={13} /> {label}
      </span>
      <span className={`text-[12px] font-bold text-[#334155] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function LicenseBadge({ tone, children }: { tone: "ok" | "warn" | "err"; children: ReactNode }) {
  const className = {
    ok: "bg-[#DCFCE7] text-[#16803C]",
    warn: "bg-[#FEF3C7] text-[#B45309]",
    err: "bg-[#FEE2E2] text-[#DC2626]",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${className}`}>{children}</span>;
}
