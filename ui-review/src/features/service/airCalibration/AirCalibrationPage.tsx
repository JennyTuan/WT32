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
          confirmAbort={calibration.confirmAbort}
          handleAbort={calibration.handleAbort}
          isCalibrating={calibration.isCalibrating}
          setShowAbortConfirm={calibration.setShowAbortConfirm}
          showAbortConfirm={calibration.showAbortConfirm}
        />
      }
      footerStatus={{
        label: calibration.isCalibrating ? "RUN" : "IDLE",
        tone: calibration.isCalibrating ? "active" : "idle",
      }}
    >
      <AirCalibrationContent
        handleStartCalibration={calibration.handleStartCalibration}
        resetSelections={calibration.resetSelections}
        selectionState={calibration.selectionState}
        toggleSelection={calibration.toggleSelection}
        totalCombinations={calibration.totalCombinations}
      />
    </ServiceModeShell>
  );
}
