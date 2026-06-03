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
import type { TranslationKey } from "../../../lib/i18n";

export type ServiceModeSection = "hardware" | "settings" | "reports" | "dose";

export type ServiceModeItem = {
  route: string;
  labelKey: TranslationKey;
  section: ServiceModeSection;
  icon: LucideIcon;
};

export const SERVICE_MODE_SECTION_ORDER: ServiceModeSection[] = ["hardware", "settings", "reports", "dose"];

export const SERVICE_MODE_SECTION_LABEL_KEYS: Record<ServiceModeSection, TranslationKey> = {
  hardware: "service.section.hardware",
  settings: "service.section.settings",
  reports: "service.section.reports",
  dose: "service.section.dose",
};

export const SERVICE_MODE_ITEMS: ServiceModeItem[] = [
  { route: "/service/tube-warmup", labelKey: "service.item.tubeWarmup", section: "hardware", icon: Thermometer },
  { route: "/service/air-calibration", labelKey: "service.item.airCalibration", section: "hardware", icon: Wind },
  { route: "/service/daily-qa", labelKey: "service.item.dailyQa", section: "hardware", icon: CheckCircle2 },
  { route: "/service/hardware-test", labelKey: "service.item.hardwareTest", section: "hardware", icon: TestTube },
  { route: "/service/battery", labelKey: "service.item.battery", section: "hardware", icon: Battery },
  { route: "/service/disk", labelKey: "service.item.disk", section: "hardware", icon: Disc },
  { route: "/service/performance", labelKey: "service.item.performance", section: "hardware", icon: BarChart3 },
  { route: "/mobile/manual-scan", labelKey: "service.item.manualScan", section: "hardware", icon: MousePointer2 },

  { route: "/service/settings/protocol-management", labelKey: "service.item.protocolManagement", section: "settings", icon: FolderCog },
  { route: "/service/settings/corner-info", labelKey: "service.item.cornerInfo", section: "settings", icon: LayoutTemplate },
  { route: "/service/settings/dicom", labelKey: "service.item.dicom", section: "settings", icon: HardDriveDownload },
  { route: "/service/settings/user-management", labelKey: "service.item.userManagement", section: "settings", icon: Users },
  { route: "/service/settings/system-settings", labelKey: "service.item.systemSettings", section: "settings", icon: Settings2 },
  { route: "/service/settings/organization-info", labelKey: "service.item.organizationInfo", section: "settings", icon: Building2 },

  { route: "/service/reports/qa-report", labelKey: "service.item.qaReport", section: "reports", icon: FileBarChart2 },
  { route: "/service/reports/system-log", labelKey: "service.item.systemLog", section: "reports", icon: ScrollText },
  { route: "/service/reports/runtime-stats", labelKey: "service.item.runtimeStats", section: "reports", icon: Activity },
  { route: "/service/reports/audit-log", labelKey: "service.item.auditLog", section: "reports", icon: ShieldCheck },

  { route: "/service/dose/settings", labelKey: "service.item.doseSettings", section: "dose", icon: Radiation },
  { route: "/service/dose/logs", labelKey: "service.item.doseLogs", section: "dose", icon: BadgePercent },
];

export const getServiceModeItem = (route: string) =>
  SERVICE_MODE_ITEMS.find((item) => item.route === route);
