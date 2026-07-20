import { useEffect, useMemo, useRef, useState } from "react";

import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import { formatCalibrationCombo } from "./labels";
import {
  buildCalibrationCombos,
  clearAirCalibrationState,
  createCalibrationComboKey,
  loadAirCalibrationState,
  loadAirCalibrationStateFromApi,
  saveAirCalibrationState,
} from "./storage";
import type {
  CalibrationCombo,
  CalibrationComboRecord,
  CalibrationCompletedMap,
  CalibrationExecutionStage,
  CalibrationRunStatus,
  CalibrationSelections,
} from "./types";

const INITIAL_SELECTIONS: CalibrationSelections = {
  rotationSpeeds: ["1", "2", "0.75"],
  voltages: ["80", "100", "120", "140"],
  focuses: ["small", "big"],
  collimators: ["32*0.6"],
};

const WAIT_DURATIONS: Record<
  Exclude<CalibrationExecutionStage, "idle" | "paused" | "completed">,
  number
> = {
  validating: 350,
  configuring: 500,
  scanning: 1100,
  "waiting-data": 650,
  computing: 420,
  saving: 360,
};

const ABORT_ERROR_NAME = "AirCalibrationAbort";

const STAGE_LABEL_KEYS: Record<CalibrationExecutionStage, TranslationKey> = {
  idle: "service.airCalibration.stage.ready",
  validating: "service.airCalibration.stage.validating",
  configuring: "service.airCalibration.stage.configuring",
  scanning: "service.airCalibration.stage.scanning",
  "waiting-data": "service.airCalibration.stage.waitingData",
  computing: "service.airCalibration.stage.computing",
  saving: "service.airCalibration.stage.saving",
  paused: "service.airCalibration.stage.paused",
  completed: "service.airCalibration.stage.completed",
};

const createAbortError = () => {
  const error = new Error("Calibration aborted");
  error.name = ABORT_ERROR_NAME;
  return error;
};

const sleep = (durationMs: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    let completed = false;

    const handleAbort = () => {
      if (completed) return;
      window.clearTimeout(timer);
      completed = true;
      reject(createAbortError());
    };

    const timer = window.setTimeout(() => {
      if (completed) return;
      completed = true;
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, durationMs);

    signal.addEventListener("abort", handleAbort, { once: true });
  });

export function useAirCalibration() {
  const { t } = useI18n();
  const persistedState = typeof window === "undefined" ? null : loadAirCalibrationState();
  const [selectionState, setSelectionState] = useState<CalibrationSelections>(
    persistedState?.selections ?? INITIAL_SELECTIONS,
  );
  const [completedCombos, setCompletedCombos] = useState<CalibrationCompletedMap>(
    persistedState?.completedCombos ?? {},
  );
  const [currentComboKey, setCurrentComboKey] = useState<string | null>(
    persistedState?.runStatus === "running" ? null : (persistedState?.currentComboKey ?? null),
  );
  const [runStatus, setRunStatus] = useState<CalibrationRunStatus>(
    persistedState?.runStatus === "running" ? "paused" : (persistedState?.runStatus ?? "idle"),
  );
  const [executionStage, setExecutionStage] = useState<CalibrationExecutionStage>(
    persistedState?.runStatus === "running" ? "paused" : "idle",
  );
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const completedCombosRef = useRef(completedCombos);

  useEffect(() => {
    completedCombosRef.current = completedCombos;
  }, [completedCombos]);

  useEffect(() => {
    void loadAirCalibrationStateFromApi().then((state) => {
      if (state) {
        setSelectionState(state.selections ?? INITIAL_SELECTIONS);
        setCompletedCombos(state.completedCombos ?? {});
        setCurrentComboKey(state.runStatus === "running" ? null : (state.currentComboKey ?? null));
        setRunStatus(state.runStatus === "running" ? "paused" : (state.runStatus ?? "idle"));
      }
      setIsHydrated(true);
    });
  }, []);

  const combos = useMemo(() => buildCalibrationCombos(selectionState), [selectionState]);
  const totalCombinations = combos.length;
  const currentCombo = useMemo(
    () => combos.find((combo) => createCalibrationComboKey(combo) === currentComboKey) ?? null,
    [combos, currentComboKey],
  );
  const completedCount = useMemo(
    () =>
      combos.filter((combo) => completedCombos[createCalibrationComboKey(combo)]?.status === "success").length,
    [combos, completedCombos],
  );
  const failedCount = useMemo(
    () =>
      combos.filter((combo) => completedCombos[createCalibrationComboKey(combo)]?.status === "failed").length,
    [combos, completedCombos],
  );
  const pendingCount = Math.max(0, totalCombinations - completedCount - failedCount);
  const calibrationProgress = totalCombinations === 0 ? 0 : (completedCount / totalCombinations) * 100;
  const isCalibrating = runStatus === "running";
  const stageLabel = t(STAGE_LABEL_KEYS[executionStage]);

  useEffect(() => {
    if (!isHydrated) return;
    saveAirCalibrationState({
      selections: selectionState,
      completedCombos,
      currentComboKey,
      runStatus,
      lastUpdatedAt: new Date().toISOString(),
    });
  }, [completedCombos, currentComboKey, isHydrated, runStatus, selectionState]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const toggleSelection = (key: keyof CalibrationSelections, value: string) => {
    if (isCalibrating) return;

    setSelectionState((prev) => {
      const current = prev[key];
      if (current.includes(value)) {
        if (current.length === 1) return prev;
        return { ...prev, [key]: current.filter((item) => item !== value) };
      }

      return { ...prev, [key]: [...current, value] };
    });
  };

  const resetSelections = () => {
    if (isCalibrating) return;

    abortControllerRef.current?.abort();
    clearAirCalibrationState();
    setSelectionState(INITIAL_SELECTIONS);
    setCompletedCombos({});
    setCurrentComboKey(null);
    setRunStatus("idle");
    setExecutionStage("idle");
    setShowAbortConfirm(false);
  };

  const runStep = async (
    stage: Exclude<CalibrationExecutionStage, "idle" | "paused" | "completed">,
    signal: AbortSignal,
  ) => {
    setExecutionStage(stage);
    await sleep(WAIT_DURATIONS[stage], signal);
  };

  const executeSingleCombo = async (combo: CalibrationCombo, signal: AbortSignal) => {
    const comboKey = createCalibrationComboKey(combo);
    setCurrentComboKey(comboKey);

    await runStep("validating", signal);
    await runStep("configuring", signal);
    await runStep("scanning", signal);
    await runStep("waiting-data", signal);
    await runStep("computing", signal);
    await runStep("saving", signal);

    return {
      combo,
      status: "success",
      timestamp: new Date().toISOString(),
      resultSummary: t("service.airCalibration.result.success", { combo: formatCalibrationCombo(t, combo) }),
    } satisfies CalibrationComboRecord;
  };

  const handleStartCalibration = async () => {
    if (isCalibrating || totalCombinations === 0) return;

    const remainingCombos = combos.filter(
      (combo) => completedCombosRef.current[createCalibrationComboKey(combo)]?.status !== "success",
    );

    if (remainingCombos.length === 0) {
      setExecutionStage("completed");
      setRunStatus("completed");
      setCurrentComboKey(null);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setShowAbortConfirm(false);
    setRunStatus("running");
    setExecutionStage("validating");

    try {
      for (const combo of remainingCombos) {
        const comboKey = createCalibrationComboKey(combo);

        try {
          const result = await executeSingleCombo(combo, controller.signal);
          setCompletedCombos((prev) => ({
            ...prev,
            [comboKey]: result,
          }));
        } catch (error) {
          if ((error as Error).name === ABORT_ERROR_NAME) {
            throw error;
          }

          const message = error instanceof Error ? error.message : t("service.airCalibration.error.unknownFailure");
          setCompletedCombos((prev) => ({
            ...prev,
            [comboKey]: {
              combo,
              status: "failed",
              timestamp: new Date().toISOString(),
              resultSummary: t("service.airCalibration.result.failed", { combo: formatCalibrationCombo(t, combo) }),
              error: message,
            },
          }));
        }
      }

      setExecutionStage("completed");
      setRunStatus("completed");
      setCurrentComboKey(null);
    } catch (error) {
      if ((error as Error).name === ABORT_ERROR_NAME) {
        setExecutionStage("paused");
        setRunStatus("paused");
        setCurrentComboKey(null);
      } else {
        setExecutionStage("paused");
        setRunStatus("paused");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const confirmAbort = () => {
    abortControllerRef.current?.abort();
    setShowAbortConfirm(false);
  };

  return {
    calibrationProgress,
    completedCombos,
    completedCount,
    confirmAbort,
    currentCombo,
    executionStage,
    failedCount,
    handleAbort: () => setShowAbortConfirm(true),
    handleStartCalibration,
    isCalibrating,
    pendingCount,
    resetSelections,
    runStatus,
    selectionState,
    setShowAbortConfirm,
    stageLabel,
    showAbortConfirm,
    toggleSelection,
    totalCombinations,
  };
}
