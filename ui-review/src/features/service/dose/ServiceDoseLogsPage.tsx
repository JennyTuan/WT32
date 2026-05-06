import ServiceModeShell from "../shared/ServiceModeShell";

export default function ServiceDoseLogsPage() {
  return (
    <ServiceModeShell currentRoute="/service/dose/logs" footerStatus={{ label: "IDLE", tone: "idle" }}>
      <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
        剂量日志（待实现）
      </div>
    </ServiceModeShell>
  );
}
