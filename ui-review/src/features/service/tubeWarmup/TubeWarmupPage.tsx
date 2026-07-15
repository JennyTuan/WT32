import ServiceModeShell from "../shared/ServiceModeShell";
import { WarmupContent } from "./components/WarmupContent";
import { WarmupOverlays } from "./components/WarmupOverlays";
import { useTubeWarmup } from "./useTubeWarmup";

export default function TubeWarmupPage() {
  const warmup = useTubeWarmup();

  return (
    <ServiceModeShell
      currentRoute="/service/tube-warmup"
      overlays={
        <WarmupOverlays
          activePhase={warmup.activePhase}
          confirmAbort={warmup.confirmAbort}
          currentHeat={warmup.currentHeat}
          dismissPhysicalTrigger={warmup.dismissPhysicalTrigger}
          handleAbort={warmup.handleAbort}
          handlePhysicalTrigger={warmup.handlePhysicalTrigger}
          setShowAbortConfirm={warmup.setShowAbortConfirm}
          showPhysicalTrigger={warmup.showPhysicalTrigger}
          showAbortConfirm={warmup.showAbortConfirm}
          status={warmup.status}
          targetHeat={warmup.targetHeat}
          warmupProgress={warmup.warmupProgress}
        />
      }
    >
      <WarmupContent {...warmup} />
    </ServiceModeShell>
  );
}
