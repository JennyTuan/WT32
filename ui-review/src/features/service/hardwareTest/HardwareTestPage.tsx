import ServiceModeShell from "../shared/ServiceModeShell";
import { HardwareTestContent } from "./components/HardwareTestContent";
import { HardwareTestStatusPanel } from "./components/HardwareTestStatusPanel";
import { useHardwareTest } from "./useHardwareTest";

export default function HardwareTestPage() {
  const hardwareTest = useHardwareTest();

  return (
    <ServiceModeShell
      currentRoute="/service/hardware-test"
      footerStatus={{
        label: hardwareTest.anyRunning ? "ACTIVE" : "IDLE",
        tone: hardwareTest.anyRunning ? "active" : "idle",
      }}
    >
      <div className="flex-1 flex flex-col h-full min-h-0">
        <HardwareTestContent
          activeTab={hardwareTest.activeTab}
          editingFieldKey={hardwareTest.editingFieldKey}
          onActionExecute={hardwareTest.executeAction}
          onParamChange={hardwareTest.updateParamValue}
          onStartEditing={hardwareTest.setEditingField}
          onTabChange={hardwareTest.setActiveTab}
          rows={hardwareTest.rows}
          runningActions={hardwareTest.runningActions}
          tabs={hardwareTest.tabs}
        />
        <HardwareTestStatusPanel
          logs={hardwareTest.logs}
          onClearLogs={hardwareTest.clearLogs}
          runningCount={Object.values(hardwareTest.runningActions).filter(Boolean).length}
        />
      </div>
    </ServiceModeShell>
  );
}
