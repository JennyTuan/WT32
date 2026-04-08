export type DiskPartitionId = "RawData" | "DICOM" | "PACS" | "Phantom";

export type ScanFileStatus = "ACQUIRED" | "RESERVED" | "RELEASED";

export type ScanFile = {
  id: string;
  patient_id: string;
  protocol_name: string;
  series_name: string;
  status: ScanFileStatus;
  is_locked: boolean;
  active_recon_jobs: number;
  retain_until: string | null;
  file_size_mb: number;
  acquired_at: string;
  partition: DiskPartitionId;
};

export type DiskPartition = {
  id: DiskPartitionId;
  label: string;
  capacity_mb: number;
  threshold: number;
  used_mb: number;
  files: ScanFile[];
};

export type DiskManagerConfig = {
  retention_days: number;
  retention_time: string;
  auto_cleanup: boolean;
};

export type PartitionsResponse = {
  partitions: DiskPartition[];
  config: DiskManagerConfig;
};
