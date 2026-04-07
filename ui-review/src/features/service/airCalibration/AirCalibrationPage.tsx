import ServiceModeShell from "../shared/ServiceModeShell";
import { AirCalibrationContent } from "./components/AirCalibrationContent";
import { AirCalibrationOverlays } from "./components/AirCalibrationOverlays";
import { useAirCalibration } from "./useAirCalibration";

export default function AirCalibrationPage() {
  const calibration = useAirCalibration();

  return (
    <ServiceModeShell
      currentRoute="/service/air-calibration"
      overlays={
        <AirCalibrationOverlays
          calibrationProgress={calibration.calibrationProgress}
          completedCount={calibration.completedCount}
          confirmAbort={calibration.confirmAbort}
          currentCombo={calibration.currentCombo}
          failedCount={calibration.failedCount}
          handleAbort={calibration.handleAbort}
          isCalibrating={calibration.isCalibrating}
          pendingCount={calibration.pendingCount}
          setShowAbortConfirm={calibration.setShowAbortConfirm}
          stageLabel={calibration.stageLabel}
          showAbortConfirm={calibration.showAbortConfirm}
          totalCombinations={calibration.totalCombinations}
        />
      }
      footerStatus={{
        label: calibration.isCalibrating ? "RUN" : calibration.runStatus === "completed" ? "DONE" : "IDLE",
        tone: calibration.isCalibrating ? "active" : calibration.runStatus === "completed" ? "success" : "idle",
      }}
    >
      <AirCalibrationContent
        completedCount={calibration.completedCount}
        failedCount={calibration.failedCount}
        handleStartCalibration={calibration.handleStartCalibration}
        isCalibrating={calibration.isCalibrating}
        pendingCount={calibration.pendingCount}
        resetSelections={calibration.resetSelections}
        runStatus={calibration.runStatus}
        selectionState={calibration.selectionState}
        toggleSelection={calibration.toggleSelection}
        totalCombinations={calibration.totalCombinations}
      />
    </ServiceModeShell>
  );
}
