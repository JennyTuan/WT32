import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { getFourDImageUrl } from "../lib/fourDImageSource";
import { generateMockScanResult, type FourDPostScanState } from "../lib/fourDTypes";

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];
const BED_COUNT = 9;

type LoadStatus = "waiting" | "loading" | "done";

interface BedLoadState {
  id: number;
  progress: number;
  status: LoadStatus;
}

interface FullscreenImageState {
  phaseIndex: number;
  bedNumber: number;
  imageUrl: string;
}

function PhaseThumbnail({
  phaseIndex,
  bedNumber,
  loaded,
  onDoubleClick,
}: {
  phaseIndex: number;
  bedNumber: number;
  loaded: boolean;
  onDoubleClick: (payload: FullscreenImageState) => void;
}) {
  const slice = Math.min(140, 44 + bedNumber * 6 + phaseIndex * 4);
  const imageUrl = getFourDImageUrl(phaseIndex, "axial", slice);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
      <div className="border-b border-slate-700/80 bg-slate-900/95 px-2 py-1.5 text-[10px] font-bold text-slate-100">
        Phase {PHASE_LABELS[phaseIndex]}
      </div>
      <button
        type="button"
        onDoubleClick={() => onDoubleClick({ phaseIndex, bedNumber, imageUrl })}
        className="relative block aspect-[4/3] w-full bg-black text-left"
      >
        <img src={imageUrl} alt="" draggable={false} className="h-full w-full object-contain" />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/72">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] font-bold text-slate-100">
              <LoaderCircle size={12} className="animate-spin" />
              正在加载
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

export default function ImageLoadScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as FourDPostScanState | null;
  const phaseFilterState = useMemo<FourDPostScanState>(
    () => ({
      ...(routeState?.scanResult ? routeState : { scanResult: generateMockScanResult(9, 10, 165.0) }),
      showSliceLoadingBeforeImageLoad: false,
    }),
    [routeState],
  );

  const [selectedBedNumber, setSelectedBedNumber] = useState(1);
  const [fullscreenImage, setFullscreenImage] = useState<FullscreenImageState | null>(null);
  const [bedLoads, setBedLoads] = useState<BedLoadState[]>(
    Array.from({ length: BED_COUNT }, (_, idx) => ({
      id: idx + 1,
      progress: idx === 0 ? 18 : 0,
      status: idx === 0 ? "loading" : "waiting",
    })),
  );

  useEffect(() => {
    const activeLoadingBed = bedLoads.find((bed) => bed.status === "loading");
    if (!activeLoadingBed) return;

    const timer = window.setTimeout(() => {
      setBedLoads((prev) =>
        prev.map((bed) => {
          if (bed.id !== activeLoadingBed.id) return bed;
          const nextProgress = Math.min(100, bed.progress + 16);
          return {
            ...bed,
            progress: nextProgress,
            status: nextProgress >= 100 ? "done" : "loading",
          };
        }),
      );
    }, 260);

    return () => window.clearTimeout(timer);
  }, [bedLoads]);

  useEffect(() => {
    const doneCount = bedLoads.filter((bed) => bed.status === "done").length;
    const loadingBed = bedLoads.find((bed) => bed.status === "loading");
    if (loadingBed || doneCount >= BED_COUNT) return;

    setBedLoads((prev) =>
      prev.map((bed) =>
        bed.id === doneCount + 1
          ? { ...bed, status: "loading", progress: bed.progress > 0 ? bed.progress : 12 }
          : bed,
      ),
    );
  }, [bedLoads]);

  useEffect(() => {
    const selectedLoad = bedLoads.find((bed) => bed.id === selectedBedNumber);
    if (selectedLoad?.status === "done") return;
    const loadingBed = bedLoads.find((bed) => bed.status === "loading");
    if (!loadingBed || loadingBed.id === selectedBedNumber) return;
    setSelectedBedNumber(loadingBed.id);
  }, [bedLoads, selectedBedNumber]);

  const selectedBedLoad = bedLoads.find((bed) => bed.id === selectedBedNumber) ?? null;
  const loadedBedCount = bedLoads.filter((bed) => bed.status === "done").length;

  return (
    <div className="relative flex h-full select-none flex-col bg-[#E5E7EB] text-slate-700">
      <div className="flex min-h-0 flex-1 overflow-hidden p-3">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mb-3 text-[18px] font-bold text-slate-800">图像加载</div>

          <div className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid h-full min-h-0 grid-cols-5 grid-rows-2 gap-2">
              {PHASE_LABELS.map((_, phaseIndex) => (
                <PhaseThumbnail
                  key={`${selectedBedNumber}-${phaseIndex}`}
                  phaseIndex={phaseIndex}
                  bedNumber={selectedBedNumber}
                  loaded={selectedBedLoad?.status === "done"}
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
            <span className="font-bold">图像加载</span>
          </div>
          <div className="h-px w-6 bg-slate-300" />
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-black text-slate-700">2</span>
            <span className="font-medium">相位筛选</span>
          </div>
        </div>
        <button
          onClick={() => navigate("/phase-filter", { state: phaseFilterState })}
          disabled={loadedBedCount < BED_COUNT}
          className={`flex items-center gap-1.5 rounded-md px-6 py-2 text-[12px] font-bold text-white shadow-sm ${
            loadedBedCount < BED_COUNT ? "cursor-not-allowed bg-slate-300" : "bg-[#4D94FF] hover:bg-blue-600"
          }`}
        >
          下一步：相位筛选
          <ChevronRight size={14} />
        </button>
      </footer>

      {fullscreenImage && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/92">
          <div className="flex h-full w-full flex-col px-8 py-6">
            <div className="mb-4 flex items-center justify-between text-white">
              <div>
                <div className="text-[18px] font-bold">Axial · Phase {PHASE_LABELS[fullscreenImage.phaseIndex]}</div>
                <div className="mt-1 text-[12px] text-slate-300">床位 {fullscreenImage.bedNumber}，双击影像返回主界面</div>
              </div>
              <button
                type="button"
                onClick={() => setFullscreenImage(null)}
                className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-white/15"
              >
                退出全屏
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-black">
              <img
                src={fullscreenImage.imageUrl}
                alt=""
                draggable={false}
                className="max-h-full max-w-full object-contain"
                onDoubleClick={() => setFullscreenImage(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
