import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

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

const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  adult: "成人",
  pediatric: "儿童",
  infant: "婴幼儿",
};

const THRESHOLD_OPTIONS: { value: ThresholdAction; label: string; desc: string }[] = [
  { value: "log_only", label: "仅记录", desc: "超阈值时静默记入剂量日志，不打断流程" },
  { value: "warn", label: "弹窗警告", desc: "扫描确认页给出黄色提醒，技师可点击继续" },
  { value: "require_confirm", label: "强制二次确认", desc: "必须再次点击确认风险才能继续扫描" },
];

const NOISE_LEVEL_OPTIONS: { value: NoiseLevel; label: string; desc: string }[] = [
  { value: "low", label: "低", desc: "低噪声容忍，剂量较高、图像最清晰" },
  { value: "medium", label: "中", desc: "平衡剂量与图像质量（推荐）" },
  { value: "high", label: "高", desc: "高噪声容忍，剂量最低、噪声较多" },
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
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

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
      setDrlError("存在重复的（部位 × 人群）组合，请删除或修改后再保存");
    } else {
      setDrlError(null);
    }
  }, [drlDuplicates]);

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
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchAll();
  };

  if (loading || !settings) {
    return (
      <ServiceModeShell currentRoute="/service/dose/settings" footerStatus={{ label: "IDLE", tone: "idle" }}>
        <section className="flex-1 flex items-center justify-center">
          <div className="text-[14px] text-[#90A4AE]">{error ?? "加载剂量设置…"}</div>
        </section>
      </ServiceModeShell>
    );
  }

  const showSaved = !dirty && savedAt && Date.now() - savedAt < 5000;

  return (
    <ServiceModeShell currentRoute="/service/dose/settings" footerStatus={{ label: "IDLE", tone: "idle" }}>
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar">
        {/* 标题 + 操作行 */}
        <div className="flex items-start justify-between px-5 pt-4 pb-4">
          <div>
            <div className="text-[16px] font-black text-[#1E293B]">剂量设置</div>
            <div className="mt-0.5 text-[12px] text-[#94A3B8]">系统级剂量参考、阈值策略、DOM 默认值与合规配置</div>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#D32F2F]">
                <AlertTriangle size={14} /> {error}
              </span>
            )}
            {showSaved && (
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#16A34A]">
                <CheckCircle2 size={14} /> 已保存
              </span>
            )}
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md border border-[#D1D5DB] bg-white px-4 py-2 text-[13px] font-bold text-[#4F6479] hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40"
            >
              <RotateCcw size={14} /> 撤销修改
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty || drlDuplicates.size > 0}
              className="flex items-center gap-1.5 rounded-md bg-[#1D4ED8] px-5 py-2 text-[13px] font-bold text-white hover:bg-[#1e40af] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={14} /> {saving ? "保存中…" : "保存设置"}
            </button>
          </div>
        </div>

        <Divider />

        {/* ── ① 协议剂量参考默认值 ── */}
        <SectionLabel
          title="协议剂量参考默认值"
          hint="按部位 × 人群预设的代表性 CTDIvol / DLP 值；新建协议时可一键应用作为起点"
        />
        <div className="px-5 pb-5">
          {/* 表头 */}
          <div className="grid grid-cols-[120px_160px_1fr_1fr_56px] items-center gap-4 border-b border-[#E2E8F0] px-2 pb-2 text-[11px] font-black uppercase tracking-wider text-[#94A3B8]">
            <div>人群</div>
            <div>部位</div>
            <div className="text-right">CTDIvol <span className="font-normal normal-case text-[#B0C4DE]">mGy</span></div>
            <div className="text-right">DLP <span className="font-normal normal-case text-[#B0C4DE]">mGy·cm</span></div>
            <div></div>
          </div>
          {/* 行 */}
          {drlRows.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[#94A3B8]">
              暂无剂量参考条目，点击下方"添加行"开始配置
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
                    <option value="adult">{AGE_GROUP_LABELS.adult}</option>
                    <option value="pediatric">{AGE_GROUP_LABELS.pediatric}</option>
                    <option value="infant">{AGE_GROUP_LABELS.infant}</option>
                  </BareSelect>
                  <BareSelect
                    value={row.body_part}
                    onChange={(v) => updateDrlRow(row._key, { body_part: v })}
                  >
                    {BODY_PARTS.map((p) => (
                      <option key={p} value={p}>{p}</option>
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
                    title="删除此条目"
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
              <Plus size={13} /> 添加行
            </button>
            {drlError && (
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#EF6C00]">
                <AlertTriangle size={13} /> {drlError}
              </span>
            )}
          </div>
        </div>

          <Divider />

          {/* ── ② 通知阈值策略 ── */}
          <SectionLabel
            title="通知阈值策略"
            hint="扫描实测剂量超过协议阈值时的全局响应方式；具体阈值在各协议详情页配置"
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
                    {opt.label}
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-[#64748B]">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <Divider />

          {/* ── ③ DOM 三轴电流调制 ── */}
          <SectionLabel
            title="DOM 三轴电流调制"
            hint="基于 XYZ 三轴调制管电流，默认噪声等级控制图像质量与剂量平衡"
          />
          <div className="divide-y divide-[#F1F5F9]">
            <SettingRow label="启用 DOM（默认）" desc="新建协议时默认启用 DOM；技师在协议页仍可单独关闭">
              <Toggle checked={settings.dom_enabled} onChange={(v) => updateSettings("dom_enabled", v)} />
            </SettingRow>
            <div className={`px-5 pt-4 pb-5 ${!settings.dom_enabled ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="mb-2 text-[12px] font-bold text-[#475569]">默认噪声等级</div>
              <div className="text-[11px] text-[#94A3B8] mb-3">"低"图像最清晰、剂量较高；"高"剂量最低、噪声较多</div>
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
                      {opt.label}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-[#64748B]">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Divider />

          {/* ── ④ 合规与审计 ── */}
          <SectionLabel
            title="合规与审计"
            hint="剂量日志记录策略；DoseLog 自动记录始终开启，无法关闭"
          />
          <div className="divide-y divide-[#F1F5F9]">
            <div className="flex items-center justify-between px-5 py-4 bg-[#F8FAFC]">
              <div>
                <div className="text-[14px] font-bold text-[#223547]">剂量日志自动记录</div>
                <div className="mt-0.5 text-[12px] text-[#7B92A8]">每次扫描自动写入 DoseLog（系统强制开启）</div>
              </div>
              <div className="ml-6 flex items-center gap-1.5 text-[12px] font-bold text-[#16A34A]">
                <CheckCircle2 size={14} /> 始终开启
              </div>
            </div>
            <SettingRow
              label="超阈值时写入审计日志"
              desc="扫描预估剂量超过阈值时，同时在审计日志中留痕（合规追踪用）"
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

// 平板友好的"无框"输入控件 —— 浅灰底色代替边框，focus 时显示蓝色 ring
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
