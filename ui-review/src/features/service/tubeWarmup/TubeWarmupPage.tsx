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
          handleAbort={warmup.handleAbort}
          setShowAbortConfirm={warmup.setShowAbortConfirm}
          showAbortConfirm={warmup.showAbortConfirm}
          status={warmup.status}
          targetHeat={warmup.targetHeat}
          warmupProgress={warmup.warmupProgress}
        />
      }
      footerStatus={{
        label: warmup.status === "warming" ? "RUN" : warmup.status === "completed" ? "OK" : "IDLE",
        tone:
          warmup.status === "warming"
            ? "active"
            : warmup.status === "completed"
              ? "success"
              : "idle",
      }}
    >
      <WarmupContent {...warmup} />
    </ServiceModeShell>
  );
}
