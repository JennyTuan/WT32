import { useEffect, useMemo, useState, type ElementType } from "react";
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
} from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import type { DiskPartition, DiskPartitionId, ScanFile } from "./types";
import { useDiskManager } from "./useDiskManager";

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

const STATUS_STYLES = {
  ACQUIRED: "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]",
  RESERVED: "bg-[#E8F1FF] text-[#2F67D8] border border-[#BFD3FF]",
  RELEASED: "bg-[#E7F8EC] text-[#2F855A] border border-[#BFE3CC]",
} as const;

const getActionBlockedReason = (file: ScanFile, action: "reserve" | "release" | "purge") => {
  if (action === "reserve" && file.status === "RESERVED") return "文件已保留";
  if (action === "release" && file.status !== "RESERVED") return "文件当前未保留";
  if ((action === "release" || action === "purge") && file.active_recon_jobs > 0) {
    return `存在 ${file.active_recon_jobs} 个重建任务`;
  }
  if (action === "purge" && file.status === "RESERVED") return "文件已保留，请先释放";
  return null;
};

const formatMb = (value: number) => {
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${value.toFixed(0)} MB`;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
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
  const [thresholdDraft, setThresholdDraft] = useState(String(partition.threshold));
  const visual = PARTITION_VISUALS[partition.id];

  useEffect(() => {
    setThresholdDraft(String(partition.threshold));
  }, [partition.threshold]);

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ backgroundColor: visual.color }}>
        <visual.icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h3 className="text-[16px] font-black text-[#223547]">{partition.label}</h3>
          <span className="text-[12px] font-medium text-[#7B92A8]">{partition.files.length} 个文件</span>
          {isOverThreshold ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF1F2] px-2 py-0.5 text-[10px] font-bold text-[#DC2626]">
              <AlertTriangle size={11} /> 超阈值
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
          <span className="whitespace-nowrap">阈值</span>
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
          aria-label={isExpanded ? "收起分区" : "展开分区"}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D7E3F0] text-[#4F6479] transition-colors hover:bg-[#F8FAFC]"
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>
    </div>
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
  const allVisibleSelected = files.length > 0 && files.every((file) => selectedFileIds.has(file.id));

  return (
    <div className="rounded-2xl border border-[#DCE6F0] bg-white">
      <div className="overflow-x-auto overflow-y-visible">
        <table className="min-w-[980px] w-full table-auto">
          <thead className="border-b border-[#E6EEF6] bg-[#F8FAFD] text-[11px] font-black text-[#7B92A8]">
            <tr>
              <th className="w-10 px-3 py-3 text-center"><input type="checkbox" checked={allVisibleSelected} onChange={onToggleAll} /></th>
              <th className="w-[96px] px-3 py-3 text-left">患者 ID</th>
              <th className="px-3 py-3 text-left">协议名称</th>
              <th className="w-[88px] px-3 py-3 text-left">序列</th>
              <th className="w-[84px] px-3 py-3 text-left">大小</th>
              <th className="w-[124px] px-3 py-3 text-left">采集时间</th>
              <th className="w-[132px] px-3 py-3 text-left">状态</th>
              <th className="w-[220px] px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, index) => {
              const reserveBlocked = getActionBlockedReason(file, "reserve");
              const releaseBlocked = getActionBlockedReason(file, "release");
              const purgeBlocked = getActionBlockedReason(file, "purge");

              return (
                <tr key={file.id} className={index < files.length - 1 ? "border-b border-[#EEF2F7]" : ""}>
                  <td className="px-3 py-3 text-center"><input type="checkbox" checked={selectedFileIds.has(file.id)} onChange={() => onToggleFile(file.id)} /></td>
                  <td className="px-3 py-3 font-bold text-[#31485E]">{file.patient_id}</td>
                  <td className="truncate px-3 py-3 text-[#31485E]" title={file.protocol_name}>{file.protocol_name}</td>
                  <td className="px-3 py-3 text-[#31485E]">{file.series_name}</td>
                  <td className="px-3 py-3 text-[#31485E]">{formatMb(file.file_size_mb)}</td>
                  <td className="px-3 py-3 text-[#31485E]">{formatDateTime(file.acquired_at)}</td>
                  <td className="px-3 py-3">
                    <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${STATUS_STYLES[file.status]}`}>
                      {file.status === "RESERVED" ? <Lock size={11} /> : null}
                      {file.status}
                    </div>
                    {file.active_recon_jobs > 0 ? (
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#D97706]">
                        <ShieldAlert size={11} /> 重建中
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" disabled={Boolean(reserveBlocked)} title={reserveBlocked ?? ""} onClick={() => onReserveFile(file.id)} className="min-w-[46px] whitespace-nowrap rounded-lg border border-[#D7E3F0] px-2.5 py-1.5 text-[11px] font-bold leading-none text-[#2F67D8] hover:bg-[#F5F9FF] disabled:cursor-not-allowed disabled:text-[#A0AEC0]">保留</button>
                      <button type="button" disabled={Boolean(releaseBlocked)} title={releaseBlocked ?? ""} onClick={() => onReleaseFile(file.id)} className="min-w-[46px] whitespace-nowrap rounded-lg border border-[#D7E3F0] px-2.5 py-1.5 text-[11px] font-bold leading-none text-[#4F6479] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:text-[#A0AEC0]">释放</button>
                      <button type="button" disabled={Boolean(purgeBlocked)} title={purgeBlocked ?? ""} onClick={() => onPurgeFile(file.id)} className="min-w-[46px] whitespace-nowrap rounded-lg bg-[#FEE2E2] px-2.5 py-1.5 text-[11px] font-bold leading-none text-[#DC2626] hover:bg-[#FECACA] disabled:cursor-not-allowed disabled:bg-[#F8D7DA] disabled:text-[#D4A1A8]">删除</button>
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
  const diskManager = useDiskManager();

  const footerStatus = useMemo(() => {
    const overloaded = diskManager.partitions.some((partition) => diskManager.isOverThreshold(partition.id));
    return overloaded ? { label: "ALERT", tone: "active" as const } : { label: "IDLE", tone: "idle" as const };
  }, [diskManager]);

  return (
    <ServiceModeShell currentRoute="/service/disk" footerStatus={footerStatus}>
      <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar">
        <div className="rounded-md border border-[#B0C4DE] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative">
              <input
                value={diskManager.searchQuery}
                onChange={(event) => diskManager.setSearchQuery(event.target.value)}
                placeholder="搜索患者 ID"
                className="h-10 w-[248px] rounded-xl border border-[#D7E3F0] bg-[#F8FAFC] pl-10 pr-4 text-[13px] font-medium text-[#31485E] outline-none focus:border-[#93C5FD]"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-[12px] font-bold text-[#4F6479]">
                <span className="whitespace-nowrap">保留策略</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={diskManager.config.retention_days}
                  onChange={(event) => diskManager.updateConfig({ retention_days: Number(event.target.value || 1) })}
                  className="h-9 w-16 rounded-xl border border-[#D7E3F0] px-2 text-center text-[13px] font-black text-[#223547] outline-none"
                />
                <span className="whitespace-nowrap">天</span>
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
                自动清理：{diskManager.config.auto_cleanup ? "开启" : "关闭"}
              </button>

              <button
                type="button"
                onClick={diskManager.refreshData}
                className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-[#D7E3F0] bg-white px-4 text-[12px] font-black text-[#31485E] transition-colors hover:bg-[#F8FAFC]"
              >
                <RefreshCcw size={15} className="text-[#2F67D8]" /> 刷新
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
          <div className="rounded-md border border-[#B0C4DE] bg-white px-5 py-8 text-center text-[13px] text-[#94A3B8] shadow-sm">正在加载磁盘数据...</div>
        ) : null}

        {diskManager.partitions.map((partition) => {
          const filteredFiles = diskManager.getFilteredFiles(partition.id);
          const selectedFiles = diskManager.getSelectedScanFiles(partition.id);
          const selectedFileIds = diskManager.selectedFiles[partition.id];
          const canReserve = diskManager.canReserve(partition.id);
          const canRelease = diskManager.canRelease(partition.id);
          const canPurge = diskManager.canPurge(partition.id);
          const percent = diskManager.getUsagePercent(partition.id);

          return (
            <div key={partition.id} className="rounded-[22px] border border-[#D7E3F0] bg-white shadow-sm">
              <PartitionHeader
                partition={partition}
                percent={percent}
                isExpanded={diskManager.expandedPartition === partition.id}
                isOverThreshold={diskManager.isOverThreshold(partition.id)}
                onToggle={() => diskManager.setExpandedPartition(diskManager.expandedPartition === partition.id ? null : partition.id)}
                onThresholdCommit={(value) => diskManager.updateThreshold(partition.id, value)}
              />

              {diskManager.expandedPartition === partition.id ? (
                <div className="border-t border-[#EEF2F7] bg-[#FBFDFF] px-5 py-4 pb-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
                    <div className="text-[13px] font-semibold text-[#627488]">已选择 {diskManager.selectedCount[partition.id]} 项</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" disabled={diskManager.busyPartition === partition.id || !canReserve.ok} title={canReserve.reason ?? ""} onClick={() => diskManager.reserveFiles(partition.id, selectedFiles.map((file) => file.id))} className="rounded-full bg-[#2F67D8] px-4 py-2 text-[12px] font-black text-white transition-all hover:bg-[#2558C0] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]">保留选中</button>
                      <button type="button" disabled={diskManager.busyPartition === partition.id || !canRelease.ok} title={canRelease.reason ?? ""} onClick={() => diskManager.releaseFiles(partition.id, selectedFiles.map((file) => file.id))} className="rounded-full border border-[#D7E3F0] bg-white px-4 py-2 text-[12px] font-black text-[#475569] transition-all hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#A0AEC0]">释放选中</button>
                      <button type="button" disabled={diskManager.busyPartition === partition.id || !canPurge.ok} title={canPurge.reason ?? ""} onClick={() => diskManager.purgeFiles(partition.id, selectedFiles.map((file) => file.id))} className="rounded-full bg-[#E53E3E] px-4 py-2 text-[12px] font-black text-white transition-all hover:bg-[#C53030] disabled:cursor-not-allowed disabled:bg-[#FEB2B2]">删除选中</button>
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
                      {canReserve.reason ? <span>保留限制：{canReserve.reason}</span> : null}
                      {canRelease.reason ? <span>释放限制：{canRelease.reason}</span> : null}
                      {canPurge.reason ? <span>删除限制：{canPurge.reason}</span> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
    </ServiceModeShell>
  );
}
