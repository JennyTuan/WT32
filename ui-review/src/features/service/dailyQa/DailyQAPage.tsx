import ServiceModeShell from "../shared/ServiceModeShell";
import { DailyQAContent } from "./components/DailyQAContent";
import { DailyQAOverlays } from "./components/DailyQAOverlays";
import { useDailyQa } from "./useDailyQa";

export default function DailyQAScreen() {
  const qa = useDailyQa();

  return (
    <ServiceModeShell
      currentRoute="/service/daily-qa"
      overlays={
        <DailyQAOverlays
          onCancel={() => qa.setShowAnalyzeConfirm(false)}
          onConfirm={() => qa.setShowAnalyzeConfirm(false)}
          phantomType={qa.phantomType}
          showAnalyzeConfirm={qa.showAnalyzeConfirm}
        />
      }
    >
      <DailyQAContent
        cards={qa.cards}
        onAnalyze={() => qa.setShowAnalyzeConfirm(true)}
        onPhantomTypeChange={qa.setPhantomType}
        phantomType={qa.phantomType}
      />
    </ServiceModeShell>
  );
}
