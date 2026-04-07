import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Battery,
  CheckCircle2,
  Disc,
  MousePointer2,
  TestTube,
  Thermometer,
  Wind,
} from "lucide-react";

export type ServiceModeItem = {
  route: string;
  label: string;
  section: string;
  icon: LucideIcon;
};

export const SERVICE_MODE_ITEMS: ServiceModeItem[] = [
  { route: "/service/tube-warmup", label: "球管预热", section: "硬件", icon: Thermometer },
  { route: "/service/air-calibration", label: "空气校正", section: "硬件", icon: Wind },
  { route: "/service/daily-qa", label: "日常QA", section: "硬件", icon: CheckCircle2 },
  { route: "/service/hardware-test", label: "硬件测试", section: "硬件", icon: TestTube },
  { route: "/service/battery", label: "电池管理", section: "硬件", icon: Battery },
  { route: "/service/disk", label: "磁盘管理", section: "硬件", icon: Disc },
  { route: "/service/performance", label: "性能评估", section: "硬件", icon: BarChart3 },
  { route: "/mobile/manual-scan", label: "手动扫描", section: "硬件", icon: MousePointer2 },
];

export const getServiceModeItem = (route: string) =>
  SERVICE_MODE_ITEMS.find((item) => item.route === route);
