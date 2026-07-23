import { useEffect, useState, type ElementType } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  FileCode,
  HardDrive,
  Lock,
  RefreshCcw,
  Search,
  Share2,
  ShieldAlert,
  Trash2,
  Unlock,
} from "lucide-react";

import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import ServiceModeShell from "../shared/ServiceModeShell";
import type { DiskPartition, DiskPartitionId, ScanFile } from "./types";
import { useDiskManager } from "./useDiskManager";

type Translate = ReturnType<typeof useI18n>["t"];

type PartitionVisual = {
  color: string;
  icon: ElementType;
};

const PARTITION_VISUALS: Record<DiskPartitionId, PartitionVisual> = {
  RawData: { color: "#2F7BFF", icon: HardDrive },
  DICOM: { color: "#38A169", icon: FileCode },
  PACS: { color: "#ED8936", icon: Share2 },
  Phantom: { color: "#805AD5", icon: Database },
};

const PARTITION_LABEL_KEYS: Record<DiskPartitionId, TranslationKey> = {
  RawData: "service.disk.partition.RawData",
  DICOM: "service.disk.partition.DICOM",
  PACS: "service.disk.partition.PACS",
  Phantom: "service.disk.partition.Phantom",
};

const FILE_STATUS_LABEL_KEYS: Record<ScanFile["status"], TranslationKey> = {
  ACQUIRED: "service.disk.status.ACQUIRED",
  RESERVED: "service.disk.status.RESERVED",
  RELEASED: "service.disk.status.RELEASED",
};

const STATUS_STYLES = {
  ACQUIRED: "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]",
  RESERVED: "bg-[#E8F1FF] text-[#2F67D8] border border-[#BFD3FF]",
  RELEASED: "bg-[#E7F8EC] text-[#2F855A] border border-[#BFE3CC]",
} as const;

const getActionBlockedReason = (file: ScanFile, action: "reserve" | "release" | "purge", t: Translate) => {
  if (action === "reserve" && file.status === "RESERVED") return t("service.disk.block.alreadyReserved");
  if (action === "release" && file.status !== "RESERVED") return t("service.disk.block.notReserved");
  if ((action === "release" || action === "purge") && file.active_recon_jobs > 0) {
    return t("service.disk.block.activeReconJobs", { count: file.active_recon_jobs });
  }
  if (action === "purge" && file.status === "RESERVED") return t("service.disk.block.releaseBeforeDelete");
  return null;
};

const formatMb = (value: number) => {
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${value.toFixed(0)} MB`;
};

const formatDateTime = (value: string, locale: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const PartitionHeader = ({
  partition,
  percent,
  isExpanded,
  isOverThreshold,
  onToggle,
  onThresholdCommit,
}: {
  partition: DiskPartition;
  percent: number;
  isExpanded: boolean;
  isOverThreshold: boolean;
  onToggle: () => void;
  onThresholdCommit: (value: number) => void;
}) => {
  const { t } = useI18n();
  const [thresholdDraft, setThresholdDraft] = useState(String(partition.threshold));
  const visual = PARTITION_VISUALS[partition.id];

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThresholdDraft(String(partition.threshold));
  }, [partition.threshold]);

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ backgroundColor: visual.color }}>
        <visual.icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h3 className="text-[16px] font-black text-[#223547]">{t(PARTITION_LABEL_KEYS[partition.id])}</h3>
          <span className="text-[12px] font-medium text-[#7B92A8]">{t("service.disk.fileCount", { count: partition.files.length })}</span>
          {isOverThreshold ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF1F2] px-2 py-0.5 text-[10px] font-bold text-[#DC2626]">
              <AlertTriangle size={11} /> {t("service.disk.overThreshold")}
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-4">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF2F7]">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: visual.color }} />
          </div>
          <div className="min-w-[172px] text-[12px] font-medium text-[#6B7F93]">
            {formatMb(partition.used_mb)} / {formatMb(partition.capacity_mb)} · {percent.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-2 text-[12px] font-bold text-[#627488]">
          <span className="whitespace-nowrap">{t("service.disk.threshold")}</span>
          <input
            value={thresholdDraft}
            onChange={(event) => setThresholdDraft(event.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => {
              const next = Number(thresholdDraft || partition.threshold);
              const normalized = Math.min(100, Math.max(1, next || partition.threshold));
              setThresholdDraft(String(normalized));
              if (normalized !== partition.threshold) onThresholdCommit(normalized);
            }}
            className={`h-8 w-14 rounded-xl border px-2 text-center text-[13px] font-black outline-none ${
              isOverThreshold ? "border-[#FCA5A5] text-[#DC2626]" : "border-[#D7E3F0] text-[#223547]"
            }`}
          />
          <span className="whitespace-nowrap">%</span>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-label={isExpanded ? t("service.disk.collapsePartition") : t("service.disk.expandPartition")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D7E3F0] text-[#4F6479] transition-colors hover:bg-[#F8FAFC]"
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>
    </div>
  );
};

const PartitionSummaryCard = ({
  partition,
  percent,
  isActive,
  isOverThreshold,
  onSelect,
}: {
  partition: DiskPartition;
  percent: number;
  isActive: boolean;
  isOverThreshold: boolean;
  onSelect: () => void;
}) => {
  const { t } = useI18n();
  const visual = PARTITION_VISUALS[partition.id];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={`min-w-0 rounded-xl p-3 text-left transition-all ${
        isActive
          ? "bg-[#EAF3FF] ring-1 ring-[#A9D0FF] shadow-sm"
          : "bg-[#F6F8FC] hover:bg-[#EEF5FF]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: visual.color }}>
          <visual.icon size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-[#223547]">{t(PARTITION_LABEL_KEYS[partition.id])}</div>
          <div className="mt-0.5 text-[10px] font-medium text-[#7B92A8]">{t("service.disk.fileCount", { count: partition.files.length })}</div>
        </div>
        {isOverThreshold ? <AlertTriangle size={15} className="shrink-0 text-[#DC2626]" /> : null}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: visual.color }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-medium text-[#627488]">
        <span className="truncate">{formatMb(partition.used_mb)} / {formatMb(partition.capacity_mb)}</span>
        <span className="shrink-0 font-bold text-[#31485E]">{percent.toFixed(1)}%</span>
      </div>
    </button>
  );
};

const FileTable = ({
  files,
  selectedFileIds,
  onToggleAll,
  onToggleFile,
  onReserveFile,
  onReleaseFile,
  onPurgeFile,
}: {
  files: ScanFile[];
  selectedFileIds: Set<string>;
  onToggleAll: () => void;
  onToggleFile: (fileId: string) => void;
  onReserveFile: (fileId: string) => void;
  onReleaseFile: (fileId: string) => void;
  onPurgeFile: (fileId: string) => void;
}) => {
  const { locale, t } = useI18n();
  const allVisibleSelected = files.length > 0 && files.every((file) => selectedFileIds.has(file.id));

  return (
    <div className="overflow-hidden rounded-lg bg-white">
      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full table-fixed">
          <thead className="bg-[#F3F6FA] text-[11px] font-black text-[#7B92A8]">
            <tr>
              <th className="w-[5%] px-2 py-3 text-center"><input type="checkbox" checked={allVisibleSelected} onChange={onToggleAll} /></th>
              <th className="w-[12%] px-2 py-3 text-left">{t("service.disk.patientId")}</th>
              <th className="w-[27%] px-2 py-3 text-left">{t("service.disk.protocolName")}</th>
              <th className="w-[16%] px-2 py-3 text-left">{t("service.disk.series")}</th>
              <th className="w-[15%] px-2 py-3 text-left">
                <span className="block">{t("service.disk.acquiredAt")}</span>
                <span className="font-medium">{t("service.disk.size")}</span>
              </th>
              <th className="w-[13%] px-2 py-3 text-left">{t("service.disk.status")}</th>
              <th className="w-[12%] px-2 py-3 text-right">{t("service.disk.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, index) => {
              const reserveBlocked = getActionBlockedReason(file, "reserve", t);
              const releaseBlocked = getActionBlockedReason(file, "release", t);
              const purgeBlocked = getActionBlockedReason(file, "purge", t);

              return (
                <tr key={file.id} className={index % 2 === 0 ? "bg-white hover:bg-[#F8FBFF]" : "bg-[#FBFCFE] hover:bg-[#F8FBFF]"}>
                  <td className="px-2 py-3 text-center"><input type="checkbox" checked={selectedFileIds.has(file.id)} onChange={() => onToggleFile(file.id)} /></td>
                  <td className="whitespace-nowrap px-2 py-3 font-bold text-[#31485E]">{file.patient_id}</td>
                  <td className="truncate px-2 py-3 text-[#31485E]" title={file.protocol_name}>{file.protocol_name}</td>
                  <td className="truncate px-2 py-3 text-[#31485E]" title={file.series_name}>{file.series_name}</td>
                  <td className="px-2 py-2 text-[11px] leading-4 text-[#31485E]">
                    <div className="whitespace-nowrap">{formatDateTime(file.acquired_at, locale)}</div>
                    <div className="whitespace-nowrap text-[#7B92A8]">{formatMb(file.file_size_mb)}</div>
                  </td>
                  <td className="px-2 py-3">
                    {file.active_recon_jobs > 0 ? (
                      <div className="inline-flex items-center gap-1 rounded-full bg-[#FFF7ED] px-2 py-1 text-[11px] font-bold text-[#D97706] ring-1 ring-[#FED7AA]">
                        <ShieldAlert size={11} /> {t("service.disk.reconstructing")}
                      </div>
                    ) : (
                      <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${STATUS_STYLES[file.status]}`}>
                        {file.status === "RESERVED" ? <Lock size={11} /> : null}
                        {t(FILE_STATUS_LABEL_KEYS[file.status])}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" aria-label={t("service.disk.reserve")} disabled={Boolean(reserveBlocked)} title={reserveBlocked ?? t("service.disk.reserve")} onClick={() => onReserveFile(file.id)} className="flex h-6 w-6 items-center justify-center rounded-md border border-[#D7E3F0] text-[#2F67D8] hover:bg-[#F5F9FF] disabled:cursor-not-allowed disabled:text-[#A0AEC0]"><Lock size={12} /></button>
                      <button type="button" aria-label={t("service.disk.release")} disabled={Boolean(releaseBlocked)} title={releaseBlocked ?? t("service.disk.release")} onClick={() => onReleaseFile(file.id)} className="flex h-6 w-6 items-center justify-center rounded-md border border-[#D7E3F0] text-[#4F6479] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:text-[#A0AEC0]"><Unlock size={12} /></button>
                      <button type="button" aria-label={t("service.disk.delete")} disabled={Boolean(purgeBlocked)} title={purgeBlocked ?? t("service.disk.delete")} onClick={() => onPurgeFile(file.id)} className="flex h-6 w-6 items-center justify-center rounded-md bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA] disabled:cursor-not-allowed disabled:bg-[#F8D7DA] disabled:text-[#D4A1A8]"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function DiskManagementPage() {
  const { t } = useI18n();
  const diskManager = useDiskManager();
  const activePartition = diskManager.partitions.find((partition) => partition.id === diskManager.expandedPartition) ?? null;

  return (
    <ServiceModeShell currentRoute="/service/disk">
      <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-white px-5 py-4 custom-scrollbar">
        <div className="shrink-0 rounded-lg bg-[#F6F8FC] p-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative">
              <input
                value={diskManager.searchQuery}
                onChange={(event) => diskManager.setSearchQuery(event.target.value)}
                placeholder={t("service.disk.searchPlaceholder")}
                className="h-10 w-[248px] rounded-xl border border-[#D7E3F0] bg-[#F8FAFC] pl-10 pr-4 text-[13px] font-medium text-[#31485E] outline-none focus:border-[#93C5FD]"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-[12px] font-bold text-[#4F6479]">
                <span className="whitespace-nowrap">{t("service.disk.reservePolicy")}</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={diskManager.config.retention_days}
                  onChange={(event) => diskManager.updateConfig({ retention_days: Number(event.target.value || 1) })}
                  className="h-9 w-16 rounded-xl border border-[#D7E3F0] px-2 text-center text-[13px] font-black text-[#223547] outline-none"
                />
                <span className="whitespace-nowrap">{t("service.disk.days")}</span>
                <input
                  type="time"
                  value={diskManager.config.retention_time}
                  onChange={(event) => diskManager.updateConfig({ retention_time: event.target.value })}
                  className="h-9 rounded-xl border border-[#D7E3F0] px-3 text-[12px] font-bold text-[#223547] outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => diskManager.updateConfig({ auto_cleanup: !diskManager.config.auto_cleanup })}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-[12px] font-black transition-all ${
                  diskManager.config.auto_cleanup ? "bg-[#2F67D8] text-white" : "border border-[#D7E3F0] bg-white text-[#4F6479]"
                }`}
              >
                {t("service.disk.autoCleanup", { state: diskManager.config.auto_cleanup ? t("service.disk.on") : t("service.disk.off") })}
              </button>

              <button
                type="button"
                onClick={diskManager.refreshData}
                className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-[#D7E3F0] bg-white px-4 text-[12px] font-black text-[#31485E] transition-colors hover:bg-[#F8FAFC]"
              >
                <RefreshCcw size={15} className="text-[#2F67D8]" /> {t("service.disk.refresh")}
              </button>
            </div>
          </div>

          {diskManager.message ? (
            <div className={`mt-3 rounded-xl px-4 py-3 text-[13px] font-semibold ${diskManager.message.type === "success" ? "bg-[#E7F8EC] text-[#2F855A]" : "bg-[#FFF1F2] text-[#DC2626]"}`}>
              {diskManager.message.text}
            </div>
          ) : null}
        </div>

        {diskManager.loading ? (
          <div className="shrink-0 rounded-lg bg-[#F6F8FC] px-5 py-8 text-center text-[13px] text-[#94A3B8]">{t("service.disk.loading")}</div>
        ) : null}

        <div className="grid shrink-0 grid-cols-4 gap-3">
          {diskManager.partitions.map((partition) => (
            <PartitionSummaryCard
              key={partition.id}
              partition={partition}
              percent={diskManager.getUsagePercent(partition.id)}
              isActive={activePartition?.id === partition.id}
              isOverThreshold={diskManager.isOverThreshold(partition.id)}
              onSelect={() => diskManager.setExpandedPartition(partition.id)}
            />
          ))}
        </div>

        {activePartition ? (() => {
          const partition = activePartition;
          const filteredFiles = diskManager.getFilteredFiles(partition.id);
          const selectedFiles = diskManager.getSelectedScanFiles(partition.id);
          const selectedFileIds = diskManager.selectedFiles[partition.id];
          const canReserve = diskManager.canReserve(partition.id);
          const canRelease = diskManager.canRelease(partition.id);
          const canPurge = diskManager.canPurge(partition.id);
          const percent = diskManager.getUsagePercent(partition.id);

          return (
            <div className="shrink-0 overflow-hidden rounded-xl bg-[#F6F8FC]">
              <PartitionHeader
                partition={partition}
                percent={percent}
                isExpanded
                isOverThreshold={diskManager.isOverThreshold(partition.id)}
                onToggle={() => diskManager.setExpandedPartition(null)}
                onThresholdCommit={(value) => diskManager.updateThreshold(partition.id, value)}
              />

              <div className="mx-3 mb-3 rounded-lg bg-white px-4 py-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-[13px] font-semibold text-[#627488]">{t("service.disk.selectedCount", { count: diskManager.selectedCount[partition.id] })}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={diskManager.busyPartition === partition.id || !canReserve.ok} title={canReserve.reason ?? ""} onClick={() => diskManager.reserveFiles(partition.id, selectedFiles.map((file) => file.id))} className="rounded-full bg-[#2F67D8] px-4 py-2 text-[12px] font-black text-white transition-all hover:bg-[#2558C0] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]">{t("service.disk.reserveSelected")}</button>
                    <button type="button" disabled={diskManager.busyPartition === partition.id || !canRelease.ok} title={canRelease.reason ?? ""} onClick={() => diskManager.releaseFiles(partition.id, selectedFiles.map((file) => file.id))} className="rounded-full border border-[#D7E3F0] bg-white px-4 py-2 text-[12px] font-black text-[#475569] transition-all hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#A0AEC0]">{t("service.disk.releaseSelected")}</button>
                    <button type="button" disabled={diskManager.busyPartition === partition.id || !canPurge.ok} title={canPurge.reason ?? ""} onClick={() => diskManager.purgeFiles(partition.id, selectedFiles.map((file) => file.id))} className="rounded-full bg-[#E53E3E] px-4 py-2 text-[12px] font-black text-white transition-all hover:bg-[#C53030] disabled:cursor-not-allowed disabled:bg-[#FEB2B2]">{t("service.disk.deleteSelected")}</button>
                  </div>
                </div>

                <FileTable
                  files={filteredFiles}
                  selectedFileIds={selectedFileIds}
                  onToggleAll={() => diskManager.toggleAllFiles(partition.id, filteredFiles)}
                  onToggleFile={(fileId) => diskManager.toggleFileSelection(partition.id, fileId)}
                  onReserveFile={(fileId) => diskManager.reserveFiles(partition.id, [fileId])}
                  onReleaseFile={(fileId) => diskManager.releaseFiles(partition.id, [fileId])}
                  onPurgeFile={(fileId) => diskManager.purgeFiles(partition.id, [fileId])}
                />

                {canReserve.reason || canRelease.reason || canPurge.reason ? (
                  <div className="mt-3 flex flex-wrap gap-4 text-[12px] font-medium text-[#A0AEC0]">
                    {canReserve.reason ? <span>{t("service.disk.reserveLimit", { reason: canReserve.reason })}</span> : null}
                    {canRelease.reason ? <span>{t("service.disk.releaseLimit", { reason: canRelease.reason })}</span> : null}
                    {canPurge.reason ? <span>{t("service.disk.deleteLimit", { reason: canPurge.reason })}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })() : null}
      </section>
    </ServiceModeShell>
  );
}
