import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Server,
  Trash2,
  Wifi,
  type LucideIcon,
} from "lucide-react";

import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import ServiceModeShell from "../shared/ServiceModeShell";
import {
  getDicomSettings,
  resetDicomSettings,
  testDicomNode,
  updateDicomSettings,
  type DicomLocalSettings,
  type DicomNodeRole,
  type DicomNodeStatus,
  type DicomRemoteNode,
  type DicomRoutingSettings,
  type DicomSettingsSnapshot,
} from "../../../lib/dicomSettingsApi";

const ROLE_LABEL_KEYS: Record<DicomNodeRole, TranslationKey> = {
  archive: "service.dicom.role.archive",
  storage: "service.dicom.role.storage",
  worklist: "service.dicom.role.worklist",
  printer: "service.dicom.role.printer",
};

const STATUS_LABEL_KEYS: Record<DicomNodeStatus, TranslationKey> = {
  unknown: "service.dicom.status.unknown",
  online: "service.dicom.status.online",
  offline: "service.dicom.status.offline",
};

const makeNodeId = () => `node-${Date.now().toString(36)}`;

const createBlankNode = (name: string): DicomRemoteNode => ({
  id: makeNodeId(),
  name,
  ae_title: "REMOTE_AE",
  host: "127.0.0.1",
  port: 104,
  role: "archive",
  enabled: true,
  tls: false,
  description: "",
  last_status: "unknown",
  last_checked_at: null,
});

const formatDateTime = (value: string | null | undefined, locale: string) => {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export default function DicomSettingsPage() {
  const { locale, t } = useI18n();
  const [settings, setSettings] = useState<DicomSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await getDicomSettings();
      setSettings(data);
      setSelectedNodeId(data.nodes[0]?.id ?? null);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.dicom.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const selectedNode = useMemo(
    () => settings?.nodes.find((node) => node.id === selectedNodeId) ?? settings?.nodes[0] ?? null,
    [settings, selectedNodeId],
  );

  const validationIssues = useMemo(() => {
    if (!settings) return [];
    const issues: string[] = [];
    const fallbackName = t("service.dicom.remoteNodeFallback");

    if (!settings.local.ae_title.trim()) issues.push(t("service.dicom.validation.localAeRequired"));
    if (settings.local.ae_title.trim().length > 16) issues.push(t("service.dicom.validation.localAeLength"));

    const seen = new Set<string>();
    for (const node of settings.nodes) {
      const nodeName = node.name || fallbackName;
      if (!node.name.trim()) issues.push(t("service.dicom.validation.nodeNameRequired"));
      if (!node.ae_title.trim()) issues.push(t("service.dicom.validation.nodeAeRequired", { name: nodeName }));
      if (node.ae_title.trim().length > 16) issues.push(t("service.dicom.validation.nodeAeLength", { name: nodeName }));
      if (!node.host.trim()) issues.push(t("service.dicom.validation.nodeHostRequired", { name: nodeName }));
      if (seen.has(node.id)) issues.push(t("service.dicom.validation.nodeDuplicateId"));
      seen.add(node.id);
    }

    if (settings.routing.default_destination_id && !settings.nodes.some((node) => node.id === settings.routing.default_destination_id)) {
      issues.push(t("service.dicom.validation.defaultDestination"));
    }

    return issues;
  }, [settings, t]);

  const mutateSettings = (updater: (current: DicomSettingsSnapshot) => DicomSettingsSnapshot) => {
    setSettings((current) => {
      if (!current) return current;
      return updater(current);
    });
    setDirty(true);
    setNotice(null);
  };

  const updateLocal = <K extends keyof DicomLocalSettings>(key: K, value: DicomLocalSettings[K]) => {
    mutateSettings((current) => ({ ...current, local: { ...current.local, [key]: value } }));
  };

  const updateRouting = <K extends keyof DicomRoutingSettings>(key: K, value: DicomRoutingSettings[K]) => {
    mutateSettings((current) => ({ ...current, routing: { ...current.routing, [key]: value } }));
  };

  const updateNode = <K extends keyof DicomRemoteNode>(nodeId: string, key: K, value: DicomRemoteNode[K]) => {
    mutateSettings((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, [key]: value } : node)),
    }));
  };

  const handleAddNode = () => {
    const node = createBlankNode(t("service.dicom.newNode"));
    mutateSettings((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      routing: current.routing.default_destination_id
        ? current.routing
        : { ...current.routing, default_destination_id: node.id },
    }));
    setSelectedNodeId(node.id);
  };

  const handleRemoveNode = (nodeId: string) => {
    mutateSettings((current) => {
      const nextNodes = current.nodes.filter((node) => node.id !== nodeId);
      const defaultRemoved = current.routing.default_destination_id === nodeId;
      return {
        ...current,
        nodes: nextNodes,
        routing: {
          ...current.routing,
          default_destination_id: defaultRemoved ? nextNodes[0]?.id ?? null : current.routing.default_destination_id,
        },
      };
    });
    setSelectedNodeId((current) => (current === nodeId ? null : current));
  };

  const handleTestNode = async (node: DicomRemoteNode) => {
    setTestingNodeId(node.id);
    setError(null);
    try {
      const result = await testDicomNode(node);
      mutateSettings((current) => ({
        ...current,
        nodes: current.nodes.map((item) =>
          item.id === node.id
            ? { ...item, last_status: result.status, last_checked_at: result.checked_at }
            : item,
        ),
      }));
      const resultLabel = result.ok ? t("service.dicom.noticeReachable") : t("service.dicom.noticeTestFailed");
      setNotice(`${node.name}: ${resultLabel}${result.latency_ms ? `, ${result.latency_ms} ms` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.dicom.errorTest"));
    } finally {
      setTestingNodeId(null);
    }
  };

  const handleSave = async () => {
    if (!settings || validationIssues.length > 0) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateDicomSettings(settings);
      setSettings(updated);
      setDirty(false);
      setNotice(t("service.dicom.noticeSaved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.dicom.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(t("service.dicom.confirmReset"))) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await resetDicomSettings();
      setSettings(next);
      setSelectedNodeId(next.nodes[0]?.id ?? null);
      setDirty(false);
      setNotice(t("service.dicom.noticeReset"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.dicom.errorReset"));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <ServiceModeShell currentRoute="/service/settings/dicom" footerStatus={{ label: "IDLE", tone: "idle" }}>
        <section className="flex h-full items-center justify-center bg-[#F8FBFF]">
          <div className="flex items-center gap-3 text-[13px] font-bold text-[#7B92A8]">
            <RefreshCw size={16} className="animate-spin text-[#4D94FF]" />
            {error ?? t("service.dicom.loading")}
          </div>
        </section>
      </ServiceModeShell>
    );
  }

  return (
    <ServiceModeShell currentRoute="/service/settings/dicom" footerStatus={{ label: dirty ? "EDIT" : "IDLE", tone: dirty ? "active" : "idle" }}>
      <section className="flex h-full min-h-0 flex-col bg-[#F8FBFF]">
        <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-[#E2EBF5] bg-white px-5">
          <div>
            <div className="text-[16px] font-black leading-tight text-[#1E293B]">DICOM</div>
            <div className="mt-1 text-[12px] text-[#7B92A8]">{t("service.dicom.subtitle")}</div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {validationIssues[0] ? (
              <StatusMessage tone="warning" text={validationIssues[0]} title={validationIssues.join("; ")} />
            ) : notice ? (
              <StatusMessage tone="success" text={notice} />
            ) : error ? (
              <StatusMessage tone="error" text={error} />
            ) : null}
            <HeaderButton icon={RefreshCw} label={t("common.refresh")} onClick={loadSettings} disabled={saving} />
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

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
          <div className="grid min-h-[500px] grid-rows-[112px_236px_172px] gap-3">
            <div className="min-w-0">
              <Panel
                title={t("service.dicom.localService")}
                icon={Server}
                action={
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[#64748B]">{t("service.dicom.receiveService")}</span>
                    <Switch checked={settings.local.receive_enabled} onChange={(value) => updateLocal("receive_enabled", value)} />
                  </div>
                }
              >
                <div className="grid grid-cols-[minmax(96px,1fr)_minmax(104px,1fr)_72px_72px_minmax(180px,2.4fr)] items-end gap-3">
                  <TextField label="AE Title" value={settings.local.ae_title} onChange={(value) => updateLocal("ae_title", value.toUpperCase())} maxLength={16} mono />
                  <TextField label={t("service.dicom.bindHost")} value={settings.local.bind_host} onChange={(value) => updateLocal("bind_host", value)} mono />
                  <NumberField label={t("service.dicom.port")} value={settings.local.port} min={1} max={65535} onChange={(value) => updateLocal("port", value)} />
                  <NumberField label={t("service.dicom.associations")} value={settings.local.max_associations} min={1} max={32} onChange={(value) => updateLocal("max_associations", value)} />
                  <TextField label={t("service.dicom.storagePath")} value={settings.local.storage_path} onChange={(value) => updateLocal("storage_path", value)} mono />
                </div>
              </Panel>
            </div>

            <div className="min-w-0">
              <Panel
                title={t("service.dicom.remoteNodes")}
                icon={DatabaseZap}
                action={<HeaderButton icon={Plus} label={t("service.dicom.add")} onClick={handleAddNode} variant="soft" />}
              >
                <div className="grid h-full min-w-0 grid-cols-[210px_minmax(0,1fr)] gap-3">
                  <div className="min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                    <div className="space-y-2">
                      {settings.nodes.map((node) => (
                        <NodeButton
                          key={node.id}
                          node={node}
                          active={selectedNode?.id === node.id}
                          onClick={() => setSelectedNodeId(node.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {selectedNode ? (
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="grid min-w-0 grid-cols-[minmax(120px,1.4fr)_minmax(120px,1.2fr)_minmax(80px,0.8fr)] gap-2">
                        <TextField label={t("service.dicom.name")} value={selectedNode.name} onChange={(value) => updateNode(selectedNode.id, "name", value)} />
                        <TextField label="AE Title" value={selectedNode.ae_title} onChange={(value) => updateNode(selectedNode.id, "ae_title", value.toUpperCase())} maxLength={16} mono />
                        <SelectField label={t("service.dicom.purpose")} value={selectedNode.role} onChange={(value) => updateNode(selectedNode.id, "role", value as DicomNodeRole)}>
                          {(Object.entries(ROLE_LABEL_KEYS) as [DicomNodeRole, TranslationKey][]).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
                        </SelectField>
                      </div>
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_88px] gap-2">
                        <TextField label={t("service.dicom.host")} value={selectedNode.host} onChange={(value) => updateNode(selectedNode.id, "host", value)} mono />
                        <NumberField label={t("service.dicom.port")} value={selectedNode.port} min={1} max={65535} onChange={(value) => updateNode(selectedNode.id, "port", value)} />
                      </div>

                      <div className="mt-auto flex h-10 items-center justify-between rounded-md bg-[#F8FAFC] px-3">
                        <div className="flex min-w-0 items-center gap-2 text-[11px] text-[#64748B]">
                          <StatusDot status={selectedNode.last_status} />
                          <span className="font-black text-[#334155]">{t(STATUS_LABEL_KEYS[selectedNode.last_status])}</span>
                          <span className="truncate">{formatDateTime(selectedNode.last_checked_at, locale)}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ToggleButton checked={selectedNode.enabled} label={selectedNode.enabled ? t("service.dicom.enabled") : t("service.dicom.disabled")} onChange={(value) => updateNode(selectedNode.id, "enabled", value)} />
                          <button
                            type="button"
                            onClick={() => handleTestNode(selectedNode)}
                            disabled={testingNodeId === selectedNode.id}
                            className="flex h-8 items-center gap-1.5 rounded-md bg-[#1D4ED8] px-3 text-[11px] font-bold text-white hover:bg-[#1E40AF] disabled:opacity-50"
                          >
                            <Wifi size={13} /> {testingNodeId === selectedNode.id ? t("service.dicom.testing") : t("service.dicom.test")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveNode(selectedNode.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-md bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA]"
                            title={t("service.dicom.deleteNode")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center rounded-md border border-dashed border-[#CBD5E1] text-[12px] font-bold text-[#94A3B8]">
                      {t("service.dicom.noRemoteNodes")}
                    </div>
                  )}
                </div>
              </Panel>
            </div>

            <Panel title={t("service.dicom.routing")} icon={Send}>
              <div className="flex h-full min-w-0 flex-col gap-2.5">
                <div className="grid grid-cols-[minmax(180px,2.2fr)_minmax(96px,1fr)_minmax(96px,1fr)] gap-2.5">
                  <SelectField
                    label={t("service.dicom.defaultDestination")}
                    value={settings.routing.default_destination_id ?? ""}
                    onChange={(value) => updateRouting("default_destination_id", value || null)}
                  >
                    <option value="">{t("service.dicom.noneSelected")}</option>
                    {settings.nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                  </SelectField>
                  <NumberField label={t("service.dicom.retryCount")} value={settings.routing.retry_count} min={0} max={10} onChange={(value) => updateRouting("retry_count", value)} />
                  <NumberField label={t("service.dicom.intervalSec")} value={settings.routing.retry_interval_sec} min={5} max={3600} onChange={(value) => updateRouting("retry_interval_sec", value)} />
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <SwitchRow label={t("service.dicom.autoSend")} checked={settings.routing.auto_send_on_scan_complete} onChange={(value) => updateRouting("auto_send_on_scan_complete", value)} />
                  <SwitchRow label={t("service.dicom.doseReport")} checked={settings.routing.include_dose_report} onChange={(value) => updateRouting("include_dose_report", value)} />
                  <SwitchRow label={t("service.dicom.localizer")} checked={settings.routing.include_localizer} onChange={(value) => updateRouting("include_localizer", value)} />
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
  variant = "plain",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "plain" | "soft";
}) {
  const className = variant === "soft"
    ? "flex h-8 items-center gap-1.5 rounded-md bg-[#EAF3FF] px-3 text-[12px] font-bold text-[#1D4ED8] hover:bg-[#DCEBFF] disabled:opacity-40"
    : "flex h-9 items-center gap-1.5 rounded-md border border-[#D1DCEB] bg-white px-3 text-[12px] font-bold text-[#4F6479] hover:bg-[#F5F8FC] disabled:opacity-40";

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
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
    <span className={`flex max-w-[220px] items-center gap-1.5 truncate text-[12px] font-bold ${className}`} title={title ?? text}>
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

function NodeButton({ node, active, onClick }: { node: DicomRemoteNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[52px] w-full items-center gap-2 rounded-md border px-3 text-left transition ${
        active ? "border-[#93C5FD] bg-[#EFF6FF]" : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"
      }`}
    >
      <StatusDot status={node.last_status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-black text-[#1E293B]">{node.name}</div>
        <div className="truncate text-[10px] font-mono text-[#7B92A8]">{node.ae_title}@{node.host}</div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${node.enabled ? "bg-[#DCFCE7] text-[#16803C]" : "bg-[#E5E7EB] text-[#64748B]"}`}>
        {node.enabled ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  maxLength,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  mono?: boolean;
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

function ToggleButton({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`h-8 min-w-[76px] rounded-md px-3 text-[12px] font-black ${
        checked ? "bg-[#1D4ED8] text-white" : "border border-[#D6E2EF] bg-white text-[#64748B]"
      }`}
    >
      {label}
    </button>
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

function StatusDot({ status }: { status: DicomNodeStatus }) {
  const className = status === "online" ? "bg-[#22C55E]" : status === "offline" ? "bg-[#EF4444]" : "bg-[#CBD5E1]";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`} />;
}
