import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  RefreshCw,
  RotateCcw,
  Save,
  type LucideIcon,
} from "lucide-react";

import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import ServiceModeShell from "../shared/ServiceModeShell";
import {
  getOrganizationInfo,
  resetOrganizationInfo,
  updateOrganizationInfo,
  type InstitutionInfo,
  type OrganizationInfoSnapshot,
  type ReportDisplay,
} from "../../../lib/organizationInfoApi";

const INSTITUTION_TYPE_LABEL_KEYS: Record<InstitutionInfo["type"], TranslationKey> = {
  hospital: "service.organization.type.hospital",
  clinic: "service.organization.type.clinic",
  imaging_center: "service.organization.type.imagingCenter",
  research: "service.organization.type.research",
  other: "service.organization.type.other",
};

const URL_RE = /^(https?:\/\/)?[^\s]+\.[^\s]+$/;

export default function OrganizationInfoPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<OrganizationInfoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; msg: string } | null>(null);
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
      const data = await getOrganizationInfo();
      setSettings(data);
      setDirty(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("service.organization.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const validationIssues = useMemo(() => {
    if (!settings) return [];
    const issues: string[] = [];
    if (!settings.institution.name.trim()) issues.push(t("service.organization.validation.nameRequired"));
    if (settings.institution.website && !URL_RE.test(settings.institution.website)) issues.push(t("service.organization.validation.website"));
    return issues;
  }, [settings, t]);

  const mutate = (updater: (current: OrganizationInfoSnapshot) => OrganizationInfoSnapshot) => {
    setSettings((current) => (current ? updater(current) : current));
    setDirty(true);
  };

  const updateInstitution = <K extends keyof InstitutionInfo>(key: K, value: InstitutionInfo[K]) => {
    mutate((current) => ({ ...current, institution: { ...current.institution, [key]: value } }));
  };
  const updateReport = <K extends keyof ReportDisplay>(key: K, value: ReportDisplay[K]) => {
    mutate((current) => ({ ...current, report: { ...current.report, [key]: value } }));
  };

  const handleSave = async () => {
    if (!settings || validationIssues.length > 0) return;
    setSaving(true);
    try {
      const updated = await updateOrganizationInfo(settings);
      setSettings(updated);
      setDirty(false);
      showToast("success", t("service.organization.noticeSaved"));
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("service.organization.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(t("service.organization.confirmReset"))) return;
    setSaving(true);
    try {
      const next = await resetOrganizationInfo();
      setSettings(next);
      setDirty(false);
      showToast("success", t("service.organization.noticeReset"));
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("service.organization.errorReset"));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <ServiceModeShell currentRoute="/service/settings/organization-info">
        <section className="flex h-full items-center justify-center bg-[#F8FBFF]">
          <div className="flex items-center gap-3 text-[13px] font-bold text-[#7B92A8]">
            <RefreshCw size={16} className="animate-spin text-[#4D94FF]" />
            {loadError ?? t("service.organization.loading")}
          </div>
        </section>
      </ServiceModeShell>
    );
  }

  return (
    <ServiceModeShell currentRoute="/service/settings/organization-info">
      <section className="relative flex h-full min-h-0 flex-col bg-[#F8FBFF]">
        <div className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-[#E2EBF5] bg-white px-5">
          <div className="min-w-0">
            <div className="truncate text-[16px] font-black leading-tight text-[#1E293B]">{t("service.organization.title")}</div>
            <div className="mt-1 truncate text-[12px] text-[#7B92A8]">{t("service.organization.subtitle")}</div>
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
            <Panel title={t("service.organization.institution")} icon={Building2}>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <TextField label={t("service.organization.institutionName")} value={settings.institution.name} onChange={(v) => updateInstitution("name", v)} maxLength={120} />
                </div>
                <TextField label={t("service.organization.institutionShortName")} value={settings.institution.short_name} onChange={(v) => updateInstitution("short_name", v)} maxLength={60} />
                <TextField label={t("service.organization.institutionCode")} value={settings.institution.code} onChange={(v) => updateInstitution("code", v)} maxLength={40} mono />
                <SelectField label={t("service.organization.institutionType")} value={settings.institution.type} onChange={(v) => updateInstitution("type", v as InstitutionInfo["type"])}>
                  {(Object.entries(INSTITUTION_TYPE_LABEL_KEYS) as [InstitutionInfo["type"], TranslationKey][]).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
                </SelectField>
                <TextField label={t("service.organization.licenseNumber")} value={settings.institution.license_number} onChange={(v) => updateInstitution("license_number", v)} maxLength={80} mono />
                <div className="col-span-2">
                  <TextField label={t("service.organization.website")} value={settings.institution.website} onChange={(v) => updateInstitution("website", v)} maxLength={255} mono />
                </div>
                <TextField label={t("service.organization.logoPath")} value={settings.institution.logo_url} onChange={(v) => updateInstitution("logo_url", v)} maxLength={512} mono />
                <TextField label={t("service.organization.stampPath")} value={settings.institution.stamp_url} onChange={(v) => updateInstitution("stamp_url", v)} maxLength={512} mono />
              </div>
            </Panel>

            <Panel title={t("service.organization.report")} icon={FileText}>
              <div className="grid gap-2.5">
                <TextField label={t("service.organization.reportHeader")} value={settings.report.header_text} onChange={(v) => updateReport("header_text", v)} maxLength={160} />
                <TextField label={t("service.organization.reportFooter")} value={settings.report.footer_text} onChange={(v) => updateReport("footer_text", v)} maxLength={160} />
                <div className="mt-0.5 border-t border-[#E8EEF6] pt-2.5">
                  <TextField label={t("service.organization.reportConfidential")} value={settings.report.confidential_label} onChange={(v) => updateReport("confidential_label", v)} maxLength={40} />
                  <div className="mt-2.5 overflow-hidden rounded-md border border-[#DCE6F2] bg-[#F8FAFC]">
                    <DisplayOption label={t("service.organization.showLogo")} checked={settings.report.show_logo} onChange={(v) => updateReport("show_logo", v)} />
                    <DisplayOption label={t("service.organization.showStamp")} checked={settings.report.show_stamp} onChange={(v) => updateReport("show_stamp", v)} />
                    <DisplayOption label={t("service.organization.showQrCode")} checked={settings.report.show_qr_code} onChange={(v) => updateReport("show_qr_code", v)} />
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

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-md border border-[#D8E4F2] bg-white shadow-sm">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#EEF2F7] px-3">
        <h2 className="flex items-center gap-2 text-[12px] font-black text-[#334155]">
          <Icon size={15} className="text-[#1D4ED8]" />
          {title}
        </h2>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[10px] font-bold text-[#7B92A8]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        className={`h-8 w-full min-w-0 rounded-md border border-[#D6E2EF] bg-[#F8FAFC] px-2 text-[12px] font-bold text-[#1E293B] outline-none focus:border-[#4D94FF] focus:bg-white ${mono ? "font-mono" : ""}`}
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

function DisplayOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex h-9 min-w-0 items-center justify-between gap-3 border-b border-[#E3EAF3] px-2.5 last:border-b-0">
      <span className="truncate text-[12px] font-bold text-[#40566D]">{label}</span>
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
