import { useMemo, useState, type ElementType } from "react";
import {
  AlertTriangle,
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

const getBlockedReason = (file: ScanFile, action: "release" | "purge") => {
  if (file.active_recon_jobs > 0) {
    return `存在 ${file.active_recon_jobs} 个重建任务`;
  }
  if (action === "purge" && file.status === "RESERVED") {
    return "文件已保留，请先释放";
  }
  return null;
};

const StorageCard = ({
  partition,
  percent,
  filteredFiles,
  selectedFileIds,
  selectedCount,
  isExpanded,
  isBusy,
  isOverThreshold,
  canReleaseReason,
  canPurgeReason,
  onToggle,
  onThresholdCommit,
  onToggleAll,
  onToggleFile,
  onReserveSelected,
  onReleaseSelected,
  onPurgeSelected,
  onReserveFile,
  onReleaseFile,
  onPurgeFile,
}: {
  partition: DiskPartition;
  percent: number;
  filteredFiles: ScanFile[];
  selectedFileIds: Set<string>;
  selectedCount: number;
  isExpanded: boolean;
  isBusy: boolean;
  isOverThreshold: boolean;
  canReleaseReason?: string;
  canPurgeReason?: string;
  onToggle: () => void;
  onThresholdCommit: (value: number) => void;
  onToggleAll: () => void;
  onToggleFile: (fileId: string) => void;
  onReserveSelected: () => void;
  onReleaseSelected: () => void;
  onPurgeSelected: () => void;
  onReserveFile: (fileId: string) => void;
  onReleaseFile: (fileId: string) => void;
  onPurgeFile: (fileId: string) => void;
}) => {
  const [thresholdDraft, setThresholdDraft] = useState(String(partition.threshold));
  const visual = PARTITION_VISUALS[partition.id];
  const allVisibleSelected = filteredFiles.length > 0 && filteredFiles.every((file) => selectedFileIds.has(file.id));

  return (
    <div className="overflow-hidden rounded-[22px] border border-[#D7E3F0] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm" style={{ backgroundColor: visual.color }}>
            <visual.icon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h3 className="text-[18px] font-black text-[#223547]">{partition.label}</h3>
              {isOverThreshold ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF1F2] px-2.5 py-1 text-[11px] font-bold text-[#DC2626]">
                  <AlertTriangle size={12} /> 超阈值
                </span>
              ) : null}
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#EEF2F7]">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: visual.color }} />
            </div>
            <div className="mt-2 flex items-center gap-4 text-[12px] font-medium text-[#6B7F93]">
              <span>已用 {formatMb(partition.used_mb)}</span>
              <span>总量 {formatMb(partition.capacity_mb)}</span>
              <span>{percent.toFixed(1)}%</span>
              <span>{partition.files.length} 个文件</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[12px] font-bold text-[#627488]">
            <span>阈值</span>
            <input
              value={thresholdDraft}
              onChange={(event) => setThresholdDraft(event.target.value.replace(/[^\d]/g, ""))}
              onBlur={() => {
                const next = Number(thresholdDraft || partition.threshold);
                const normalized = Math.min(100, Math.max(1, next || partition.threshold));
                setThresholdDraft(String(normalized));
                if (normalized !== partition.threshold) {
                  onThresholdCommit(normalized);
                }
              }}
              className={`h-9 w-14 rounded-xl border px-2 text-center text-[14px] font-black outline-none ${
                isOverThreshold ? "border-[#FCA5A5] text-[#DC2626]" : "border-[#D7E3F0] text-[#223547]"
              }`}
            />
            <span>%</span>
          </div>

          <button
            type="button"
            onClick={onToggle}
            className="rounded-full border border-[#D7E3F0] px-4 py-2 text-[12px] font-black text-[#4F6479] transition-colors hover:bg-[#F8FAFC]"
          >
            {isExpanded ? "收起" : "展开"}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="border-t border-[#EEF2F7] bg-[#FBFDFF] px-5 py-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-[13px] font-semibold text-[#627488]">已选择 {selectedCount} 项</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isBusy || selectedCount === 0}
                onClick={onReserveSelected}
                className="rounded-full bg-[#2F67D8] px-4 py-2 text-[12px] font-black text-white transition-all hover:bg-[#2558C0] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
              >
                保留选中
              </button>
              <button
                type="button"
                disabled={isBusy || Boolean(canReleaseReason)}
                title={canReleaseReason ?? ""}
                onClick={onReleaseSelected}
                className="rounded-full border border-[#D7E3F0] bg-white px-4 py-2 text-[12px] font-black text-[#475569] transition-all hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#A0AEC0]"
              >
                释放选中
              </button>
              <button
                type="button"
                disabled={isBusy || Boolean(canPurgeReason)}
                title={canPurgeReason ?? ""}
                onClick={onPurgeSelected}
                className="rounded-full bg-[#E53E3E] px-4 py-2 text-[12px] font-black text-white transition-all hover:bg-[#C53030] disabled:cursor-not-allowed disabled:bg-[#FEB2B2]"
              >
                删除选中
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white">
            <div className="grid grid-cols-[40px_104px_1.1fr_0.9fr_86px_120px_132px_200px] items-center border-b border-[#E6EEF6] bg-[#F8FAFD] px-4 py-3 text-[11px] font-black tracking-[0.05em] text-[#7B92A8]">
              <div>
                <input type="checkbox" checked={allVisibleSelected} onChange={onToggleAll} />
              </div>
              <div>患者 ID</div>
              <div>协议名称</div>
              <div>序列</div>
              <div>大小</div>
              <div>采集时间</div>
              <div>状态</div>
              <div className="text-right">操作</div>
            </div>

            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
              {filteredFiles.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-[#94A3B8]">当前筛选下无文件</div>
              ) : (
                filteredFiles.map((file, index) => {
                  const releaseBlocked = getBlockedReason(file, "release");
                  const purgeBlocked = getBlockedReason(file, "purge");

                  return (
                    <div
                      key={file.id}
                      className={`grid grid-cols-[40px_104px_1.1fr_0.9fr_86px_120px_132px_200px] items-center px-4 py-3 text-[12px] text-[#31485E] ${
                        index < filteredFiles.length - 1 ? "border-b border-[#EEF2F7]" : ""
                      }`}
                    >
                      <div>
                        <input
                          type="checkbox"
                          checked={selectedFileIds.has(file.id)}
                          onChange={() => onToggleFile(file.id)}
                        />
                      </div>
                      <div className="font-bold">{file.patient_id}</div>
                      <div className="truncate" title={file.protocol_name}>{file.protocol_name}</div>
                      <div>{file.series_name}</div>
                      <div>{formatMb(file.file_size_mb)}</div>
                      <div>{formatDateTime(file.acquired_at)}</div>
                      <div>
                        <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${STATUS_STYLES[file.status]}`}>
                          {file.status === "RESERVED" ? <Lock size={11} /> : null}
                          {file.status}
                        </div>
                        {file.active_recon_jobs > 0 ? (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#D97706]">
                            <ShieldAlert size={11} /> 重建中
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onReserveFile(file.id)}
                          className="rounded-lg border border-[#D7E3F0] px-2.5 py-1.5 text-[11px] font-bold text-[#2F67D8] hover:bg-[#F5F9FF]"
                        >
                          保留
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(releaseBlocked)}
                          title={releaseBlocked ?? ""}
                          onClick={() => onReleaseFile(file.id)}
                          className="rounded-lg border border-[#D7E3F0] px-2.5 py-1.5 text-[11px] font-bold text-[#4F6479] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:text-[#A0AEC0]"
                        >
                          释放
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(purgeBlocked)}
                          title={purgeBlocked ?? ""}
                          onClick={() => onPurgeFile(file.id)}
                          className="rounded-lg bg-[#FEE2E2] px-2.5 py-1.5 text-[11px] font-bold text-[#DC2626] hover:bg-[#FECACA] disabled:cursor-not-allowed disabled:bg-[#F8D7DA] disabled:text-[#D4A1A8]"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {canReleaseReason || canPurgeReason ? (
            <div className="mt-3 flex flex-wrap gap-4 text-[12px] font-medium text-[#A0AEC0]">
              {canReleaseReason ? <span>释放限制：{canReleaseReason}</span> : null}
              {canPurgeReason ? <span>删除限制：{canPurgeReason}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
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
      <section className="flex h-full flex-1 flex-col gap-4 overflow-y-auto custom-scrollbar">
        <div className="rounded-md border border-[#B0C4DE] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative">
              <input
                value={diskManager.searchQuery}
                onChange={(event) => diskManager.setSearchQuery(event.target.value)}
                placeholder="搜索患者 ID"
                className="h-10 w-[320px] rounded-xl border border-[#D7E3F0] bg-[#F8FAFC] pl-10 pr-4 text-[13px] font-medium text-[#31485E] outline-none focus:border-[#93C5FD]"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
            </div>

            <button
              type="button"
              onClick={diskManager.refreshData}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#D7E3F0] bg-white px-5 text-[12px] font-black text-[#31485E] transition-colors hover:bg-[#F8FAFC]"
            >
              <RefreshCcw size={15} className="text-[#2F67D8]" /> 刷新
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-[#EEF2F7] pt-4">
            <div className="flex items-center gap-3 text-[13px] font-bold text-[#4F6479]">
              <span>保留策略</span>
              <input
                type="number"
                min={1}
                max={365}
                value={diskManager.config.retention_days}
                onChange={(event) => diskManager.updateConfig({ retention_days: Number(event.target.value || 1) })}
                className="h-9 w-20 rounded-xl border border-[#D7E3F0] px-3 text-center text-[14px] font-black text-[#223547] outline-none"
              />
              <span>天</span>
              <input
                type="time"
                value={diskManager.config.retention_time}
                onChange={(event) => diskManager.updateConfig({ retention_time: event.target.value })}
                className="h-9 rounded-xl border border-[#D7E3F0] px-3 text-[13px] font-bold text-[#223547] outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => diskManager.updateConfig({ auto_cleanup: !diskManager.config.auto_cleanup })}
              className={`rounded-full px-5 py-2 text-[12px] font-black transition-all ${
                diskManager.config.auto_cleanup
                  ? "bg-[#2F67D8] text-white"
                  : "border border-[#D7E3F0] bg-white text-[#4F6479]"
              }`}
            >
              自动清理：{diskManager.config.auto_cleanup ? "开启" : "关闭"}
            </button>
          </div>

          {diskManager.message ? (
            <div className={`mt-4 rounded-xl px-4 py-3 text-[13px] font-semibold ${diskManager.message.type === "success" ? "bg-[#E7F8EC] text-[#2F855A]" : "bg-[#FFF1F2] text-[#DC2626]"}`}>
              {diskManager.message.text}
            </div>
          ) : null}
        </div>

        {diskManager.loading ? (
          <div className="rounded-md border border-[#B0C4DE] bg-white px-5 py-8 text-center text-[13px] text-[#94A3B8] shadow-sm">
            正在加载磁盘数据...
          </div>
        ) : null}

        {diskManager.partitions.map((partition) => {
          const filteredFiles = diskManager.getFilteredFiles(partition.id);
          const selectedFiles = diskManager.getSelectedScanFiles(partition.id);
          const selectedFileIds = diskManager.selectedFiles[partition.id];
          const canRelease = diskManager.canRelease(partition.id);
          const canPurge = diskManager.canPurge(partition.id);
          const percent = diskManager.getUsagePercent(partition.id);

          return (
            <StorageCard
              key={partition.id}
              partition={partition}
              percent={percent}
              filteredFiles={filteredFiles}
              selectedFileIds={selectedFileIds}
              selectedCount={diskManager.selectedCount[partition.id]}
              isExpanded={diskManager.expandedPartition === partition.id}
              isBusy={diskManager.busyPartition === partition.id}
              isOverThreshold={diskManager.isOverThreshold(partition.id)}
              canReleaseReason={canRelease.ok ? undefined : canRelease.reason}
              canPurgeReason={canPurge.ok ? undefined : canPurge.reason}
              onToggle={() =>
                diskManager.setExpandedPartition(diskManager.expandedPartition === partition.id ? null : partition.id)
              }
              onThresholdCommit={(value) => diskManager.updateThreshold(partition.id, value)}
              onToggleAll={() => diskManager.toggleAllFiles(partition.id, filteredFiles)}
              onToggleFile={(fileId) => diskManager.toggleFileSelection(partition.id, fileId)}
              onReserveSelected={() => diskManager.reserveFiles(partition.id, selectedFiles.map((file) => file.id))}
              onReleaseSelected={() => diskManager.releaseFiles(partition.id, selectedFiles.map((file) => file.id))}
              onPurgeSelected={() => diskManager.purgeFiles(partition.id, selectedFiles.map((file) => file.id))}
              onReserveFile={(fileId) => diskManager.reserveFiles(partition.id, [fileId])}
              onReleaseFile={(fileId) => diskManager.releaseFiles(partition.id, [fileId])}
              onPurgeFile={(fileId) => diskManager.purgeFiles(partition.id, [fileId])}
            />
          );
        })}
      </section>
    </ServiceModeShell>
  );
}
