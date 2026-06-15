import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import ServiceModeShell from "../shared/ServiceModeShell";
import {
  getDoseSettings,
  listDrlEntries,
  replaceDrlEntries,
  updateDoseSettings,
  type AgeGroup,
  type ApiDoseSettings,
  type DrlEntryInput,
  type NoiseLevel,
  type ThresholdAction,
} from "../../../lib/doseSettingsApi";

const BODY_PARTS = ["头颅", "颈部", "胸部", "腹部", "盆腔", "脊柱", "心脏", "四肢"] as const;

const BODY_PART_LABEL_KEYS: Record<(typeof BODY_PARTS)[number], TranslationKey> = {
  头颅: "service.doseSettings.bodyPart.head",
  颈部: "service.doseSettings.bodyPart.neck",
  胸部: "service.doseSettings.bodyPart.chest",
  腹部: "service.doseSettings.bodyPart.abdomen",
  盆腔: "service.doseSettings.bodyPart.pelvis",
  脊柱: "service.doseSettings.bodyPart.spine",
  心脏: "service.doseSettings.bodyPart.cardiac",
  四肢: "service.doseSettings.bodyPart.extremities",
};

const AGE_GROUP_LABEL_KEYS: Record<AgeGroup, TranslationKey> = {
  adult: "service.doseSettings.age.adult",
  pediatric: "service.doseSettings.age.pediatric",
  infant: "service.doseSettings.age.infant",
};

const THRESHOLD_OPTIONS: { value: ThresholdAction; labelKey: TranslationKey; descKey: TranslationKey }[] = [
  { value: "log_only", labelKey: "service.doseSettings.threshold.logOnly.label", descKey: "service.doseSettings.threshold.logOnly.desc" },
  { value: "warn", labelKey: "service.doseSettings.threshold.warn.label", descKey: "service.doseSettings.threshold.warn.desc" },
  { value: "require_confirm", labelKey: "service.doseSettings.threshold.requireConfirm.label", descKey: "service.doseSettings.threshold.requireConfirm.desc" },
];

const NOISE_LEVEL_OPTIONS: { value: NoiseLevel; labelKey: TranslationKey; descKey: TranslationKey }[] = [
  { value: "low", labelKey: "service.doseSettings.noise.low.label", descKey: "service.doseSettings.noise.low.desc" },
  { value: "medium", labelKey: "service.doseSettings.noise.medium.label", descKey: "service.doseSettings.noise.medium.desc" },
  { value: "high", labelKey: "service.doseSettings.noise.high.label", descKey: "service.doseSettings.noise.high.desc" },
];

type DrlRow = DrlEntryInput & { _key: string };

const makeRow = (entry: Partial<DrlEntryInput> = {}): DrlRow => ({
  body_part: entry.body_part ?? "头颅",
  age_group: entry.age_group ?? "adult",
  ctdi_ref: entry.ctdi_ref ?? 0,
  dlp_ref: entry.dlp_ref ?? 0,
  _key: Math.random().toString(36).slice(2),
});

const compareDrl = (a: DrlRow, b: DrlRow): number => {
  const aOrder: Record<AgeGroup, number> = { adult: 0, pediatric: 1, infant: 2 };
  if (a.age_group !== b.age_group) return aOrder[a.age_group] - aOrder[b.age_group];
  return a.body_part.localeCompare(b.body_part);
};

export default function ServiceDoseSettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ApiDoseSettings | null>(null);
  const [drlRows, setDrlRows] = useState<DrlRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [drlError, setDrlError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d] = await Promise.all([getDoseSettings(), listDrlEntries()]);
      setSettings(s);
      setDrlRows(d.map((e) => ({ ...e, _key: String(e.id) })));
      setDirty(false);
      setSavedAt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.doseSettings.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const updateSettings = <K extends keyof ApiDoseSettings>(key: K, value: ApiDoseSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
    setSavedAt(null);
  };

  const updateDrlRow = (key: string, patch: Partial<DrlEntryInput>) => {
    setDrlRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));
    setDirty(true);
    setSavedAt(null);
  };

  const addDrlRow = () => {
    setDrlRows((prev) => [...prev, makeRow({ age_group: "adult", body_part: "胸部" })]);
    setDirty(true);
    setSavedAt(null);
  };

  const removeDrlRow = (key: string) => {
    setDrlRows((prev) => prev.filter((r) => r._key !== key));
    setDirty(true);
    setSavedAt(null);
  };

  // Validate DRL uniqueness (body_part × age_group)
  const drlDuplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of drlRows) {
      const key = `${row.body_part}|${row.age_group}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, n]) => n > 1)
        .map(([k]) => k),
    );
  }, [drlRows]);

  useEffect(() => {
    if (drlDuplicates.size > 0) {
      setDrlError(t("service.doseSettings.drlDuplicate"));
    } else {
      setDrlError(null);
    }
  }, [drlDuplicates, t]);

  const handleSave = async () => {
    if (!settings) return;
    if (drlDuplicates.size > 0) return;
    setSaving(true);
    setError(null);
    try {
      const drlInput: DrlEntryInput[] = drlRows.map(({ body_part, age_group, ctdi_ref, dlp_ref }) => ({
        body_part,
        age_group,
        ctdi_ref,
        dlp_ref,
      }));
      const [updatedSettings, updatedDrl] = await Promise.all([
        updateDoseSettings(settings),
        replaceDrlEntries(drlInput),
      ]);
      setSettings(updatedSettings);
      setDrlRows(updatedDrl.map((e) => ({ ...e, _key: String(e.id) })).sort(compareDrl));
      setSavedAt(Date.now());
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.doseSettings.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchAll();
  };

  if (loading || !settings) {
    return (
      <ServiceModeShell currentRoute="/service/dose/settings">
        <section className="flex-1 flex items-center justify-center">
          <div className="text-[14px] text-[#90A4AE]">{error ?? t("service.doseSettings.loading")}</div>
        </section>
      </ServiceModeShell>
    );
  }

  const showSaved = !dirty && savedAt && Date.now() - savedAt < 5000;

  return (
    <ServiceModeShell currentRoute="/service/dose/settings">
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar">
        <div className="flex items-start justify-between px-5 pt-4 pb-4">
          <div>
            <div className="text-[16px] font-black text-[#1E293B]">{t("service.doseSettings.title")}</div>
            <div className="mt-0.5 text-[12px] text-[#94A3B8]">{t("service.doseSettings.subtitle")}</div>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#D32F2F]">
                <AlertTriangle size={14} /> {error}
              </span>
            )}
            {showSaved && (
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#16A34A]">
                <CheckCircle2 size={14} /> {t("service.doseSettings.saved")}
              </span>
            )}
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md border border-[#D1D5DB] bg-white px-4 py-2 text-[13px] font-bold text-[#4F6479] hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40"
            >
              <RotateCcw size={14} /> {t("service.doseSettings.undo")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty || drlDuplicates.size > 0}
              className="flex items-center gap-1.5 rounded-md bg-[#1D4ED8] px-5 py-2 text-[13px] font-bold text-white hover:bg-[#1e40af] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={14} /> {saving ? t("service.doseSettings.saving") : t("service.doseSettings.saveSettings")}
            </button>
          </div>
        </div>

        <Divider />

        <SectionLabel
          title={t("service.doseSettings.drlTitle")}
          hint={t("service.doseSettings.drlHint")}
        />
        <div className="px-5 pb-5">
          <div className="grid grid-cols-[120px_160px_1fr_1fr_56px] items-center gap-4 border-b border-[#E2E8F0] px-2 pb-2 text-[11px] font-black uppercase tracking-wider text-[#94A3B8]">
            <div>{t("service.doseSettings.population")}</div>
            <div>{t("service.doseSettings.bodyPart")}</div>
            <div className="text-right">CTDIvol <span className="font-normal normal-case text-[#B0C4DE]">mGy</span></div>
            <div className="text-right">DLP <span className="font-normal normal-case text-[#B0C4DE]">mGy·cm</span></div>
            <div></div>
          </div>
          {drlRows.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[#94A3B8]">
              {t("service.doseSettings.drlEmpty")}
            </div>
          ) : (
            [...drlRows].sort(compareDrl).map((row) => {
              const dupKey = `${row.body_part}|${row.age_group}`;
              const isDup = drlDuplicates.has(dupKey);
              return (
                <div
                  key={row._key}
                  className={`grid grid-cols-[120px_160px_1fr_1fr_56px] items-center gap-4 px-2 py-1.5 rounded hover:bg-[#F8FAFC] ${isDup ? "bg-[#FFF7ED] hover:bg-[#FFF7ED]" : ""}`}
                >
                  <BareSelect
                    value={row.age_group}
                    onChange={(v) => updateDrlRow(row._key, { age_group: v as AgeGroup })}
                  >
                    <option value="adult">{t(AGE_GROUP_LABEL_KEYS.adult)}</option>
                    <option value="pediatric">{t(AGE_GROUP_LABEL_KEYS.pediatric)}</option>
                    <option value="infant">{t(AGE_GROUP_LABEL_KEYS.infant)}</option>
                  </BareSelect>
                  <BareSelect
                    value={row.body_part}
                    onChange={(v) => updateDrlRow(row._key, { body_part: v })}
                  >
                    {BODY_PARTS.map((p) => (
                      <option key={p} value={p}>{t(BODY_PART_LABEL_KEYS[p])}</option>
                    ))}
                  </BareSelect>
                  <BareNumberInput
                    value={row.ctdi_ref}
                    onChange={(v) => updateDrlRow(row._key, { ctdi_ref: v })}
                    step={1}
                    min={0}
                  />
                  <BareNumberInput
                    value={row.dlp_ref}
                    onChange={(v) => updateDrlRow(row._key, { dlp_ref: v })}
                    step={10}
                    min={0}
                  />
                  <button
                    type="button"
                    onClick={() => removeDrlRow(row._key)}
                    className="mx-auto flex h-9 w-9 items-center justify-center rounded-md bg-transparent text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                    title={t("service.doseSettings.deleteEntry")}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })
          )}
          <div className="mt-3 flex items-center justify-between px-2">
            <button
              type="button"
              onClick={addDrlRow}
              className="flex items-center gap-1.5 rounded-md bg-transparent border border-dashed border-[#94A3B8] px-3 py-1.5 text-[12px] font-bold text-[#4F6479] hover:border-[#4D94FF] hover:text-[#4D94FF]"
            >
              <Plus size={13} /> {t("service.doseSettings.addRow")}
            </button>
            {drlError && (
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#EF6C00]">
                <AlertTriangle size={13} /> {drlError}
              </span>
            )}
          </div>
        </div>

          <Divider />

          <SectionLabel
            title={t("service.doseSettings.thresholdTitle")}
            hint={t("service.doseSettings.thresholdHint")}
          />
          <div className="px-5 pb-5 flex flex-col gap-3">
            <div className="flex gap-3">
              {THRESHOLD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSettings("threshold_action", opt.value)}
                  className={`flex-1 rounded-lg border-2 px-4 py-3 text-left transition-all ${
                    settings.threshold_action === opt.value
                      ? "border-[#2563EB] bg-[#EFF6FF]"
                      : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#93C5FD]"
                  }`}
                >
                  <div className={`text-[14px] font-black ${settings.threshold_action === opt.value ? "text-[#1D4ED8]" : "text-[#223547]"}`}>
                    {t(opt.labelKey)}
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-[#64748B]">{t(opt.descKey)}</div>
                </button>
              ))}
            </div>
          </div>

          <Divider />

          <SectionLabel
            title={t("service.doseSettings.domTitle")}
            hint={t("service.doseSettings.domHint")}
          />
          <div className="divide-y divide-[#F1F5F9]">
            <SettingRow label={t("service.doseSettings.domLabel")} desc={t("service.doseSettings.domDesc")}>
              <Toggle checked={settings.dom_enabled} onChange={(v) => updateSettings("dom_enabled", v)} />
            </SettingRow>
            <div className={`px-5 pt-4 pb-5 ${!settings.dom_enabled ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="mb-2 text-[12px] font-bold text-[#475569]">{t("service.doseSettings.defaultNoiseTitle")}</div>
              <div className="text-[11px] text-[#94A3B8] mb-3">{t("service.doseSettings.defaultNoiseHint")}</div>
              <div className="flex gap-3">
                {NOISE_LEVEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateSettings("dom_noise_level", opt.value)}
                    className={`flex-1 rounded-lg border-2 px-4 py-3 text-left transition-all ${
                      settings.dom_noise_level === opt.value
                        ? "border-[#2563EB] bg-[#EFF6FF]"
                        : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#93C5FD]"
                    }`}
                  >
                    <div className={`text-[16px] font-black ${settings.dom_noise_level === opt.value ? "text-[#1D4ED8]" : "text-[#223547]"}`}>
                      {t(opt.labelKey)}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-[#64748B]">{t(opt.descKey)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Divider />

          <SectionLabel
            title={t("service.doseSettings.complianceTitle")}
            hint={t("service.doseSettings.complianceHint")}
          />
          <div className="divide-y divide-[#F1F5F9]">
            <div className="flex items-center justify-between px-5 py-4 bg-[#F8FAFC]">
              <div>
                <div className="text-[14px] font-bold text-[#223547]">{t("service.doseSettings.autoLogLabel")}</div>
                <div className="mt-0.5 text-[12px] text-[#7B92A8]">{t("service.doseSettings.autoLogDesc")}</div>
              </div>
              <div className="ml-6 flex items-center gap-1.5 text-[12px] font-bold text-[#16A34A]">
                <CheckCircle2 size={14} /> {t("service.doseSettings.alwaysOn")}
              </div>
            </div>
            <SettingRow
              label={t("service.doseSettings.auditLabel")}
              desc={t("service.doseSettings.auditDesc")}
            >
              <Toggle
                checked={settings.audit_threshold_exceed}
                onChange={(v) => updateSettings("audit_threshold_exceed", v)}
              />
            </SettingRow>
          </div>

        <div className="h-4" />
      </section>
    </ServiceModeShell>
  );
}

// ===== Helper Components =====

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 pt-4 pb-2">
      <div className="text-[11px] font-black uppercase tracking-wider text-[#94A3B8]">{title}</div>
      {hint && <div className="mt-0.5 text-[11.5px] text-[#94A3B8]">{hint}</div>}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-[#E2E8F0]" />;
}

function SettingRow({
  label,
  desc,
  disabled,
  children,
}: {
  label: string;
  desc: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 ${disabled ? "opacity-40" : ""}`}>
      <div>
        <div className="text-[14px] font-bold text-[#223547]">{label}</div>
        <div className="mt-0.5 text-[12px] text-[#7B92A8]">{desc}</div>
      </div>
      <div className="ml-6 shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-[#2563EB]" : "bg-[#CBD5E1]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// Touch-friendly frameless input: a pale fill replaces borders until focus.
function BareSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-md border-0 bg-[#F4F7FB] px-3 text-[14px] text-[#1E293B] outline-none transition focus:bg-white focus:ring-2 focus:ring-[#4D94FF]/40"
    >
      {children}
    </select>
  );
}

function BareNumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const next = parseFloat(e.target.value);
        if (Number.isFinite(next)) onChange(next);
        else if (e.target.value === "") onChange(0);
      }}
      className="h-10 w-full rounded-md border-0 bg-[#F4F7FB] px-3 text-right text-[14px] font-mono text-[#1E293B] outline-none transition focus:bg-white focus:ring-2 focus:ring-[#4D94FF]/40"
    />
  );
}
