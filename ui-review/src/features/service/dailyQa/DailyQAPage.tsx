import ServiceModeShell from "../shared/ServiceModeShell";
import { DailyQAContent } from "./components/DailyQAContent";
import { DailyQAOverlays } from "./components/DailyQAOverlays";
import { useDailyQa } from "./useDailyQa";

export default function DailyQAScreen() {
  const qa = useDailyQa();

  return (
    <ServiceModeShell
      currentRoute="/service/daily-qa"
      footerStatus={{
        label: qa.isRunningQa ? "RUN" : qa.overallJudgment === "PASS" ? "PASS" : "IDLE",
        tone: qa.isRunningQa ? "active" : qa.overallJudgment === "PASS" ? "success" : "idle",
      }}
      overlays={
        <DailyQAOverlays
          analysisStage={qa.analysisStage}
          isRunningQa={qa.isRunningQa}
          onCancel={() => qa.setShowAnalyzeConfirm(false)}
          onConfirm={qa.onConfirmAnalyze}
          phantomType={qa.phantomType}
          showAnalyzeConfirm={qa.showAnalyzeConfirm}
        />
      }
    >
      <DailyQAContent
        cards={qa.cards}
        onAnalyze={qa.onAnalyze}
        onPhantomTypeChange={qa.setPhantomType}
        onRoiPointChange={qa.onRoiPointChange}
        phantomImage={qa.phantomImage}
        phantomType={qa.phantomType}
        selectedDate={qa.selectedDate}
      />
    </ServiceModeShell>
  );
}
