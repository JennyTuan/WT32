import { useEffect, useMemo, useRef, useState } from "react";

import { INITIAL_WARMUP_LOGS } from "./constants";
import { clampHeat, formatClock, getWarmupPhase } from "./utils";
import type { WarmupLog, WarmupStatus } from "./types";

export function useTubeWarmup() {
  const [targetHeat, setTargetHeat] = useState(60);
  const [currentHeat, setCurrentHeat] = useState(12.4);
  const [inputValue, setInputValue] = useState("60");
  const [status, setStatus] = useState<WarmupStatus>("idle");
  const [warmupProgress, setWarmupProgress] = useState(0);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [logs, setLogs] = useState<WarmupLog[]>([...INITIAL_WARMUP_LOGS]);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null);

  const warmupSessionRef = useRef({
    startHeat: 12.4,
    targetHeat: 60,
  });

  useEffect(() => {
    if (status !== "warming" || showAbortConfirm) return;

    const interval = window.setInterval(() => {
      setWarmupProgress((prev) => {
        const next = Math.min(prev + 1.25, 100);
        const { startHeat, targetHeat: sessionTarget } = warmupSessionRef.current;
        const nextHeat = startHeat + ((sessionTarget - startHeat) * next) / 100;
        setCurrentHeat(Number(nextHeat.toFixed(2)));

        if (next >= 100) {
          setStatus("completed");
          setLastCompletedAt(formatClock(new Date()));
          setLogs((prevLogs) => [
            {
              time: formatClock(new Date()),
              message: `预热完成，热容量已稳定在 ${sessionTarget.toFixed(1)}%。`,
              tone: "success",
            },
            ...prevLogs,
          ]);
        }

        return next;
      });
    }, 160);

    return () => window.clearInterval(interval);
  }, [showAbortConfirm, status]);

  const activePhase = useMemo(() => getWarmupPhase(warmupProgress), [warmupProgress]);
  const recommendedTarget = useMemo(
    () => (currentHeat < 20 ? 60 : Math.min(75, clampHeat(Math.ceil(currentHeat / 10) * 10))),
    [currentHeat],
  );
  const estimatedMinutes = useMemo(
    () => Math.max(1, Math.ceil((targetHeat - currentHeat) / 6)),
    [currentHeat, targetHeat],
  );
  const deltaToTarget = useMemo(() => Math.max(0, targetHeat - currentHeat), [currentHeat, targetHeat]);

  const handleTargetInput = (rawValue: string) => {
    setInputValue(rawValue);
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) {
      setTargetHeat(clampHeat(parsed));
    }
  };

  const normalizeTargetInput = () => {
    const parsed = Number(inputValue);
    const safeValue = Number.isFinite(parsed) ? clampHeat(parsed) : recommendedTarget;
    setTargetHeat(safeValue);
    setInputValue(String(safeValue));
  };

  const handleStartWarmup = () => {
    const normalizedTarget = clampHeat(Number.isFinite(Number(inputValue)) ? Number(inputValue) : targetHeat);
    setTargetHeat(normalizedTarget);
    setInputValue(String(normalizedTarget));

    if (normalizedTarget <= currentHeat) {
      setLogs((prev) => [
        {
          time: formatClock(new Date()),
          message: `目标热容量 ${normalizedTarget}% 不高于当前值，已跳过预热。`,
          tone: "warning",
        },
        ...prev,
      ]);
      return;
    }

    warmupSessionRef.current = {
      startHeat: currentHeat,
      targetHeat: normalizedTarget,
    };

    setWarmupProgress(0);
    setStatus("warming");
    setLogs((prev) => [
      {
        time: formatClock(new Date()),
        message: `开始球管预热，目标热容量 ${normalizedTarget}%，预计 ${Math.max(1, Math.ceil((normalizedTarget - currentHeat) / 6))} 分钟。`,
        tone: "info",
      },
      ...prev,
    ]);
  };

  const handleAbort = () => {
    setShowAbortConfirm(true);
  };

  const confirmAbort = () => {
    setStatus("idle");
    setShowAbortConfirm(false);
    setWarmupProgress(0);
    setLogs((prev) => [
      {
        time: formatClock(new Date()),
        message: `预热已中止，当前热容量停留在 ${currentHeat.toFixed(2)}%。`,
        tone: "warning",
      },
      ...prev,
    ]);
  };

  const resetToRecommended = () => {
    setTargetHeat(recommendedTarget);
    setInputValue(String(recommendedTarget));
  };

  return {
    activePhase,
    confirmAbort,
    currentHeat,
    deltaToTarget,
    estimatedMinutes,
    handleAbort,
    handleStartWarmup,
    handleTargetInput,
    inputValue,
    lastCompletedAt,
    logs,
    normalizeTargetInput,
    recommendedTarget,
    resetToRecommended,
    setLogs,
    setShowAbortConfirm,
    showAbortConfirm,
    status,
    targetHeat,
    warmupProgress,
  };
}
