import ServiceModeShell from "../shared/ServiceModeShell";
import { HardwareTestContent } from "./components/HardwareTestContent";
import { HardwareTestStatusPanel } from "./components/HardwareTestStatusPanel";
import { useHardwareTest } from "./useHardwareTest";

export default function HardwareTestPage() {
  const hardwareTest = useHardwareTest();

  return (
    <ServiceModeShell currentRoute="/service/hardware-test">
      <div className="flex-1 flex flex-col h-full">
        <HardwareTestContent
          activeTab={hardwareTest.activeTab}
          onTabChange={hardwareTest.setActiveTab}
          rows={hardwareTest.rows}
          tabs={hardwareTest.tabs}
        />
        <HardwareTestStatusPanel logs={hardwareTest.logs} onClearLogs={hardwareTest.clearLogs} />
      </div>
    </ServiceModeShell>
  );
}
