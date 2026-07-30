import { useState, type ElementType } from "react";
import {
  AlertTriangle,
  Database,
  FileCode,
  HardDrive,
  Lock,
  MoreHorizontal,
  RefreshCcw,
  Search,
  Share2,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Unlock,
  X,
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

type FileStatusFilter = "ALL" | ScanFile["status"] | "RECONSTRUCTING";

const STATUS_FILTER_OPTIONS: { value: FileStatusFilter; labelKey: TranslationKey }[] = [
  { value: "ALL", labelKey: "service.disk.allStatuses" },
  { value: "ACQUIRED", labelKey: "service.disk.status.ACQUIRED" },
  { value: "RESERVED", labelKey: "service.disk.status.RESERVED" },
  { value: "RECONSTRUCTING", labelKey: "service.disk.reconstructing" },
  { value: "RELEASED", labelKey: "service.disk.status.RELEASED" },
];

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

const matchesStatusFilter = (file: ScanFile, statusFilter: FileStatusFilter) => {
  if (statusFilter === "ALL") return true;
  if (statusFilter === "RECONSTRUCTING") return file.active_recon_jobs > 0;
  return file.status === statusFilter;
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
      className={`min-w-0 rounded-lg p-3 text-left transition-all ${
        isActive
          ? "bg-white ring-1 ring-[#8EC5FF] shadow-sm"
          : "bg-transparent hover:bg-white/70"
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
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EAF0F6]">
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
    <div className="overflow-hidden bg-white">
      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full table-fixed">
          <thead className="sticky top-0 z-10 bg-[#F3F6FA] text-[11px] font-black text-[#7B92A8] shadow-[0_1px_0_#E2E8F0]">
            <tr>
              <th className="w-[5%] px-2 py-3 text-center"><input type="checkbox" checked={allVisibleSelected} onChange={onToggleAll} /></th>
              <th className="w-[12%] px-2 py-3 text-left">{t("service.disk.patientId")}</th>
              <th className="w-[25%] px-2 py-3 text-left">{t("service.disk.protocolName")}</th>
              <th className="w-[14%] px-2 py-3 text-left">{t("service.disk.series")}</th>
              <th className="w-[14%] px-2 py-3 text-left">
                <span className="block">{t("service.disk.acquiredAt")}</span>
                <span className="font-medium">{t("service.disk.size")}</span>
              </th>
              <th className="w-[12%] px-2 py-3 text-left">{t("service.disk.status")}</th>
              <th className="w-[18%] px-2 py-3 text-right">{t("service.disk.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, index) => {
              const reserveBlocked = getActionBlockedReason(file, "reserve", t);
              const releaseBlocked = getActionBlockedReason(file, "release", t);
              const purgeBlocked = getActionBlockedReason(file, "purge", t);
              const primaryAction = file.status === "RESERVED"
                ? {
                    label: t("service.disk.release"),
                    blocked: releaseBlocked,
                    icon: Unlock,
                    onClick: () => onReleaseFile(file.id),
                  }
                : {
                    label: t("service.disk.reserve"),
                    blocked: reserveBlocked,
                    icon: Lock,
                    onClick: () => onReserveFile(file.id),
                  };
              const PrimaryIcon = primaryAction.icon;

              return (
                <tr key={file.id} className={index % 2 === 0 ? "bg-white hover:bg-[#F8FBFF]" : "bg-[#FBFCFE] hover:bg-[#F8FBFF]"}>
                  <td className="px-2 py-3 text-center"><input type="checkbox" checked={selectedFileIds.has(file.id)} onChange={() => onToggleFile(file.id)} /></td>
                  <td className="whitespace-nowrap px-2 py-3 text-[12px] font-medium text-[#52677C]">{file.patient_id}</td>
                  <td className="truncate px-2 py-3 text-[12px] font-medium text-[#52677C]" title={file.protocol_name}>{file.protocol_name}</td>
                  <td className="truncate px-2 py-3 text-[12px] font-medium text-[#52677C]" title={file.series_name}>{file.series_name}</td>
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
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" aria-label={primaryAction.label} disabled={Boolean(primaryAction.blocked)} title={primaryAction.blocked ?? primaryAction.label} onClick={primaryAction.onClick} className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[#C7DCF5] bg-[#F5F9FF] px-2 text-[11px] font-bold text-[#2F67D8] hover:bg-[#EAF3FF] disabled:cursor-not-allowed disabled:border-[#E2E8F0] disabled:bg-[#F8FAFC] disabled:text-[#A0AEC0]"><PrimaryIcon size={12} />{primaryAction.label}</button>
                      <details className="relative">
                        <summary aria-label={t("service.disk.actions")} className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md border border-[#D7E3F0] text-[#60758A] hover:bg-[#F8FAFC] [&::-webkit-details-marker]:hidden"><MoreHorizontal size={15} /></summary>
                        <div className="absolute right-0 z-20 mt-1 w-24 rounded-lg border border-[#DCE7F3] bg-white p-1 shadow-lg">
                          <button type="button" disabled={Boolean(purgeBlocked)} title={purgeBlocked ?? t("service.disk.delete")} onClick={() => onPurgeFile(file.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[11px] font-bold text-[#DC2626] hover:bg-[#FFF1F2] disabled:cursor-not-allowed disabled:text-[#D4A1A8]"><Trash2 size={12} />{t("service.disk.delete")}</button>
                        </div>
                      </details>
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

const ThresholdSettingsDialog = ({
  partitions,
  onClose,
  onSave,
}: {
  partitions: DiskPartition[];
  onClose: () => void;
  onSave: (thresholds: Record<DiskPartitionId, number>) => void;
}) => {
  const { t } = useI18n();
  const [thresholds, setThresholds] = useState<Record<DiskPartitionId, number>>(() =>
    Object.fromEntries(partitions.map((partition) => [partition.id, partition.threshold])) as Record<DiskPartitionId, number>,
  );

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[#1E293B]/25 backdrop-blur-[1px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="storage-warning-title" className="w-[430px] overflow-hidden rounded-2xl border border-[#DCE7F3] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-[#E8EEF5] px-5 py-4">
          <div>
            <h2 id="storage-warning-title" className="text-[16px] font-black text-[#223547]">{t("service.disk.warningSettings")}</h2>
            <p className="mt-1 text-[12px] font-medium text-[#7B92A8]">{t("service.disk.warningSettingsDescription")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("service.logs.close")} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#7B92A8] hover:bg-[#F5F8FC]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          {partitions.map((partition) => {
            const visual = PARTITION_VISUALS[partition.id];
            const Icon = visual.icon;
            return (
              <label key={partition.id} className="flex items-center gap-3 rounded-xl bg-[#F7F9FC] px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: visual.color }}><Icon size={15} /></span>
                <span className="min-w-0 flex-1 text-[13px] font-bold text-[#31485E]">{t(PARTITION_LABEL_KEYS[partition.id])}</span>
                <span className="text-[12px] font-bold text-[#627488]">{t("service.disk.threshold")}</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={thresholds[partition.id]}
                  onChange={(event) => setThresholds((current) => ({ ...current, [partition.id]: Math.min(100, Math.max(1, Number(event.target.value || 1))) }))}
                  className="h-8 w-14 rounded-lg border border-[#D7E3F0] bg-white px-2 text-center text-[13px] font-black text-[#223547] outline-none focus:border-[#93C5FD]"
                />
                <span className="text-[12px] font-bold text-[#627488]">%</span>
              </label>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#E8EEF5] px-5 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[#D7E3F0] bg-white px-4 text-[13px] font-bold text-[#4F6479] hover:bg-[#F8FAFC]">{t("common.cancel")}</button>
          <button type="button" onClick={() => onSave(thresholds)} className="h-9 rounded-lg bg-[#2F67D8] px-4 text-[13px] font-bold text-white hover:bg-[#2558C0]">{t("common.save")}</button>
        </div>
      </div>
    </div>
  );
};

export default function DiskManagementPage() {
  const { t } = useI18n();
  const diskManager = useDiskManager();
  const [isThresholdSettingsOpen, setIsThresholdSettingsOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState<FileStatusFilter>("ALL");
  const activePartition = diskManager.partitions.find((partition) => partition.id === diskManager.expandedPartition) ?? null;

  const saveThresholds = (thresholds: Record<DiskPartitionId, number>) => {
    diskManager.partitions.forEach((partition) => {
      if (thresholds[partition.id] !== partition.threshold) diskManager.updateThreshold(partition.id, thresholds[partition.id]);
    });
    setIsThresholdSettingsOpen(false);
  };

  return (
    <ServiceModeShell
      currentRoute="/service/disk"
      overlays={isThresholdSettingsOpen ? <ThresholdSettingsDialog partitions={diskManager.partitions} onClose={() => setIsThresholdSettingsOpen(false)} onSave={saveThresholds} /> : null}
    >
      <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-white px-5 py-4 custom-scrollbar">
        <div className="flex shrink-0 flex-col gap-3 border-b border-[#E8EEF5] pb-3">
          <form
            className="flex items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              diskManager.setSearchQuery(searchDraft);
            }}
          >
            <div className="relative min-w-0 flex-1">
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder={t("service.disk.searchPlaceholder")}
                className="h-10 w-full rounded-lg border border-transparent bg-[#F6F8FB] pl-10 pr-4 text-[13px] font-medium text-[#31485E] outline-none focus:border-[#93C5FD] focus:bg-white"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
            </div>
            <button type="submit" className="h-10 w-[112px] shrink-0 rounded-lg bg-[#2F67D8] text-[13px] font-bold text-white transition-colors hover:bg-[#2558C0]">
              {t("service.disk.search")}
            </button>
          </form>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsThresholdSettingsOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isThresholdSettingsOpen}
                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12px] font-bold text-[#4F6479] transition-colors hover:bg-[#F6F8FB]"
              >
                <SlidersHorizontal size={15} className="text-[#2F67D8]" /> {t("service.disk.warningSettings")}
              </button>

              <button
                type="button"
                onClick={diskManager.refreshData}
                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12px] font-bold text-[#4F6479] transition-colors hover:bg-[#F6F8FB]"
              >
                <RefreshCcw size={15} className="text-[#2F67D8]" /> {t("service.disk.refresh")}
              </button>
            </div>
        </div>

        {diskManager.message ? (
          <div className={`shrink-0 rounded-lg px-4 py-3 text-[13px] font-semibold ${diskManager.message.type === "success" ? "bg-[#E7F8EC] text-[#2F855A]" : "bg-[#FFF1F2] text-[#DC2626]"}`}>
            {diskManager.message.text}
          </div>
        ) : null}

        {diskManager.loading ? (
          <div className="shrink-0 rounded-lg bg-[#F6F8FC] px-5 py-8 text-center text-[13px] text-[#94A3B8]">{t("service.disk.loading")}</div>
        ) : null}

        <div className="grid shrink-0 grid-cols-4 gap-1 rounded-xl bg-[#F6F8FB] p-1">
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
          const filteredFiles = diskManager.getFilteredFiles(partition.id).filter((file) => matchesStatusFilter(file, statusFilter));
          const selectedFiles = diskManager.getSelectedScanFiles(partition.id);
          const selectedFileIds = diskManager.selectedFiles[partition.id];
          const allFilteredFilesSelected = filteredFiles.length > 0 && filteredFiles.every((file) => selectedFileIds.has(file.id));
          const canReserve = diskManager.canReserve(partition.id);
          const canRelease = diskManager.canRelease(partition.id);
          const canPurge = diskManager.canPurge(partition.id);

          return (
            <div className="shrink-0 border-t border-[#E8EEF5] bg-white">
              <div className="overflow-hidden bg-white">
                <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-y border-[#E6EDF5] bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-[13px] font-bold text-[#31485E]">{t("service.disk.selectedCount", { count: diskManager.selectedCount[partition.id] })}</div>
                    {diskManager.selectedCount[partition.id] === 0 ? <span className="text-[11px] font-medium text-[#94A3B8]">{t("service.disk.noSelection")}</span> : null}
                    <div className="flex items-center gap-2 border-l border-[#E6EDF5] pl-3">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#627488]">
                        {t("service.disk.filterByStatus")}
                        <select
                          value={statusFilter}
                          onChange={(event) => {
                            setStatusFilter(event.target.value as FileStatusFilter);
                            diskManager.clearSelection(partition.id);
                          }}
                          className="h-7 rounded-md border border-[#D7E3F0] bg-white px-2 text-[11px] font-bold text-[#31485E] outline-none focus:border-[#93C5FD]"
                        >
                          {STATUS_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                        </select>
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-[#2F67D8]">
                        <input
                          type="checkbox"
                          checked={allFilteredFilesSelected}
                          onChange={() => diskManager.toggleAllFiles(partition.id, filteredFiles)}
                          className="h-3.5 w-3.5 accent-[#2F67D8]"
                        />
                        {t("service.disk.selectAll")}
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={diskManager.busyPartition === partition.id || !canReserve.ok} title={canReserve.reason ?? ""} onClick={() => diskManager.reserveFiles(partition.id, selectedFiles.map((file) => file.id))} className="rounded-full bg-[#2F67D8] px-4 py-2 text-[12px] font-black text-white transition-all hover:bg-[#2558C0] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]">{t("service.disk.reserveSelected")}</button>
                    <button type="button" disabled={diskManager.busyPartition === partition.id || !canRelease.ok} title={canRelease.reason ?? ""} onClick={() => diskManager.releaseFiles(partition.id, selectedFiles.map((file) => file.id))} className="rounded-full border border-[#D7E3F0] bg-white px-4 py-2 text-[12px] font-black text-[#475569] transition-all hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#A0AEC0]">{t("service.disk.releaseSelected")}</button>
                    <button type="button" disabled={diskManager.busyPartition === partition.id || !canPurge.ok} title={canPurge.reason ?? ""} onClick={() => diskManager.purgeFiles(partition.id, selectedFiles.map((file) => file.id))} className="rounded-full bg-[#E53E3E] px-4 py-2 text-[12px] font-black text-white transition-all hover:bg-[#C53030] disabled:cursor-not-allowed disabled:bg-[#FEB2B2]">{t("service.disk.deleteSelected")}</button>
                  </div>
                </div>

                <div className="pt-3">
                  <FileTable
                    files={filteredFiles}
                    selectedFileIds={selectedFileIds}
                    onToggleAll={() => diskManager.toggleAllFiles(partition.id, filteredFiles)}
                    onToggleFile={(fileId) => diskManager.toggleFileSelection(partition.id, fileId)}
                    onReserveFile={(fileId) => diskManager.reserveFiles(partition.id, [fileId])}
                    onReleaseFile={(fileId) => diskManager.releaseFiles(partition.id, [fileId])}
                    onPurgeFile={(fileId) => diskManager.purgeFiles(partition.id, [fileId])}
                  />
                </div>
              </div>
            </div>
          );
        })() : null}
      </section>
    </ServiceModeShell>
  );
}
