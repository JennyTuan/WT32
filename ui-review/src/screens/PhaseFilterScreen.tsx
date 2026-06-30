import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { getFourDImageUrl } from "../lib/fourDImageSource";
import {
  buildEngineerScanResult,
  getEngineerVolumesForBedPhase,
  loadFourDEngineerManifest,
  type FourDEngineerManifest,
  type FourDEngineerVolume,
} from "../lib/fourDEngineerImageSource";
import { generateMockScanResult, type FourDPostScanState } from "../lib/fourDTypes";
import { useI18n } from "../lib/i18nContext";

type PhaseStatus = "ok" | "duplicate" | "missing";

interface DataSegment {
  id: string;
  volumeId?: string;
  time: string;
  quality: "excellent" | "good" | "fair";
  candidateIndex: number;
  range: string;
  sliceCount: number;
  avgDose: string;
  clarity: number;
  noise: number;
  motion: number;
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
const PREVIEW_SLICES = {
  coronal: 256,
  sagittal: 256,
} as const;

function makeSegment(idx: number, phaseIdx: number, bedIdx: number): DataSegment {
  const times = ["12:34:56.78", "12:45:12.34", "12:55:45.67", "13:02:18.22"];
  const qualities: DataSegment["quality"][] = ["excellent", "good", "fair"];
  const clarities = [9, 7, 6];
  const noises = [8, 7, 5];
  const motions = [9, 7, 6];

  return {
    id: `seg-${phaseIdx}-${bedIdx}-${idx}`,
    time: times[(idx + bedIdx) % times.length] ?? "--",
    quality: qualities[idx] ?? "good",
    candidateIndex: idx + 1,
    range: `${390 + bedIdx * 30}.0 - ${440 + bedIdx * 30}.0 mm`,
    sliceCount: 280,
    avgDose: `CTDIvol ${(8.2 + bedIdx * 0.3).toFixed(1)} mGy`,
    clarity: clarities[idx] ?? 8,
    noise: noises[idx] ?? 7,
    motion: motions[idx] ?? 8,
  };
}

function buildMockPhases(): PhaseData[] {
  const duplicateConfig: Record<number, Array<{ bedNo: number; count: number }>> = {
    0: [
      { bedNo: 3, count: 3 },
      { bedNo: 7, count: 2 },
    ],
    3: [{ bedNo: 2, count: 2 }],
    6: [
      { bedNo: 5, count: 3 },
      { bedNo: 8, count: 2 },
    ],
  };

  return PHASE_LABELS.map((label, i) => {
    const duplicateBeds = duplicateConfig[i] ?? [];
    const status: PhaseStatus = duplicateBeds.length > 0 ? "duplicate" : "ok";
    const beds: BedPhaseData[] = duplicateBeds.map(({ bedNo, count }) => {
      const bedIdx = bedNo - 1;
      const range = `${390 + bedIdx * 30}.0 - ${440 + bedIdx * 30}.0 mm`;
      const segments = Array.from({ length: count }, (_, si) => makeSegment(si, i, bedIdx));

      return {
        id: `bed-${i}-${String(bedNo).padStart(2, "0")}`,
        bedNo,
        range,
        segments,
        selectedSegmentId: undefined,
      };
    });

    return { label, status, beds };
  });
}

function formatRangeMm(range: [number, number]) {
  return `${range[0].toFixed(1)} - ${range[1].toFixed(1)} mm`;
}

function segmentFromVolume(volume: FourDEngineerVolume): DataSegment {
  const quality: DataSegment["quality"] = volume.candidateIndex === 0 ? "excellent" : "good";
  return {
    id: volume.id,
    volumeId: volume.id,
    time: volume.acquisitionTime || "--",
    quality,
    candidateIndex: volume.candidateIndex + 1,
    range: formatRangeMm(volume.rangeMm),
    sliceCount: volume.sliceCount,
    avgDose: "reference",
    clarity: volume.candidateIndex === 0 ? 9 : 8,
    noise: volume.candidateIndex === 0 ? 8 : 7,
    motion: volume.candidateIndex === 0 ? 9 : 8,
    previewUrls: {
      axial: volume.urls.axialPreview,
      coronal: volume.urls.coronalPreview,
      coronalStrip: volume.urls.coronalStrip,
      sagittal: volume.urls.sagittalPreview,
      sagittalStrip: volume.urls.sagittalStrip,
    },
  };
}

function buildEngineerPhases(manifest: FourDEngineerManifest): PhaseData[] {
  return manifest.phaseLabels.map((label, phaseIndex) => {
    const beds: BedPhaseData[] = [];

    for (let bedIndex = 0; bedIndex < manifest.bedCount; bedIndex += 1) {
      const volumes = getEngineerVolumesForBedPhase(manifest, bedIndex, phaseIndex);
      if (volumes.length <= 1) continue;
      const first = volumes[0];
      beds.push({
        id: `bed-${phaseIndex}-${String(bedIndex + 1).padStart(2, "0")}`,
        bedNo: bedIndex + 1,
        range: first ? formatRangeMm(first.rangeMm) : "--",
        segments: volumes.map(segmentFromVolume),
        selectedSegmentId: undefined,
      });
    }

    return {
      label,
      status: beds.length > 0 ? "duplicate" : "ok",
      beds,
    };
  });
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
  const [engineerManifest, setEngineerManifest] = useState<FourDEngineerManifest | null | undefined>(undefined);
  const fourDViewerState = useMemo<FourDPostScanState & { initialBrowseMode: "phase" }>(
    () => ({
      ...(engineerManifest
        ? { scanResult: buildEngineerScanResult(engineerManifest, routeState?.scanResult) }
        : routeState?.scanResult
        ? routeState
        : { scanResult: generateMockScanResult(9, 10, 165.0) }),
      showSliceLoadingBeforeImageLoad: false,
      initialBrowseMode: "phase",
    }),
    [engineerManifest, routeState],
  );

  const [phases, setPhases] = useState<PhaseData[]>(() => buildMockPhases());
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
  const [selectedBedId, setSelectedBedId] = useState("bed-0-03");

  const currentPhase = phases[selectedPhaseIdx] ?? null;
  const selectedBed = currentPhase?.beds.find((bed) => bed.id === selectedBedId) ?? currentPhase?.beds[0] ?? null;
  const selectedSegment = selectedBed
    ? selectedBed.segments.find((segment) => segment.id === selectedBed.selectedSegmentId) ?? selectedBed.segments[0] ?? null
    : null;
  const previewUrls = useMemo(
    () => ({
      axial: selectedSegment?.previewUrls?.axial ?? getFourDImageUrl(selectedPhaseIdx, "axial", 50),
      coronal: selectedSegment?.previewUrls?.coronal ?? getFourDImageUrl(selectedPhaseIdx, "coronal", PREVIEW_SLICES.coronal),
      sagittal: selectedSegment?.previewUrls?.sagittal ?? getFourDImageUrl(selectedPhaseIdx, "sagittal", PREVIEW_SLICES.sagittal),
    }),
    [selectedPhaseIdx, selectedSegment],
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
  const activeBedNumber = selectedBed?.bedNo ?? null;
  const bedCodeCount = Math.max(1, fourDViewerState.scanResult.bedCount);
  const allDuplicatesResolved = phases
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

  // Manifest load seeds the editable phase/bed selection model.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (engineerManifest === undefined) return;
    const nextPhases = engineerManifest ? buildEngineerPhases(engineerManifest) : buildMockPhases();
    setPhases(nextPhases);
    const firstDuplicateIndex = nextPhases.findIndex((phase) => phase.status !== "ok" && phase.beds.length > 0);
    const nextPhaseIndex = firstDuplicateIndex >= 0 ? firstDuplicateIndex : 0;
    setSelectedPhaseIdx(nextPhaseIndex);
    setSelectedBedId(nextPhases[nextPhaseIndex]?.beds[0]?.id ?? "");
  }, [engineerManifest]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
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
                    ) : (
                      <PreviewFrame
                        src={previewUrls.coronal}
                        bedCount={bedCodeCount}
                        activeBedNumber={activeBedNumber}
                        side="left"
                        horizontalClass="bg-red-500/85"
                        verticalClass="bg-yellow-300/85"
                      />
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
                    ) : (
                      <PreviewFrame
                        src={previewUrls.sagittal}
                        bedCount={bedCodeCount}
                        activeBedNumber={activeBedNumber}
                        side="right"
                        horizontalClass="bg-red-500/85"
                        verticalClass="bg-emerald-400/85"
                      />
                    )}
                  </div>
                </MprTile>
              </div>
            </div>
          </div>
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
        <button
          onClick={() =>
            navigate("/image-viewer", {
              state: {
                ...fourDViewerState,
                phaseSelections: {
                  ...fourDViewerState.phaseSelections,
                  ...buildPhaseSelections(),
                },
              },
            })
          }
          disabled={!allDuplicatesResolved}
          title={allDuplicatesResolved ? undefined : t("scanFlow.phaseFilter.disabledTitle")}
          className={`flex items-center gap-1.5 rounded-md px-6 py-2 text-[12px] font-bold shadow-sm transition-colors ${
            allDuplicatesResolved
              ? "bg-[#4D94FF] text-white hover:bg-blue-600"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {t("scanFlow.imageBrowser")}
          <ChevronRight size={14} />
        </button>
      </footer>
    </div>
  );
}
