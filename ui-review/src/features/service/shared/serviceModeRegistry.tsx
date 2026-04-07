import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgePercent,
  BarChart3,
  Battery,
  Building2,
  CheckCircle2,
  Disc,
  FileBarChart2,
  FolderCog,
  HardDriveDownload,
  LayoutTemplate,
  MousePointer2,
  Radiation,
  ScrollText,
  Settings2,
  ShieldCheck,
  TestTube,
  Thermometer,
  Users,
  Wind,
} from "lucide-react";

export type ServiceModeSection = "硬件" | "设置" | "统计和报告" | "剂量管理";

export type ServiceModeItem = {
  route: string;
  label: string;
  section: ServiceModeSection;
  icon: LucideIcon;
};

export const SERVICE_MODE_SECTION_ORDER: ServiceModeSection[] = ["硬件", "设置", "统计和报告", "剂量管理"];

export const SERVICE_MODE_ITEMS: ServiceModeItem[] = [
  { route: "/service/tube-warmup", label: "球管预热", section: "硬件", icon: Thermometer },
  { route: "/service/air-calibration", label: "空气校正", section: "硬件", icon: Wind },
  { route: "/service/daily-qa", label: "日常 QA", section: "硬件", icon: CheckCircle2 },
  { route: "/service/hardware-test", label: "硬件测试", section: "硬件", icon: TestTube },
  { route: "/service/battery", label: "电池管理", section: "硬件", icon: Battery },
  { route: "/service/disk", label: "磁盘管理", section: "硬件", icon: Disc },
  { route: "/service/performance", label: "性能评估", section: "硬件", icon: BarChart3 },
  { route: "/mobile/manual-scan", label: "手动扫描", section: "硬件", icon: MousePointer2 },

  { route: "/service/settings/protocol-management", label: "协议管理", section: "设置", icon: FolderCog },
  { route: "/service/settings/corner-info", label: "四角信息", section: "设置", icon: LayoutTemplate },
  { route: "/service/settings/dicom", label: "DICOM", section: "设置", icon: HardDriveDownload },
  { route: "/service/settings/user-management", label: "用户管理", section: "设置", icon: Users },
  { route: "/service/settings/system-settings", label: "系统设置", section: "设置", icon: Settings2 },
  { route: "/service/settings/organization-info", label: "机构信息设置", section: "设置", icon: Building2 },

  { route: "/service/reports/qa-report", label: "质控报告", section: "统计和报告", icon: FileBarChart2 },
  { route: "/service/reports/system-log", label: "系统日志", section: "统计和报告", icon: ScrollText },
  { route: "/service/reports/runtime-stats", label: "运行统计", section: "统计和报告", icon: Activity },
  { route: "/service/reports/audit-log", label: "审计日志", section: "统计和报告", icon: ShieldCheck },

  { route: "/service/dose/settings", label: "剂量设置", section: "剂量管理", icon: Radiation },
  { route: "/service/dose/logs", label: "剂量日志", section: "剂量管理", icon: BadgePercent },
];

export const getServiceModeItem = (route: string) =>
  SERVICE_MODE_ITEMS.find((item) => item.route === route);
