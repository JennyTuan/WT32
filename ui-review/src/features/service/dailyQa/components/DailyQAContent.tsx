import { useRef, useState } from "react";

import type { MetricKey, PhantomImageData, PhantomType, QACardItem, RoiPoint } from "../types";

const STATUS_CONFIG: Record<"PASS" | "FAIL", { badge: string; accent: string; dot: string }> = {
  PASS: {
    badge: "bg-[#E8F5E9] text-[#2E7D32] ring-1 ring-[#A5D6A7]",
    accent: "bg-gradient-to-r from-[#43A047] to-[#66BB6A]",
    dot: "bg-[#43A047]",
  },
  FAIL: {
    badge: "bg-[#FFF0F0] text-[#C62828] ring-1 ring-[#FFCDD2]",
    accent: "bg-gradient-to-r from-[#E53935] to-[#EF5350]",
    dot: "bg-[#E53935]",
  },
};

const MetricViewport = ({
  card,
  image,
  onRoiPointChange,
}: {
  card: QACardItem;
  image: PhantomImageData | null;
  onRoiPointChange: (metric: MetricKey, pointIndex: number, nextPoint: RoiPoint) => void;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragIndex === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    onRoiPointChange(card.key, dragIndex, { x, y });
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={() => setDragIndex(null)}
      onPointerLeave={() => setDragIndex(null)}
      className="relative h-[136px] rounded-xl overflow-hidden bg-[radial-gradient(ellipse_at_center,#3D4F65_0%,#1E2A38_60%,#111820_100%)] shadow-inner"
    >
      {/* scanline overlay */}
      <div className="absolute inset-0 opacity-[0.06] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,1)_2px,rgba(255,255,255,1)_3px)] pointer-events-none" />
      {/* corner marks */}
      <div className="absolute top-2 left-2 w-4 h-4 border-l border-t border-white/30 pointer-events-none" />
      <div className="absolute top-2 right-2 w-4 h-4 border-r border-t border-white/30 pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-l border-b border-white/30 pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-r border-b border-white/30 pointer-events-none" />
      <div className="absolute left-3 top-3 rounded-md bg-black/60 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white/90 tracking-wide">
        {image ? `${card.viewportLabel} · ${image.phantomType}` : "等待采集"}
      </div>
      {card.roiPoints.map((point, index) => (
        <button
          key={`${card.key}-${index}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragIndex(index);
          }}
          className={`absolute -translate-x-1/2 -translate-y-1/2 border-2 border-white/90 bg-[#4D94FF]/75 shadow-lg hover:bg-[#4D94FF] transition-colors ${
            card.roiShape === "circle" ? "w-9 h-9 rounded-full" : "w-4 h-4 rounded-full"
          }`}
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          title="拖动 ROI 重新计算"
        />
      ))}
    </div>
  );
};

const QAMetricCell = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="flex flex-col gap-1 rounded-lg bg-[#F5F8FC] border border-[#E2EBF5] px-3 py-2.5">
    <span className="text-[10px] font-bold text-[#9DB5CB] uppercase tracking-wider">{label}</span>
    <span className="text-[14px] font-black text-[#2C3E50] leading-5 whitespace-pre-line">{value === "-" ? <span className="text-[#BDC8D4]">—</span> : value}</span>
  </div>
);

const QACard = ({
  card,
  image,
  onRoiPointChange,
}: {
  card: QACardItem;
  image: PhantomImageData | null;
  onRoiPointChange: (metric: MetricKey, pointIndex: number, nextPoint: RoiPoint) => void;
}) => {
  const cfg = STATUS_CONFIG[card.status];
  return (
    <div className="bg-white border border-[#D0DFF0] rounded-2xl flex flex-col shadow-md overflow-hidden min-h-[290px]">
      {/* top accent bar */}
      <div className={`h-1 w-full ${cfg.accent}`} />

      <div className="px-5 py-4 flex flex-col flex-1">
        {/* header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-[17px] font-black text-[#1E2D3D] tracking-tight">{card.title}</h3>
            <div className="mt-0.5 text-[11px] text-[#9DB5CB] font-medium">拖动 ROI 后自动重算</div>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {card.status}
          </div>
        </div>

        {/* imaging viewport */}
        <MetricViewport card={card} image={image} onRoiPointChange={onRoiPointChange} />

        {/* metrics row */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <QAMetricCell label="Limit" value={card.limit} />
          <QAMetricCell label="Actual" value={card.actual} />
        </div>

        {/* summary */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#F5F8FC] border border-[#E2EBF5] px-3 py-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#9DB5CB] flex-shrink-0" />
          <span className="text-[12px] text-[#607D8B] font-semibold leading-5">{card.summary}</span>
        </div>
      </div>
    </div>
  );
};

type DailyQAContentProps = {
  cards: QACardItem[];
  onAnalyze: () => void;
  onPhantomTypeChange: (value: PhantomType) => void;
  onRoiPointChange: (metric: MetricKey, pointIndex: number, nextPoint: RoiPoint) => void;
  phantomImage: PhantomImageData | null;
  phantomType: PhantomType;
  selectedDate: string;
};

export function DailyQAContent({
  cards,
  onAnalyze,
  onPhantomTypeChange,
  onRoiPointChange,
  phantomImage,
  phantomType,
  selectedDate,
}: DailyQAContentProps) {
  return (
    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-5 flex flex-col relative overflow-hidden h-full">
      <div className="flex items-center justify-between mb-4 bg-[#F8FAFC] px-4 py-3 rounded-xl border border-[#E7EEF8] shadow-sm">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#90A4AE] font-black">日期</span>
            <div className="px-4 py-2 bg-[#F8FAFC] border border-[#D7E3F0] rounded-lg text-[14px] font-bold text-[#37474F] min-w-[168px]">
              {selectedDate.replaceAll("-", "/")}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#90A4AE] font-black">模体</span>
            <select
              value={phantomType}
              onChange={(event) => onPhantomTypeChange(event.target.value as PhantomType)}
              className="appearance-none bg-white border border-[#B0C4DE] rounded-lg px-4 py-2 text-[14px] font-bold text-[#37474F] focus:outline-none focus:border-[#4D94FF] cursor-pointer pr-10 min-w-[110px]"
            >
              <option value="水模">水模</option>
              <option value="气模">气模</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onAnalyze}
            className="px-6 h-10 bg-[#4D94FF] text-white font-black rounded-full shadow-lg hover:bg-[#3B82F6] transition-all active:scale-95 text-[14px]"
          >
            运行 QA
          </button>
        
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {cards.map((card) => (
          <QACard key={card.key} card={card} image={phantomImage} onRoiPointChange={onRoiPointChange} />
        ))}
      </div>
    </section>
  );
}
