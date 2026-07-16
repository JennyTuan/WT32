import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Database,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { FeedbackNotice } from "../components/FeedbackNotice";
import {
  buildEngineerLoadPlan,
  loadFourDEngineerManifest,
  resetFourDEngineerManifestCache,
  type FourDEngineerManifest,
  type FourDEngineerVolume,
} from "../lib/fourDEngineerImageSource";
import type { FourDPostScanState } from "../lib/fourDTypes";
import { fetchSelectedFourDPostScanState } from "../lib/fourDResult";
import { loadSelectedPatient } from "../lib/patientSession";
import { useI18n } from "../lib/i18nContext";
import { fetchSelectedScanSession } from "../lib/scanSession";
import { applyScanWorkflowAction, createActionId } from "../lib/scanWorkflowActions";

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"] as const;
const REQUEST_CONCURRENCY = 5;

type LoadStatus = "waiting" | "loading" | "done" | "error";

interface PhaseLoadState {
  phaseIndex: number;
  completedBeds: number;
  totalTargets: number;
  activeBedNumber: number | null;
  activeCandidateNumber: number | null;
  activeFileCount: number;
  activeFileTotal: number;
  previewUrl: string | null;
  latestSourceBedNumber: number | null;
  status: LoadStatus;
  errorMessage: string | null;
}

interface FullscreenImageState {
  phaseIndex: number;
  phaseLabel: string;
  sourceBedNumber: number | null;
  imageUrl: string;
}

const buildInitialPhaseLoads = (): PhaseLoadState[] => PHASE_LABELS.map((_, phaseIndex) => ({
  phaseIndex,
  completedBeds: 0,
  totalTargets: 0,
  activeBedNumber: null,
  activeCandidateNumber: null,
  activeFileCount: 0,
  activeFileTotal: 0,
  previewUrl: null,
  latestSourceBedNumber: null,
  status: "waiting",
  errorMessage: null,
}));

async function fetchArrayBuffer(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.arrayBuffer();
}

async function loadEngineerVolumeSeries(
  volume: FourDEngineerVolume,
  signal: AbortSignal,
  onProgress: (loadedFileCount: number) => void,
) {
  const urls = volume.urls.axialSlices.length > 0 ? volume.urls.axialSlices : [volume.urls.axialPreview];
  let loadedFileCount = 0;
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < urls.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await fetchArrayBuffer(urls[currentIndex], signal);
      loadedFileCount += 1;
      if (loadedFileCount === 1 || loadedFileCount === urls.length || loadedFileCount % 4 === 0) {
        onProgress(loadedFileCount);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(REQUEST_CONCURRENCY, urls.length) }, () => worker()),
  );

  return {
    previewUrl: volume.urls.axialPreview,
    fileCount: urls.length,
  };
}

const resultFileTotal = (volume: FourDEngineerVolume) => volume.urls.axialSlices.length || volume.sliceCount;

function PhaseThumbnail({
  phase,
  totalBeds,
  onDoubleClick,
}: {
  phase: PhaseLoadState;
  totalBeds: number;
  onDoubleClick: (payload: FullscreenImageState) => void;
}) {
  const { t } = useI18n();
  const phaseLabel = PHASE_LABELS[phase.phaseIndex];
  const phaseTargetCount = phase.totalTargets || totalBeds;
  const partialBedProgress =
    phase.activeBedNumber === null ? 0 : phase.activeFileCount / Math.max(phase.activeFileTotal, 1);
  const progressPercent = Math.round(
    ((phase.completedBeds + partialBedProgress) / Math.max(phaseTargetCount, 1)) * 100,
  );
  const canOpenFullscreen = !!phase.previewUrl;
  const statusConfig = {
    waiting: {
      label: phase.completedBeds > 0 ? t("scanFlow.imageLoad.queued") : t("scanFlow.imageLoad.waiting"),
      dot: "bg-slate-400",
      text: "text-slate-300",
      emphasis: "",
      progress: "bg-[#4D94FF]",
    },
    loading: {
      label: t("scanFlow.imageLoad.loadingBed", { bed: phase.activeBedNumber ?? "-" }),
      dot: "bg-[#4D94FF]",
      text: "text-[#BFDBFE]",
      emphasis: "ring-1 ring-inset ring-[#4D94FF]/80 z-[1]",
      progress: "bg-[#4D94FF]",
    },
    done: {
      label: t("scanFlow.imageLoad.completed"),
      dot: "bg-emerald-400",
      text: "text-emerald-300",
      emphasis: "",
      progress: "bg-emerald-400",
    },
    error: {
      label: t("scanFlow.imageLoad.failed"),
      dot: "bg-rose-400",
      text: "text-rose-300",
      emphasis: "ring-1 ring-inset ring-rose-500/80 z-[1]",
      progress: "bg-rose-500",
    },
  }[phase.status];

  return (
    <div className={`group relative h-full min-h-0 overflow-hidden bg-black transition ${statusConfig.emphasis}`}>
      <button
        type="button"
        disabled={!canOpenFullscreen}
        title={canOpenFullscreen ? t("scanFlow.imageLoad.doubleClickOpen") : undefined}
        onDoubleClick={() => {
          if (!phase.previewUrl) return;
          onDoubleClick({
            phaseIndex: phase.phaseIndex,
            phaseLabel,
            sourceBedNumber: phase.latestSourceBedNumber ?? phase.activeBedNumber,
            imageUrl: phase.previewUrl,
          });
        }}
        className="relative block h-full min-h-0 w-full bg-black text-left disabled:cursor-default"
      >
        {phase.previewUrl ? (
          <img src={phase.previewUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,1))]">
            <Database className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-700" size={28} strokeWidth={1.5} />
          </div>
        )}

        <div className="absolute left-2 top-2 flex items-center gap-1.5 bg-black/55 px-2 py-1 text-[10px] font-black text-white backdrop-blur-sm">
          <span className={`h-2 w-2 rounded-full ${statusConfig.dot} ${phase.status === "loading" ? "animate-pulse" : ""}`} />
          <span>Phase {phaseLabel}</span>
        </div>
        <div className="absolute right-2 top-2 bg-black/55 px-2 py-1 font-mono text-[10px] font-black text-slate-100 backdrop-blur-sm">
          {progressPercent}%
        </div>

        {canOpenFullscreen && (
          <div className="absolute left-2 top-8 hidden bg-black/55 px-2 py-1 text-[9px] font-bold text-slate-200 group-hover:block">
            {t("scanFlow.imageLoad.doubleClickZoom")}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/82 to-transparent px-2.5 pb-1.5 pt-6 text-white">
          <div className="mb-1 h-1 overflow-hidden bg-white/15">
            <div
              className={`h-full transition-all ${statusConfig.progress}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-[10px] font-bold ${statusConfig.text}`}>{statusConfig.label}</span>
            {phase.status === "loading" ? (
              <span className="font-mono text-[10px] font-bold text-slate-200">
                {phase.activeFileCount}/{phase.activeFileTotal || 0}
              </span>
            ) : (
              <span className="font-mono text-[10px] font-bold text-slate-300">{phase.completedBeds}/{phaseTargetCount}</span>
            )}
          </div>
          {phase.status === "error" && (
            <div className="mt-1 truncate text-[9px] font-bold text-rose-300">
              {phase.errorMessage ?? t("scanFlow.imageLoad.failed")}
            </div>
          )}
        </div>

        {phase.status === "loading" && (
          <div className="absolute right-2 top-8 flex items-center gap-1 border border-white/10 bg-black/55 px-2 py-1 text-[9px] font-bold text-slate-100">
            <LoaderCircle size={10} className="animate-spin" />
            {t("scanFlow.imageLoad.live")}
          </div>
        )}
      </button>
    </div>
  );
}

export default function ImageLoadScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const routeState = location.state as FourDPostScanState | null;
  const selectedPatient = useMemo(() => loadSelectedPatient(), []);
  const [resolvedState, setResolvedState] = useState<FourDPostScanState | null>(routeState);
  const [isStateVerified, setIsStateVerified] = useState(false);
  const [engineerManifest, setEngineerManifest] = useState<FourDEngineerManifest | null | undefined>(undefined);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isTerminating, setIsTerminating] = useState(false);
  const autoNavigatedRef = useRef(false);
  const terminateActionIdRef = useRef<string | null>(null);

  const phaseFilterState = useMemo<FourDPostScanState | null>(
    () => resolvedState && isStateVerified
      ? { ...resolvedState, showSliceLoadingBeforeImageLoad: false }
      : null,
    [isStateVerified, resolvedState],
  );

  const [fullscreenImage, setFullscreenImage] = useState<FullscreenImageState | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPatient) return;
    let cancelled = false;
    fetchSelectedFourDPostScanState(selectedPatient.id)
      .then((state) => {
        if (!cancelled) {
          setResolvedState(state);
          setIsStateVerified(true);
          setGlobalError(null);
          if (state.workflowStage === "acquired" && state.scanResult.rescanOccurred) {
            navigate("/fourd-rescan-select", { replace: true, state });
          } else if (state.workflowStage === "phase_selected" || state.workflowStage === "ready") {
            navigate("/phase-filter", { replace: true, state });
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setIsStateVerified(false);
        if (!cancelled) setGlobalError(error instanceof Error ? error.message : "4D 结果恢复失败");
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, navigate, selectedPatient]);
  const [phaseLoads, setPhaseLoads] = useState<PhaseLoadState[]>(buildInitialPhaseLoads);

  useEffect(() => {
    let cancelled = false;
    loadFourDEngineerManifest().then((manifest) => {
      if (!cancelled) setEngineerManifest(manifest);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (engineerManifest === undefined || !resolvedState || !isStateVerified) return;

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      setGlobalError(null);
      if (!engineerManifest) {
        setGlobalError("本次 4D 模拟结果缺少已绑定的工程影像清单，不能继续后处理。");
        setPhaseLoads((previous) => previous.map((phase) => ({ ...phase, status: "error" })));
        return;
      }
      const scanResult = resolvedState.scanResult;
      const manifestMatchesResult = resolvedState.imageSourceId === "fourd-engineer"
        && resolvedState.imageSourceVersion === 1
        && engineerManifest.version === resolvedState.imageSourceVersion
        && engineerManifest.bedCount === scanResult.bedCount
        && engineerManifest.phaseCount === scanResult.phaseCount
        && scanResult.phaseMatrix.every((row, bedIndex) =>
          row.every((cell, phaseIndex) => (
            engineerManifest.volumes.filter(
              (volume) => volume.bedIndex === bedIndex && volume.phaseIndex === phaseIndex,
            ).length === cell.frameCount
          )),
        );
      if (!manifestMatchesResult) {
        setGlobalError("本次 4D 结果与工程影像清单不匹配，已停止加载以避免影像误配。");
        setPhaseLoads((previous) => previous.map((phase) => ({ ...phase, status: "error" })));
        return;
      }
      const phaseTargetCounts = PHASE_LABELS.map((_, phaseIndex) =>
        engineerManifest.volumes.filter((volume) => volume.phaseIndex === phaseIndex).length,
      );
      setPhaseLoads(
        PHASE_LABELS.map((_, phaseIndex) => ({
          phaseIndex,
          completedBeds: 0,
          totalTargets: phaseTargetCounts[phaseIndex] ?? 0,
          activeBedNumber: null,
          activeCandidateNumber: null,
          activeFileCount: 0,
          activeFileTotal: engineerManifest.sliceCountPerVolume,
          previewUrl: null,
          latestSourceBedNumber: null,
          status: "waiting",
          errorMessage: null,
        })),
      );

      {
        const loadPlan = buildEngineerLoadPlan(engineerManifest);

        for (const volume of loadPlan) {
          if (cancelled) return;
          const phaseIndex = volume.phaseIndex;
          const bedNumber = volume.bedNumber;

          setPhaseLoads((prev) =>
            prev.map((phase) =>
              phase.phaseIndex !== phaseIndex
                ? phase
                : {
                    ...phase,
                    activeBedNumber: bedNumber,
                    activeCandidateNumber: volume.candidateIndex + 1,
                    activeFileCount: 0,
                    activeFileTotal: volume.urls.axialSlices.length || volume.sliceCount,
                    status: "loading",
                    errorMessage: null,
                  },
            ),
          );

          try {
            const result = await loadEngineerVolumeSeries(
              volume,
              controller.signal,
              (loadedFileCount) => {
                if (cancelled) return;
                setPhaseLoads((prev) =>
                  prev.map((phase) =>
                    phase.phaseIndex !== phaseIndex
                      ? phase
                      : {
                          ...phase,
                          activeBedNumber: bedNumber,
                          activeCandidateNumber: volume.candidateIndex + 1,
                          activeFileCount: loadedFileCount,
                          activeFileTotal: resultFileTotal(volume),
                          status: "loading",
                        },
                  ),
                );
              },
            );

            if (cancelled) return;

            setPhaseLoads((prev) =>
              prev.map((phase) =>
                phase.phaseIndex !== phaseIndex
                  ? phase
                  : {
                      ...phase,
                      completedBeds: phase.completedBeds + 1,
                      activeBedNumber: null,
                      activeCandidateNumber: null,
                      activeFileCount: 0,
                      activeFileTotal: result.fileCount,
                      previewUrl: result.previewUrl ?? phase.previewUrl,
                      latestSourceBedNumber: bedNumber,
                      status: phase.completedBeds + 1 >= phase.totalTargets ? "done" : "waiting",
                      errorMessage: null,
                    },
              ),
            );
          } catch (error) {
            if (controller.signal.aborted) return;
            const message = error instanceof Error ? error.message : String(error);
            setGlobalError(t("scanFlow.imageLoad.globalError", {
              bed: bedNumber,
              phase: PHASE_LABELS[phaseIndex],
              message,
            }));
            setPhaseLoads((prev) =>
              prev.map((phase) =>
                phase.phaseIndex !== phaseIndex
                  ? phase
                  : {
                      ...phase,
                      activeBedNumber: null,
                      activeCandidateNumber: null,
                      activeFileCount: 0,
                      status: "error",
                      errorMessage: message,
                    },
              ),
            );
            return;
          }
        }
        return;
      }

    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [engineerManifest, isStateVerified, resolvedState, t]);

  const totalBeds = engineerManifest?.bedCount ?? 0;
  const completedTaskCount = phaseLoads.reduce((sum, phase) => sum + phase.completedBeds, 0);
  const totalTaskCount = phaseLoads.reduce((sum, phase) => sum + phase.totalTargets, 0);
  const allLoaded = !!engineerManifest
    && isStateVerified
    && totalTaskCount > 0
    && completedTaskCount === totalTaskCount
    && !globalError;
  const overallProgress = Math.round((completedTaskCount / Math.max(totalTaskCount, 1)) * 100);
  const donePhaseCount = phaseLoads.filter((phase) => phase.status === "done").length;
  const hasLoadFailure = !!globalError || phaseLoads.some((phase) => phase.status === "error");

  const retryLoad = () => {
    resetFourDEngineerManifestCache();
    autoNavigatedRef.current = false;
    setFullscreenImage(null);
    setGlobalError(null);
    setEngineerManifest(undefined);
    setIsStateVerified(false);
    setPhaseLoads(buildInitialPhaseLoads());
    setLoadAttempt((attempt) => attempt + 1);
  };

  const terminateFailedExam = async () => {
    if (isTerminating) return;
    const binding = resolvedState ?? routeState;
    if (!binding?.scanSessionId || !binding.targetSeriesId || !selectedPatient) {
      setGlobalError("缺少患者、扫描会话或 4D 目标序列绑定，无法安全终止检查");
      return;
    }
    setIsTerminating(true);
    try {
      const latestSession = await fetchSelectedScanSession({ preferCache: false });
      if (
        !latestSession
        || latestSession.id !== binding.scanSessionId
        || latestSession.patient_id !== selectedPatient.id
        || !latestSession.series.some((series) => series.id === binding.targetSeriesId && series.series_type === "4d")
      ) {
        throw new Error("患者、扫描会话或 4D 目标序列已切换，未执行终止动作");
      }
      const actionId = terminateActionIdRef.current ?? createActionId();
      terminateActionIdRef.current = actionId;
      await applyScanWorkflowAction(latestSession.id, {
        action_id: actionId,
        action: "terminate_exam",
        target_series_id: binding.targetSeriesId,
        reason: "User terminated the simulated 4D exam after image loading failed",
      });
      terminateActionIdRef.current = null;
      navigate("/patients");
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "终止检查失败，请重试或返回患者列表");
    } finally {
      setIsTerminating(false);
    }
  };

  useEffect(() => {
    if (!allLoaded || !phaseFilterState || autoNavigatedRef.current) return;
    autoNavigatedRef.current = true;
    const timer = window.setTimeout(() => {
      navigate("/phase-filter", { state: phaseFilterState });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [allLoaded, navigate, phaseFilterState]);

  return (
    <div className="relative flex h-full select-none flex-col bg-[#E5E7EB] text-slate-700">
      <header className="shrink-0 border-b border-slate-300 bg-[#F8FAFC] px-5 py-3">
        <div className="flex items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={17} className="text-[#1E64F0]" />
              <h1 className="text-[15px] font-black text-slate-800">{t("scanFlow.imageLoad.title")}</h1>
            </div>
            <div className="mt-1 text-[11px] font-medium text-slate-500">
              {t("scanFlow.imageLoad.subtitle")}
            </div>
          </div>
          <div className="grid w-[280px] grid-cols-2 gap-2">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] font-black uppercase text-slate-400">{t("scanFlow.imageLoad.overall")}</div>
              <div className="mt-0.5 text-[18px] font-black tabular-nums text-slate-800">{overallProgress}%</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] font-black uppercase text-slate-400">{t("scanFlow.imageLoad.phase")}</div>
              <div className="mt-0.5 text-[18px] font-black tabular-nums text-slate-800">{donePhaseCount}/{PHASE_LABELS.length}</div>
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-[#1E64F0] transition-all duration-300" style={{ width: `${overallProgress}%` }} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {globalError && (
            <FeedbackNotice className="absolute left-4 right-4 top-[92px] z-10 shadow-lg">
              {globalError}
            </FeedbackNotice>
          )}

          <div className="min-h-0 flex-1 overflow-hidden bg-[#071426]">
            <div className="grid h-full min-h-0 grid-cols-5 grid-rows-2 gap-px">
              {phaseLoads.map((phase) => (
                <PhaseThumbnail
                  key={phase.phaseIndex}
                  phase={phase}
                  totalBeds={totalBeds}
                  onDoubleClick={setFullscreenImage}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer className="flex h-[72px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3 text-[12px]">
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[#1565C0]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1E64F0] text-[11px] font-black text-white">1</span>
            <span className="font-bold">{t("scanFlow.phaseFilter.imageLoadStep")}</span>
          </div>
          <div className="h-px w-6 bg-slate-300" />
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-black text-slate-700">2</span>
            <span className="font-medium">{t("scanFlow.phaseFilter.phaseFilterStep")}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasLoadFailure && (
            <>
              <button
                type="button"
                onClick={() => { void terminateFailedExam(); }}
                disabled={isTerminating}
                className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-[12px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {isTerminating ? "正在终止…" : "终止检查"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/patients")}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 hover:bg-slate-50"
              >
                返回患者列表
              </button>
              <button
                type="button"
                onClick={retryLoad}
                className="flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-[12px] font-bold text-[#1D4ED8] hover:bg-blue-100"
              >
                <RefreshCw size={13} />
                重试加载
              </button>
            </>
          )}
          {allLoaded && (
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-600">
              <CheckCircle2 size={15} />
              {t("scanFlow.imageLoad.allLoaded")}
            </div>
          )}
          <button
            onClick={() => {
              if (phaseFilterState) navigate("/phase-filter", { state: phaseFilterState });
            }}
            disabled={!allLoaded || !phaseFilterState}
            className={`flex items-center gap-1.5 rounded-md px-6 py-2 text-[12px] font-bold text-white shadow-sm ${
              !allLoaded || !phaseFilterState ? "cursor-not-allowed bg-slate-300" : "bg-[#4D94FF] hover:bg-blue-600"
            }`}
          >
            {t("scanFlow.imageLoad.nextPhaseFilter")} <ChevronRight size={14} />
          </button>
        </div>
      </footer>

      {fullscreenImage && (
        <div className="absolute inset-0 z-50 bg-black">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between bg-gradient-to-b from-black/75 via-black/35 to-transparent px-6 py-5 text-white">
            <div className="pointer-events-auto">
              <div className="text-[18px] font-bold">
                {t("scanFlow.imageLoad.fullscreenPhase", { phase: fullscreenImage.phaseLabel })}
              </div>
              <div className="mt-1 text-[12px] text-slate-300">
                {t("scanFlow.imageLoad.fullscreenSubtitle", { bed: fullscreenImage.sourceBedNumber ?? "-" })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenImage(null)}
              className="pointer-events-auto rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-white/15"
            >
              {t("scanFlow.imageLoad.close")}
            </button>
          </div>
          <button
            type="button"
            onDoubleClick={() => setFullscreenImage(null)}
            className="block h-full w-full bg-black"
          >
            <img
              src={fullscreenImage.imageUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-contain"
            />
          </button>
        </div>
      )}
    </div>
  );
}
