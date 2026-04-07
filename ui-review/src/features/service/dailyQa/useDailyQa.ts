import { useState } from "react";

import type { PhantomType, QACardItem } from "./types";

const QA_CARDS: QACardItem[] = [
  { title: "噪声分析", limit: "< 3", actual: "-", status: "不通过" },
  { title: "CT值均匀性分析", limit: "< 4", actual: "-", status: "不通过" },
  { title: "CT值准确性分析", limit: "water: -", actual: "-", status: "不通过" },
];

export function useDailyQa() {
  const [phantomType, setPhantomType] = useState<PhantomType>("水模");
  const [showAnalyzeConfirm, setShowAnalyzeConfirm] = useState(false);

  return {
    cards: QA_CARDS,
    phantomType,
    setPhantomType,
    setShowAnalyzeConfirm,
    showAnalyzeConfirm,
  };
}
