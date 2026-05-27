import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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

const LANGUAGE_OPTIONS: Array<{ value: GeneralSettings["language"]; label: string }> = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English (US)" },
];

const THEME_OPTIONS: Array<{ value: GeneralSettings["theme"]; label: string }> = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "auto", label: "跟随系统" },
];

const TIME_FORMAT_OPTIONS: Array<{ value: GeneralSettings["time_format"]; label: string }> = [
  { value: "24h", label: "24 小时制" },
  { value: "12h", label: "12 小时制" },
];

const DATE_FORMAT_OPTIONS: Array<{ value: GeneralSettings["date_format"]; label: string }> = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
];

const LENGTH_UNIT_OPTIONS: Array<{ value: GeneralSettings["length_unit"]; label: string }> = [
  { value: "mm", label: "毫米 (mm)" },
  { value: "cm", label: "厘米 (cm)" },
];

const WEIGHT_UNIT_OPTIONS: Array<{ value: GeneralSettings["weight_unit"]; label: string }> = [
  { value: "kg", label: "千克 (kg)" },
  { value: "lb", label: "磅 (lb)" },
];

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

const LICENSE_LABELS: Record<LicenseStatus, { label: string; tone: "ok" | "warn" | "err" }> = {
  valid: { label: "有效", tone: "ok" },
  expiring: { label: "即将到期", tone: "warn" },
  expired: { label: "已过期", tone: "err" },
};

const isIpLike = (value: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value.trim());
const isHostnameLike = (value: string) => /^[a-zA-Z0-9-]{1,63}$/.test(value.trim());

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await getSystemSettings();
      setSettings(data);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "系统设置加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const validationIssues = useMemo(() => {
    if (!settings) return [];
    const issues: string[] = [];
    if (!isHostnameLike(settings.network.hostname)) issues.push("主机名只能包含字母、数字和连字符");
    if (settings.network.mode === "static") {
      if (!isIpLike(settings.network.ip_address)) issues.push("静态 IP 格式无效");
      if (!isIpLike(settings.network.netmask)) issues.push("子网掩码格式无效");
      if (!isIpLike(settings.network.gateway)) issues.push("网关格式无效");
    }
    if (settings.network.dns_primary && !isIpLike(settings.network.dns_primary)) issues.push("主 DNS 格式无效");
    if (settings.network.dns_secondary && !isIpLike(settings.network.dns_secondary)) issues.push("备用 DNS 格式无效");
    if (settings.time.ntp_enabled && !settings.time.ntp_server.trim()) issues.push("启用 NTP 后必须填写服务器地址");
    return issues;
  }, [settings]);

  const mutate = (updater: (current: SystemSettingsSnapshot) => SystemSettingsSnapshot) => {
    setSettings((current) => (current ? updater(current) : current));
    setDirty(true);
    setNotice(null);
  };

  const updateGeneral = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => {
    mutate((current) => ({ ...current, general: { ...current.general, [key]: value } }));
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
    setError(null);
    setNotice(null);
    try {
      const updated = await updateSystemSettings(settings);
      setSettings(updated);
      setDirty(false);
      setNotice("系统设置已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "系统设置保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("恢复默认系统设置？当前未保存修改将被替换。")) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await resetSystemSettings();
      setSettings(next);
      setDirty(false);
      setNotice("已恢复默认系统设置");
    } catch (e) {
      setError(e instanceof Error ? e.message : "恢复默认设置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSyncTime = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncSystemTime();
      setNotice(`时间同步：${result.server} · 漂移 ${result.drift_ms.toFixed(1)} ms`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "时间同步失败");
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
            {error ?? "正在加载系统设置..."}
          </div>
        </section>
      </ServiceModeShell>
    );
  }

  const license = LICENSE_LABELS[settings.about.license_status];

  return (
    <ServiceModeShell currentRoute="/service/settings/system-settings" footerStatus={{ label: dirty ? "EDIT" : "IDLE", tone: dirty ? "active" : "idle" }}>
      <section className="flex h-full min-h-0 flex-col bg-[#F8FBFF]">
        <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-[#E2EBF5] bg-white px-5">
          <div>
            <div className="text-[16px] font-black leading-tight text-[#1E293B]">系统设置</div>
            <div className="mt-1 text-[12px] text-[#7B92A8]">系统级参数、时间网络、设备偏好和基础配置</div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {validationIssues[0] ? (
              <StatusMessage tone="warning" text={validationIssues[0]} title={validationIssues.join("; ")} />
            ) : notice ? (
              <StatusMessage tone="success" text={notice} />
            ) : error ? (
              <StatusMessage tone="error" text={error} />
            ) : null}
            <HeaderButton icon={RefreshCw} label="刷新" onClick={load} disabled={saving} />
            <HeaderButton icon={RotateCcw} label="默认" onClick={handleReset} disabled={saving} />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty || validationIssues.length > 0}
              className="flex h-9 items-center gap-1.5 rounded-md bg-[#1D4ED8] px-4 text-[12px] font-bold text-white hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={14} /> {saving ? "保存中" : "保存"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
          <div className="grid gap-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title="常规" icon={Sliders}>
              <div className="grid grid-cols-2 gap-2.5">
                <SelectField label="语言" value={settings.general.language} onChange={(v) => updateGeneral("language", v as GeneralSettings["language"])}>
                  {LANGUAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectField>
                <SelectField label="主题" value={settings.general.theme} onChange={(v) => updateGeneral("theme", v as GeneralSettings["theme"])}>
                  {THEME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectField>
                <SelectField label="时间格式" value={settings.general.time_format} onChange={(v) => updateGeneral("time_format", v as GeneralSettings["time_format"])}>
                  {TIME_FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectField>
                <SelectField label="日期格式" value={settings.general.date_format} onChange={(v) => updateGeneral("date_format", v as GeneralSettings["date_format"])}>
                  {DATE_FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectField>
                <SelectField label="长度单位" value={settings.general.length_unit} onChange={(v) => updateGeneral("length_unit", v as GeneralSettings["length_unit"])}>
                  {LENGTH_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectField>
                <SelectField label="体重单位" value={settings.general.weight_unit} onChange={(v) => updateGeneral("weight_unit", v as GeneralSettings["weight_unit"])}>
                  {WEIGHT_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectField>
              </div>
            </Panel>

            <Panel
              title="时区与时间"
              icon={Clock}
              action={
                <button
                  type="button"
                  onClick={handleSyncTime}
                  disabled={syncing || !settings.time.ntp_enabled}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-[#EAF3FF] px-3 text-[12px] font-bold text-[#1D4ED8] hover:bg-[#DCEBFF] disabled:opacity-40"
                >
                  <Timer size={14} /> {syncing ? "同步中" : "立即同步"}
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-2.5">
                <SelectField label="时区" value={settings.time.timezone} onChange={(v) => updateTime("timezone", v)}>
                  {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </SelectField>
                <NumberField label="同步间隔(分钟)" value={settings.time.sync_interval_min} min={5} max={1440} onChange={(v) => updateTime("sync_interval_min", v)} />
                <TextField label="NTP 主服务器" value={settings.time.ntp_server} onChange={(v) => updateTime("ntp_server", v)} mono />
                <TextField label="NTP 备用服务器" value={settings.time.ntp_fallback} onChange={(v) => updateTime("ntp_fallback", v)} mono />
                <div className="col-span-2">
                  <SwitchRow label="启用 NTP 自动同步" checked={settings.time.ntp_enabled} onChange={(v) => updateTime("ntp_enabled", v)} />
                </div>
              </div>
            </Panel>

            <Panel title="网络" icon={Network}>
              <div className="grid grid-cols-2 gap-2.5">
                <TextField label="主机名" value={settings.network.hostname} onChange={(v) => updateNetwork("hostname", v)} mono maxLength={63} />
                <SelectField label="IP 模式" value={settings.network.mode} onChange={(v) => updateNetwork("mode", v as NetworkSettings["mode"])}>
                  <option value="dhcp">DHCP 自动获取</option>
                  <option value="static">静态 IP</option>
                </SelectField>
                <TextField label="IP 地址" value={settings.network.ip_address} onChange={(v) => updateNetwork("ip_address", v)} mono disabled={settings.network.mode === "dhcp"} />
                <TextField label="子网掩码" value={settings.network.netmask} onChange={(v) => updateNetwork("netmask", v)} mono disabled={settings.network.mode === "dhcp"} />
                <TextField label="默认网关" value={settings.network.gateway} onChange={(v) => updateNetwork("gateway", v)} mono disabled={settings.network.mode === "dhcp"} />
                <TextField label="主 DNS" value={settings.network.dns_primary} onChange={(v) => updateNetwork("dns_primary", v)} mono />
                <TextField label="备用 DNS" value={settings.network.dns_secondary} onChange={(v) => updateNetwork("dns_secondary", v)} mono />
                <TextField label="代理地址" value={settings.network.proxy_url} onChange={(v) => updateNetwork("proxy_url", v)} mono disabled={!settings.network.proxy_enabled} />
                <div className="col-span-2">
                  <SwitchRow label="启用 HTTP 代理" checked={settings.network.proxy_enabled} onChange={(v) => updateNetwork("proxy_enabled", v)} />
                </div>
              </div>
            </Panel>

            <Panel title="关于本机" icon={Info}>
              <div className="flex flex-col gap-2 text-[12px]">
                <ReadRow icon={Cpu} label="设备型号" value={settings.about.device_model} />
                <ReadRow icon={Cpu} label="序列号" value={settings.about.serial_number} mono />
                <ReadRow icon={Globe2} label="软件版本" value={settings.about.software_version} mono />
                <ReadRow icon={Globe2} label="固件版本" value={settings.about.firmware_version} mono />
                <div className="flex h-9 items-center justify-between rounded-md bg-[#F8FAFC] px-3">
                  <span className="text-[11px] font-bold text-[#64748B]">许可证</span>
                  <div className="flex items-center gap-2">
                    <LicenseBadge tone={license.tone}>{license.label}</LicenseBadge>
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

function StatusMessage({ tone, text, title }: { tone: "success" | "warning" | "error"; text: string; title?: string }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  const className = {
    success: "text-[#16A34A]",
    warning: "text-[#D97706]",
    error: "text-[#DC2626]",
  }[tone];
  return (
    <span className={`flex max-w-[260px] items-center gap-1.5 truncate text-[12px] font-bold ${className}`} title={title ?? text}>
      <Icon size={14} /> {text}
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
