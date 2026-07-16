import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import {
  getEngineerVolumesForBedPhase,
  loadFourDEngineerManifest,
  type FourDEngineerManifest,
  type FourDEngineerVolume,
} from "../lib/fourDEngineerImageSource";
import {
  fetchFourDResult,
  fetchSelectedFourDPostScanState,
  finalizeFourDResult,
  saveFourDResult,
  toFourDPostScanState,
} from "../lib/fourDResult";
import { loadSelectedPatient } from "../lib/patientSession";
import {
  fetchSelectedScanSession,
} from "../lib/scanSession";
import type { FourDPostScanState, FourDScanResult, PhaseSelections } from "../lib/fourDTypes";
import { useI18n } from "../lib/i18nContext";
import { arePhaseSelectionsEqual } from "../lib/fourDPhaseSelection";

type PhaseStatus = "ok" | "duplicate" | "missing";

interface DataSegment {
  id: string;
  volumeId?: string;
  time: string;
  candidateIndex: number;
  range: string;
  sliceCount: number;
  previewUrls?: {
    axial: string;
    coronal: string;
    coronalStrip?: string;
    sagittal: string;
    sagittalStrip?: string;
  };
}

interface BedPhaseData {
  id: string;
  bedNo: number;
  range: string;
  segments: DataSegment[];
  selectedSegmentId?: string;
}

interface PhaseData {
  label: string;
  status: PhaseStatus;
  beds: BedPhaseData[];
}

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];
function makeSegment(idx: number, phaseIdx: number, bedIdx: number): DataSegment {
  return {
    id: `seg-${phaseIdx}-${bedIdx}-${idx}`,
    time: "--",
    candidateIndex: idx + 1,
    range: "--",
    sliceCount: 0,
  };
}

function formatRangeMm(range: [number, number]) {
  return `${range[0].toFixed(1)} - ${range[1].toFixed(1)} mm`;
}

function segmentFromVolume(volume: FourDEngineerVolume): DataSegment {
  return {
    id: volume.id,
    volumeId: volume.id,
    time: volume.acquisitionTime || "--",
    candidateIndex: volume.candidateIndex + 1,
    range: formatRangeMm(volume.rangeMm),
    sliceCount: volume.sliceCount,
    previewUrls: {
      axial: volume.urls.axialPreview,
      coronal: volume.urls.coronalPreview,
      coronalStrip: volume.urls.coronalStrip,
      sagittal: volume.urls.sagittalPreview,
      sagittalStrip: volume.urls.sagittalStrip,
    },
  };
}

function buildPersistedPhases(
  scanResult: FourDScanResult,
  phaseSelections: PhaseSelections | undefined,
  manifest: FourDEngineerManifest | null | undefined,
): PhaseData[] {
  return Array.from({ length: scanResult.phaseCount }, (_, phaseIndex) => {
    const label = manifest?.phaseLabels[phaseIndex]
      ?? PHASE_LABELS[phaseIndex]
      ?? `${Math.round((phaseIndex / scanResult.phaseCount) * 100)}%`;
    const beds: BedPhaseData[] = [];

    for (let bedIndex = 0; bedIndex < scanResult.bedCount; bedIndex += 1) {
      const cell = scanResult.phaseMatrix[bedIndex]?.[phaseIndex];
      if (!cell || cell.frameCount <= 1) continue;
      const volumes = manifest ? getEngineerVolumesForBedPhase(manifest, bedIndex, phaseIndex) : [];
      const segments = Array.from({ length: cell.frameCount }, (_, candidateIndex) => {
        const volume = volumes[candidateIndex];
        return volume ? segmentFromVolume(volume) : makeSegment(candidateIndex, phaseIndex, bedIndex);
      });
      const selectedCandidateIndex = phaseSelections?.[`${bedIndex}-${phaseIndex}`];
      beds.push({
        id: `bed-${phaseIndex}-${String(bedIndex + 1).padStart(2, "0")}`,
        bedNo: bedIndex + 1,
        range: volumes[0]
          ? formatRangeMm(volumes[0].rangeMm)
          : "--",
        segments,
        selectedSegmentId:
          selectedCandidateIndex === undefined ? undefined : segments[selectedCandidateIndex]?.id,
      });
    }

    return {
      label,
      status: beds.length > 0 ? "duplicate" : "ok",
      beds,
    };
  });
}

function isBoundFourDState(state: FourDPostScanState | null): state is FourDPostScanState & {
  scanSessionId: number;
  targetSeriesId: number;
  resultVersion: number;
} {
  return !!state
    && Number.isFinite(state.scanSessionId)
    && Number.isFinite(state.targetSeriesId)
    && Number.isFinite(state.resultVersion);
}

function MprTile({
  label,
  phaseLabel,
  children,
}: {
  label: string;
  phaseLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-full overflow-hidden bg-black">
      <div className="pointer-events-none absolute left-3 top-2 z-10 text-[20px] font-black tracking-[0.12em] text-white/90">
        {label}
      </div>
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-2">
        <span className="rounded bg-[#1E64F0] px-2.5 py-1 text-[11px] font-black text-white">PHASE {phaseLabel}</span>
      </div>
      <div className="flex h-full w-full items-center justify-center">{children}</div>
    </div>
  );
}

function BedCodeRail({
  bedCount,
  activeBedNumber,
  side,
}: {
  bedCount: number;
  activeBedNumber: number | null;
  side: "left" | "right";
}) {
  const sideClass = side === "left" ? "left-1" : "right-1";

  return (
    <div className={`pointer-events-none absolute bottom-0 top-0 ${sideClass} z-10 flex w-6 flex-col gap-1`}>
      {Array.from({ length: bedCount }).map((_, idx) => {
        const bedNumber = idx + 1;
        const isActive = activeBedNumber === bedNumber;

        return (
          <div
            key={bedNumber}
            className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm ${
              isActive
                ? "bg-red-500 shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_0_12px_rgba(239,68,68,0.45)]"
                : "bg-emerald-500 shadow-[0_0_0_1px_rgba(255,255,255,0.14)]"
            }`}
            aria-hidden="true"
          >
            <span className="text-[9px] font-black leading-none text-white">
              {String(bedNumber).padStart(2, "0")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CrossHair({ horizontalClass, verticalClass }: { horizontalClass: string; verticalClass: string }) {
  return (
    <>
      <div className={`absolute left-0 right-0 top-1/2 h-px ${horizontalClass}`} />
      <div className={`absolute bottom-0 left-1/2 top-0 w-px ${verticalClass}`} />
      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90" />
    </>
  );
}

function PreviewFrame({
  src,
  bedCount,
  activeBedNumber,
  side,
  horizontalClass,
  verticalClass,
}: {
  src: string;
  bedCount: number;
  activeBedNumber: number | null;
  side: "left" | "right";
  horizontalClass: string;
  verticalClass: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const updateSize = () => {
      const { clientWidth, clientHeight } = el;
      setFrameSize(Math.max(0, Math.min(clientWidth, clientHeight)));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="relative h-full w-full bg-black">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: `${frameSize}px`,
          height: `${frameSize}px`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
        <BedCodeRail bedCount={bedCount} activeBedNumber={activeBedNumber} side={side} />
        <CrossHair horizontalClass={horizontalClass} verticalClass={verticalClass} />
      </div>
    </div>
  );
}

interface StitchedPreviewRow {
  bedNumber: number;
  src: string;
}

function StitchedPreviewFrame({
  rows,
  bedCount,
  activeBedNumber,
  side,
  horizontalClass,
  verticalClass,
}: {
  rows: StitchedPreviewRow[];
  bedCount: number;
  activeBedNumber: number | null;
  side: "left" | "right";
  horizontalClass: string;
  verticalClass: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const updateSize = () => {
      const { clientWidth, clientHeight } = el;
      setFrameSize(Math.max(0, Math.min(clientWidth, clientHeight)));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="relative h-full w-full bg-black">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: `${frameSize}px`,
          height: `${frameSize}px`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="grid h-full w-full bg-black" style={{ gridTemplateRows: `repeat(${bedCount}, minmax(0, 1fr))` }}>
          {Array.from({ length: bedCount }).map((_, idx) => {
            const bedNumber = idx + 1;
            const row = rows.find((item) => item.bedNumber === bedNumber);

            return (
              <div key={bedNumber} className="min-h-0 overflow-hidden bg-black">
                {row && <img src={row.src} alt="" draggable={false} className="h-full w-full object-fill" />}
              </div>
            );
          })}
        </div>
        <BedCodeRail bedCount={bedCount} activeBedNumber={activeBedNumber} side={side} />
        <CrossHair horizontalClass={horizontalClass} verticalClass={verticalClass} />
      </div>
    </div>
  );
}

export default function PhaseFilterScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const routeState = location.state as FourDPostScanState | null;
  const [resolvedState, setResolvedState] = useState<FourDPostScanState | null>(() =>
    isBoundFourDState(routeState) ? routeState : null,
  );
  const [stateLoadStatus, setStateLoadStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [workflowError, setWorkflowError] = useState("");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [engineerManifest, setEngineerManifest] = useState<FourDEngineerManifest | null | undefined>(undefined);

  const [phases, setPhases] = useState<PhaseData[]>([]);
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
  const [selectedBedId, setSelectedBedId] = useState("");

  const currentPhase = phases[selectedPhaseIdx] ?? null;
  const selectedBed = currentPhase?.beds.find((bed) => bed.id === selectedBedId) ?? currentPhase?.beds[0] ?? null;
  const selectedSegment = selectedBed
    ? selectedBed.segments.find((segment) => segment.id === selectedBed.selectedSegmentId) ?? selectedBed.segments[0] ?? null
    : null;
  const previewUrls = useMemo(
    () => ({
      coronal: selectedSegment?.previewUrls?.coronal ?? null,
      sagittal: selectedSegment?.previewUrls?.sagittal ?? null,
    }),
    [selectedSegment],
  );
  const engineerStitchedPreviewRows = useMemo(() => {
    if (!engineerManifest) return null;

    const selectedVolumeIdsByBed = new Map<number, string>();
    currentPhase?.beds.forEach((bed) => {
      if (bed.selectedSegmentId) selectedVolumeIdsByBed.set(bed.bedNo, bed.selectedSegmentId);
    });
    if (selectedBed && selectedSegment?.volumeId) {
      selectedVolumeIdsByBed.set(selectedBed.bedNo, selectedSegment.volumeId);
    }

    const rows = Array.from({ length: engineerManifest.bedCount }, (_, bedIndex) => {
      const volumes = getEngineerVolumesForBedPhase(engineerManifest, bedIndex, selectedPhaseIdx);
      const selectedVolumeId = selectedVolumeIdsByBed.get(bedIndex + 1);
      const volume = volumes.find((item) => item.id === selectedVolumeId) ?? volumes[0];
      if (!volume) return null;

      return {
        bedNumber: bedIndex + 1,
        coronal: volume.urls.coronalStrip ?? volume.urls.coronalPreview,
        sagittal: volume.urls.sagittalStrip ?? volume.urls.sagittalPreview,
      };
    });

    return rows.every((row) => !!row) ? rows : null;
  }, [currentPhase, engineerManifest, selectedBed, selectedPhaseIdx, selectedSegment]);
  const isManifestVerified = useMemo(() => {
    if (!engineerManifest || !resolvedState) return false;
    const result = resolvedState.scanResult;
    return resolvedState.imageSourceId === "fourd-engineer"
      && resolvedState.imageSourceVersion === 1
      && engineerManifest.version === resolvedState.imageSourceVersion
      && engineerManifest.bedCount === result.bedCount
      && engineerManifest.phaseCount === result.phaseCount
      && result.phaseMatrix.every((row, bedIndex) =>
        row.every((cell, phaseIndex) => (
          getEngineerVolumesForBedPhase(engineerManifest, bedIndex, phaseIndex).length === cell.frameCount
        )),
      );
  }, [engineerManifest, resolvedState]);
  const activeBedNumber = selectedBed?.bedNo ?? null;
  const bedCodeCount = Math.max(1, resolvedState?.scanResult.bedCount ?? 1);
  const allDuplicatesResolved = !!resolvedState
    && isManifestVerified
    && phases.length === resolvedState.scanResult.phaseCount
    && phases
    .filter((p) => p.status === "duplicate")
    .every((p) => p.beds.length > 0 && p.beds.every((bed) => !!bed.selectedSegmentId));

  const setSegmentForBed = (phaseIdx: number, bedId: string, segId: string) => {
    setPhases((prev) =>
      prev.map((phase, i) =>
        i === phaseIdx
          ? {
              ...phase,
              beds: phase.beds.map((bed) => (bed.id === bedId ? { ...bed, selectedSegmentId: segId } : bed)),
            }
          : phase,
      ),
    );
  };

  useEffect(() => {
    let cancelled = false;
    loadFourDEngineerManifest().then((manifest) => {
      if (!cancelled) setEngineerManifest(manifest);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 路由状态仅作加速；刷新后必须从绑定到当前患者和会话的持久化结果恢复。
  useEffect(() => {
    let cancelled = false;
    const selectedPatient = loadSelectedPatient();
    if (!selectedPatient) {
      setStateLoadStatus("failed");
      setWorkflowError("未找到当前患者，无法恢复 4D 后处理结果。");
      return;
    }

    setStateLoadStatus("loading");
    fetchSelectedFourDPostScanState(selectedPatient.id)
      .then((state) => {
        if (cancelled) return;
        setResolvedState(state);
        setStateLoadStatus("ready");
        setWorkflowError("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStateLoadStatus("failed");
        setWorkflowError(error instanceof Error ? error.message : "4D 后处理结果恢复失败。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 工程影像清单只提供预览素材，筛选矩阵始终以持久化结果为准。
  useEffect(() => {
    if (!resolvedState) return;
    const nextPhases = buildPersistedPhases(
      resolvedState.scanResult,
      resolvedState.phaseSelections,
      engineerManifest,
    );
    setPhases(nextPhases);
    const firstDuplicateIndex = nextPhases.findIndex((phase) => phase.status !== "ok" && phase.beds.length > 0);
    const nextPhaseIndex = firstDuplicateIndex >= 0 ? firstDuplicateIndex : 0;
    setSelectedPhaseIdx(nextPhaseIndex);
    setSelectedBedId(nextPhases[nextPhaseIndex]?.beds[0]?.id ?? "");
  }, [engineerManifest, resolvedState]);

  const buildPhaseSelections = () => {
    const selections: Record<string, number> = {};
    phases.forEach((phase, phaseIndex) => {
      phase.beds.forEach((bed) => {
        const selected = bed.segments.find((segment) => segment.id === bed.selectedSegmentId);
        if (!selected) return;
        selections[`${bed.bedNo - 1}-${phaseIndex}`] = Math.max(0, selected.candidateIndex - 1);
      });
    });
    return selections;
  };

  const openBoundViewer = async () => {
    if (!isManifestVerified) {
      setWorkflowError("4D 结果与工程影像清单未完成绑定核验，不能完成检查。");
      return;
    }
    if (!isBoundFourDState(resolvedState)) {
      setWorkflowError("4D 结果缺少患者、检查会话或目标序列绑定，不能进入查看器。");
      return;
    }
    const selectedPatient = loadSelectedPatient();
    if (!selectedPatient) {
      setWorkflowError("未找到当前患者，不能完成本次检查。");
      return;
    }

    setIsFinalizing(true);
    setWorkflowError("");
    try {
      const session = await fetchSelectedScanSession({ preferCache: false });
      if (!session || session.id !== resolvedState.scanSessionId || session.patient_id !== selectedPatient.id) {
        throw new Error("当前患者与 4D 检查会话不匹配，请返回患者列表重新进入。");
      }
      const targets = session.series.filter((series) => series.series_type === "4d");
      if (targets.length !== 1 || targets[0].id !== resolvedState.targetSeriesId) {
        throw new Error("4D 结果与目标序列不匹配，不能完成本次检查。");
      }
      const target = targets[0];
      if (session.status === "cancelled") {
        throw new Error("本次检查已终止，不能进入结果查看。");
      }

      let persisted = await fetchFourDResult({
        scanSessionId: session.id,
        patientId: selectedPatient.id,
        targetSeriesId: target.id,
      });
      const phaseSelections = buildPhaseSelections();

      if (session.status !== "completed") {
        if (
          persisted.workflowStage !== "phase_selected"
          || !arePhaseSelectionsEqual(persisted.phaseSelections, phaseSelections)
        ) {
          persisted = await saveFourDResult({
            scanSessionId: session.id,
            patientId: selectedPatient.id,
            targetSeriesId: target.id,
            expectedVersion: persisted.version,
            workflowStage: "phase_selected",
            state: {
              scanResult: persisted.scanResult,
              rescanChoices: persisted.rescanChoices,
              phaseSelections,
            },
          });
        }
        const finalized = await finalizeFourDResult({
          scanSessionId: session.id,
          patientId: selectedPatient.id,
          targetSeriesId: target.id,
          expectedVersion: persisted.version,
        });
        if (finalized.scanSession.status !== "completed" || finalized.result.workflowStage !== "ready") {
          throw new Error("检查会话未完成，不能进入结果查看。");
        }
        persisted = finalized.result;
      } else if (target.execution_status !== "image_ready" || persisted.workflowStage !== "ready") {
        throw new Error("已完成检查缺少可用的 4D 结果，不能进入结果查看。");
      }

      const viewerState = toFourDPostScanState(persisted);
      setResolvedState(viewerState);
      navigate("/image-viewer", {
        state: {
          ...viewerState,
          showSliceLoadingBeforeImageLoad: false,
          initialBrowseMode: "phase" as const,
        },
      });
    } catch (error: unknown) {
      try {
        const latest = await fetchSelectedFourDPostScanState(selectedPatient.id);
        setResolvedState(latest);
      } catch {
        // 保留当前可编辑选择，避免恢复失败掩盖原始错误。
      }
      setWorkflowError(error instanceof Error ? error.message : "4D 结果保存或检查完成失败，请重试。");
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="select-none flex h-full flex-col bg-[#E5E7EB] text-slate-700">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex w-[268px] shrink-0 flex-col border-r border-slate-200 bg-[#F3F4F6] px-3 py-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[13px] font-bold text-slate-700">{t("scanFlow.phaseFilter.title")}</h2>
            <Info size={12} className="text-slate-400" />
          </div>

          <div className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {phases
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => p.status !== "ok")
              .map(({ p, i }) => {
                const phaseActive = selectedPhaseIdx === i;
                const phaseResolved = p.beds.length > 0 && p.beds.every((bed) => !!bed.selectedSegmentId);

                return (
                  <div
                    key={p.label}
                    className={`overflow-hidden rounded-md border bg-white transition-shadow ${
                      phaseActive ? "border-[#60A5FA] shadow-sm" : "border-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPhaseIdx(i);
                        setSelectedBedId(p.beds[0]?.id ?? "");
                      }}
                      className={`flex h-9 w-full items-center justify-between px-2.5 text-left transition-colors ${
                        phaseActive ? "bg-blue-50 text-[#1565C0]" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-[12px] font-black">Phase {p.label}</span>
                      {phaseResolved ? (
                        <span className="flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          <CheckCircle2 size={10} />
                          {t("scanFlow.phaseFilter.selected")}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                          <AlertTriangle size={10} />
                          {t("scanFlow.phaseFilter.pending")}
                        </span>
                      )}
                    </button>

                    {phaseActive && (
                      <div className="border-t border-slate-100 bg-slate-50 py-1">
                        {p.beds.map((bed) => (
                          <div key={bed.id} className="mx-1 rounded">
                            <div
                              className={`flex h-8 w-full items-center justify-between rounded px-2 text-left ${
                                selectedBedId === bed.id
                                  ? "border border-red-200 bg-red-50 text-[#7F1D1D] shadow-sm"
                                  : "border border-transparent text-slate-600"
                              }`}
                            >
                              <span className="text-[11px] font-bold">
                                {t("scanFlow.phaseFilter.bedLabel", { index: String(bed.bedNo).padStart(2, "0") })}
                              </span>
                              <span className="text-[9px] text-slate-400">{bed.range}</span>
                            </div>

                            <div className="ml-3 border-l border-slate-200 py-1 pl-2">
                              {bed.segments.map((seg) => {
                                const active = seg.id === bed.selectedSegmentId;

                                return (
                                  <label
                                    key={seg.id}
                                    className={`mb-1 flex h-7 w-full cursor-pointer items-center justify-between rounded border px-2 text-left transition-colors ${
                                      active
                                        ? "border-[#4D94FF] bg-blue-50 text-[#1565C0]"
                                        : "border-slate-200 bg-white text-slate-600 hover:bg-blue-50"
                                    }`}
                                    onClick={() => {
                                      setSelectedBedId(bed.id);
                                      setSegmentForBed(i, bed.id, seg.id);
                                    }}
                                  >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <input
                                        type="radio"
                                        name={`segment-${bed.id}`}
                                        checked={active}
                                        onChange={() => {
                                          setSelectedBedId(bed.id);
                                          setSegmentForBed(i, bed.id, seg.id);
                                        }}
                                        className="h-3 w-3 accent-[#4D94FF]"
                                      />
                                      <span className="truncate text-[10px] font-bold">
                                        {t("scanFlow.phaseFilter.candidate", { index: seg.candidateIndex })}
                                      </span>
                                    </span>
                                    <span className={`shrink-0 text-[9px] ${active ? "text-[#4D94FF]" : "text-slate-400"}`}>
                                      {seg.time}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="mt-3 flex flex-col gap-1.5 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={11} className="text-amber-500" />
              {t("scanFlow.phaseFilter.duplicateHint")}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              {t("scanFlow.phaseFilter.missingHint")}
            </div>
          </div>
        </section>

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-2">
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-[#1E3A8A] bg-black shadow-[inset_0_0_0_2px_rgba(30,58,138,0.5)]">
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-[#1E3A8A]">
              <div className="min-h-0 bg-black">
                <MprTile label="CORONAL" phaseLabel={currentPhase?.label ?? "0%"}>
                  <div className="relative h-full w-full bg-black">
                    {engineerStitchedPreviewRows ? (
                      <StitchedPreviewFrame
                        rows={engineerStitchedPreviewRows.map((row) => ({ bedNumber: row.bedNumber, src: row.coronal }))}
                        bedCount={bedCodeCount}
                        activeBedNumber={activeBedNumber}
                        side="left"
                        horizontalClass="bg-red-500/85"
                        verticalClass="bg-yellow-300/85"
                      />
                    ) : previewUrls.coronal ? (
                      <PreviewFrame
                        src={previewUrls.coronal}
                        bedCount={bedCodeCount}
                        activeBedNumber={activeBedNumber}
                        side="left"
                        horizontalClass="bg-red-500/85"
                        verticalClass="bg-yellow-300/85"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[12px] font-bold text-slate-500">
                        预览影像不可用
                      </div>
                    )}
                  </div>
                </MprTile>
              </div>

              <div className="min-h-0 bg-black">
                <MprTile label="SAGITTAL" phaseLabel={currentPhase?.label ?? "0%"}>
                  <div className="relative h-full w-full bg-black">
                    {engineerStitchedPreviewRows ? (
                      <StitchedPreviewFrame
                        rows={engineerStitchedPreviewRows.map((row) => ({ bedNumber: row.bedNumber, src: row.sagittal }))}
                        bedCount={bedCodeCount}
                        activeBedNumber={activeBedNumber}
                        side="right"
                        horizontalClass="bg-red-500/85"
                        verticalClass="bg-emerald-400/85"
                      />
                    ) : previewUrls.sagittal ? (
                      <PreviewFrame
                        src={previewUrls.sagittal}
                        bedCount={bedCodeCount}
                        activeBedNumber={activeBedNumber}
                        side="right"
                        horizontalClass="bg-red-500/85"
                        verticalClass="bg-emerald-400/85"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[12px] font-bold text-slate-500">
                        预览影像不可用
                      </div>
                    )}
                  </div>
                </MprTile>
              </div>
            </div>
          </div>
          {(stateLoadStatus !== "ready" || engineerManifest === undefined || !isManifestVerified) && (
            <div className="absolute inset-2 z-20 flex items-center justify-center rounded-lg bg-black text-center text-[13px] font-bold text-white/85">
              {stateLoadStatus === "loading" || engineerManifest === undefined
                ? "正在核验本次 4D 结果与影像来源…"
                : "本次 4D 结果或绑定影像不可用"}
            </div>
          )}
        </section>
      </div>

      <footer className="flex h-[72px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3 text-[12px]">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-black text-slate-700">1</span>
            <span className="font-medium">{t("scanFlow.phaseFilter.imageLoadStep")}</span>
          </div>
          <div className="h-px w-6 bg-slate-300" />
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[#1565C0]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1E64F0] text-[11px] font-black text-white">2</span>
            <span className="font-bold">{t("scanFlow.phaseFilter.phaseFilterStep")}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {workflowError && (
            <div className="max-w-[360px] text-right text-[11px] font-semibold text-red-600" role="alert">
              {workflowError}
            </div>
          )}
          <button
          onClick={openBoundViewer}
          disabled={!allDuplicatesResolved || isFinalizing || stateLoadStatus !== "ready"}
          title={allDuplicatesResolved ? undefined : t("scanFlow.phaseFilter.disabledTitle")}
          className={`flex items-center gap-1.5 rounded-md px-6 py-2 text-[12px] font-bold shadow-sm transition-colors ${
            allDuplicatesResolved && !isFinalizing && stateLoadStatus === "ready"
              ? "bg-[#4D94FF] text-white hover:bg-blue-600"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {isFinalizing ? "正在保存并完成检查…" : t("scanFlow.imageBrowser")}
          <ChevronRight size={14} />
        </button>
        </div>
      </footer>
    </div>
  );
}
