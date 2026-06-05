import { useMemo, useState } from "react";

import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import { loadDailyQaRecords, saveDailyQaRecords } from "./storage";
import type {
  DailyQaMetricResult,
  DailyQaRecord,
  MetricKey,
  PhantomImageData,
  PhantomType,
  QACardItem,
  RoiPoint,
} from "./types";

const TODAY = new Date().toISOString().slice(0, 10);
const OPERATOR_NAME = "Operator A";
const DEVICE_NAME = "CT Simulator A1";
export const ALL_PHANTOMS = "all";

const NOISE_LIMIT = 3.0;
const UNIFORMITY_LIMIT = 4.0;
const WATER_REFERENCE = 0;
const WATER_TOLERANCE = 4;
const AIR_REFERENCE = -1000;
const AIR_TOLERANCE = 10;

type Translate = ReturnType<typeof useI18n>["t"];
type AnalysisStage = "pending" | "acquiring" | "roi" | "calculating" | "done";

const STAGE_LABEL_KEYS: Record<AnalysisStage, TranslationKey> = {
  pending: "service.dailyQa.stage.pending",
  acquiring: "service.dailyQa.stage.acquiring",
  roi: "service.dailyQa.stage.roi",
  calculating: "service.dailyQa.stage.calculating",
  done: "service.dailyQa.stage.done",
};

const AUTO_ROI: Record<MetricKey, RoiPoint[]> = {
  noise: [{ x: 50, y: 50 }],
  uniformity: [
    { x: 50, y: 50 },
    { x: 50, y: 20 },
    { x: 80, y: 50 },
    { x: 50, y: 80 },
    { x: 20, y: 50 },
  ],
  accuracy: [
    { x: 36, y: 50 },
    { x: 70, y: 36 },
  ],
};

const createDefaultRoiState = () => ({
  noise: AUTO_ROI.noise,
  uniformity: AUTO_ROI.uniformity,
  accuracy: AUTO_ROI.accuracy,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const distance = (point: RoiPoint, target: RoiPoint) => {
  const dx = point.x - target.x;
  const dy = point.y - target.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const formatFixed = (value: number, digits = 2) => value.toFixed(digits);

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const simulatePhantomImage = (phantomType: PhantomType, date: string): PhantomImageData => ({
  id: createId(),
  acquiredAt: new Date().toISOString(),
  phantomType,
  seed: Array.from(`${phantomType}-${date}`).reduce((sum, char) => sum + char.charCodeAt(0), 0),
});

const computeNoiseResult = (roi: RoiPoint[], t: Translate): DailyQaMetricResult & { value: number } => {
  const center = roi[0];
  const offset = distance(center, AUTO_ROI.noise[0]);
  const value = Number((2.18 + offset * 0.045).toFixed(2));
  const status = value <= NOISE_LIMIT ? "PASS" : "FAIL";
  return {
    key: "noise",
    title: t("service.dailyQa.metric.noise"),
    limit: `≤ ${NOISE_LIMIT.toFixed(1)}`,
    actual: formatFixed(value),
    status,
    summary: t("service.dailyQa.metric.noiseSummary", { value: formatFixed(value) }),
    value,
  };
};

const computeUniformityResult = (roi: RoiPoint[], t: Translate): DailyQaMetricResult & { value: number } => {
  const center = roi[0];
  const peripherals = roi.slice(1);
  const avgOffset =
    peripherals.reduce((sum, point, index) => sum + distance(point, AUTO_ROI.uniformity[index + 1]), 0) /
    Math.max(peripherals.length, 1);
  const value = Number((1.95 + avgOffset * 0.06 + distance(center, AUTO_ROI.uniformity[0]) * 0.02).toFixed(2));
  const status = value <= UNIFORMITY_LIMIT ? "PASS" : "FAIL";
  return {
    key: "uniformity",
    title: t("service.dailyQa.metric.uniformity"),
    limit: `≤ ${UNIFORMITY_LIMIT.toFixed(1)} HU`,
    actual: `${formatFixed(value)} HU`,
    status,
    summary: t("service.dailyQa.metric.uniformitySummary", { value: formatFixed(value) }),
    value,
  };
};

const computeAccuracyResult = (roi: RoiPoint[], t: Translate): DailyQaMetricResult & { value: number } => {
  const waterOffset = distance(roi[0], AUTO_ROI.accuracy[0]);
  const airOffset = distance(roi[1], AUTO_ROI.accuracy[1]);
  const waterValue = Number((WATER_REFERENCE + waterOffset * 0.22 - 0.9).toFixed(2));
  const airValue = Number((AIR_REFERENCE + airOffset * 0.95 + 2.5).toFixed(2));
  const waterPass = Math.abs(waterValue - WATER_REFERENCE) <= WATER_TOLERANCE;
  const airPass = Math.abs(airValue - AIR_REFERENCE) <= AIR_TOLERANCE;
  const status = waterPass && airPass ? "PASS" : "FAIL";
  const combined = Math.max(Math.abs(waterValue - WATER_REFERENCE), Math.abs(airValue - AIR_REFERENCE));

  return {
    key: "accuracy",
    title: t("service.dailyQa.metric.accuracy"),
    limit: `Water ${WATER_REFERENCE}±${WATER_TOLERANCE}, Air ${AIR_REFERENCE}±${AIR_TOLERANCE}`,
    actual: `W ${formatFixed(waterValue)} / A ${formatFixed(airValue)}`,
    status,
    summary: `Water ${formatFixed(waterValue)} HU, Air ${formatFixed(airValue)} HU`,
    value: Number(combined.toFixed(2)),
  };
};

export function useDailyQa() {
  const { t } = useI18n();
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [phantomType, setPhantomType] = useState<PhantomType>("水模");
  const [showAnalyzeConfirm, setShowAnalyzeConfirm] = useState(false);
  const [isRunningQa, setIsRunningQa] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>("pending");
  const [roiState, setRoiState] = useState(createDefaultRoiState());
  const [phantomImage, setPhantomImage] = useState<PhantomImageData | null>(null);
  const [records, setRecords] = useState<DailyQaRecord[]>(() => loadDailyQaRecords());
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [recordPhantomFilter, setRecordPhantomFilter] = useState<PhantomType | typeof ALL_PHANTOMS>(ALL_PHANTOMS);
  const [recordDateFilter, setRecordDateFilter] = useState("");
  const [previewRecordId, setPreviewRecordId] = useState<string | null>(null);

  const metrics = useMemo(() => {
    if (!phantomImage) {
      return [
        { key: "noise", title: t("service.dailyQa.metric.noise"), limit: `≤ ${NOISE_LIMIT.toFixed(1)}`, actual: "-", status: "FAIL", summary: t("service.dailyQa.waiting"), value: 0 },
        { key: "uniformity", title: t("service.dailyQa.metric.uniformity"), limit: `≤ ${UNIFORMITY_LIMIT.toFixed(1)} HU`, actual: "-", status: "FAIL", summary: t("service.dailyQa.waiting"), value: 0 },
        { key: "accuracy", title: t("service.dailyQa.metric.accuracy"), limit: `Water ${WATER_REFERENCE}±${WATER_TOLERANCE}, Air ${AIR_REFERENCE}±${AIR_TOLERANCE}`, actual: "-", status: "FAIL", summary: t("service.dailyQa.waiting"), value: 0 },
      ] as Array<DailyQaMetricResult & { value: number }>;
    }

    return [
      computeNoiseResult(roiState.noise, t),
      computeUniformityResult(roiState.uniformity, t),
      computeAccuracyResult(roiState.accuracy, t),
    ];
  }, [phantomImage, roiState, t]);

  const cards = useMemo<QACardItem[]>(
    () => [
      { ...metrics[0], viewportLabel: t("service.dailyQa.viewport.centerRoi"), roiPoints: roiState.noise, roiShape: "circle" },
      { ...metrics[1], viewportLabel: t("service.dailyQa.viewport.centerPeripheralRoi"), roiPoints: roiState.uniformity, roiShape: "dot" },
      { ...metrics[2], viewportLabel: "Water / Air ROI", roiPoints: roiState.accuracy, roiShape: "dot" },
    ],
    [metrics, roiState, t],
  );

  const overallJudgment: "PASS" | "FAIL" = metrics.every((metric) => metric.status === "PASS") ? "PASS" : "FAIL";

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const matchPhantom = recordPhantomFilter === ALL_PHANTOMS || record.phantomType === recordPhantomFilter;
        const matchDate = !recordDateFilter || record.date === recordDateFilter;
        return matchPhantom && matchDate;
      }),
    [recordDateFilter, recordPhantomFilter, records],
  );

  const previewRecord = records.find((record) => record.id === previewRecordId) ?? null;

  const updateRoiPoint = (metric: MetricKey, pointIndex: number, nextPoint: RoiPoint) => {
    setRoiState((prev) => ({
      ...prev,
      [metric]: prev[metric].map((point, index) =>
        index === pointIndex
          ? { x: clamp(nextPoint.x, 8, 92), y: clamp(nextPoint.y, 8, 92) }
          : point,
      ),
    }));
  };

  const runQa = async () => {
    setShowAnalyzeConfirm(false);
    setIsRunningQa(true);
    setAnalysisStage("acquiring");

    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const image = simulatePhantomImage(phantomType, selectedDate);
    setPhantomImage(image);
    setRoiState(createDefaultRoiState());

    setAnalysisStage("roi");
    await new Promise((resolve) => window.setTimeout(resolve, 300));

    setAnalysisStage("calculating");
    await new Promise((resolve) => window.setTimeout(resolve, 500));

    const nextMetrics = [
      computeNoiseResult(AUTO_ROI.noise, t),
      computeUniformityResult(AUTO_ROI.uniformity, t),
      computeAccuracyResult(AUTO_ROI.accuracy, t),
    ];
    const judgment = nextMetrics.every((metric) => metric.status === "PASS") ? "PASS" : "FAIL";
    const timestamp = new Date();
    const record: DailyQaRecord = {
      id: createId(),
      date: selectedDate,
      time: timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      phantomType,
      operator: OPERATOR_NAME,
      deviceName: DEVICE_NAME,
      judgment,
      noiseVal: nextMetrics[0].value,
      uniformityVal: nextMetrics[1].value,
      accuracyVal: nextMetrics[2].value,
      cards: nextMetrics.map((metric) => ({
        key: metric.key,
        title: metric.title,
        limit: metric.limit,
        actual: metric.actual,
        status: metric.status,
        summary: metric.summary,
      })),
      image,
    };

    const nextRecords = [record, ...records];
    setRecords(nextRecords);
    saveDailyQaRecords(nextRecords);
    setIsRunningQa(false);
    setAnalysisStage("done");
  };

  const toggleRecordSelection = (recordId: string) => {
    setSelectedRecordIds((prev) =>
      prev.includes(recordId) ? prev.filter((id) => id !== recordId) : [...prev, recordId],
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredRecords.map((record) => record.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedRecordIds.includes(id));
    setSelectedRecordIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const previewSelected = () => {
    if (selectedRecordIds.length === 0) return;
    setPreviewRecordId(selectedRecordIds[0]);
  };

  return {
    analysisStage: t(STAGE_LABEL_KEYS[analysisStage]),
    cards,
    filteredRecords,
    isRunningQa,
    onAnalyze: () => setShowAnalyzeConfirm(true),
    onConfirmAnalyze: runQa,
    onPreviewRecord: setPreviewRecordId,
    onRecordDateFilterChange: setRecordDateFilter,
    onRecordPhantomFilterChange: setRecordPhantomFilter,
    onRoiPointChange: updateRoiPoint,
    onToggleRecordSelection: toggleRecordSelection,
    onToggleSelectAllVisible: toggleSelectAllVisible,
    onViewSelected: previewSelected,
    overallJudgment,
    phantomImage,
    phantomType,
    previewRecord,
    recordDateFilter,
    recordPhantomFilter,
    selectedDate,
    selectedRecordIds,
    setPhantomType,
    setPreviewRecordId,
    setSelectedDate,
    setShowAnalyzeConfirm,
    showAnalyzeConfirm,
  };
}
