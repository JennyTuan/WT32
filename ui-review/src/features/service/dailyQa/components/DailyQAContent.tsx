import { useRef, useState } from "react";
import { History } from "lucide-react";

import type { MetricKey, PhantomImageData, PhantomType, QACardItem, RoiPoint } from "../types";

const STATUS_CLASS: Record<"PASS" | "FAIL", string> = {
  PASS: "bg-[#E8F5E9] text-[#2E7D32]",
  FAIL: "bg-[#FFEBEE] text-[#C62828]",
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
      className="relative h-[128px] rounded-xl border border-[#C8D8EB] overflow-hidden bg-[radial-gradient(circle_at_center,#F3F7FD_0%,#CBD6E2_55%,#8192A8_100%)]"
    >
      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(0deg,transparent_24%,rgba(255,255,255,0.3)_25%,transparent_26%,transparent_49%,rgba(255,255,255,0.3)_50%,transparent_51%,transparent_74%,rgba(255,255,255,0.3)_75%,transparent_76%)] bg-[length:100%_36px]" />
      <div className="absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[11px] font-bold text-white">
        {image ? `${card.viewportLabel} · ${image.phantomType}` : "等待采集"}
      </div>
      {card.roiPoints.map((point, index) => (
        <button
          key={`${card.key}-${index}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragIndex(index);
          }}
          className={`absolute -translate-x-1/2 -translate-y-1/2 border-2 border-white bg-[#4D94FF]/80 shadow-md ${
            card.roiShape === "circle" ? "w-9 h-9 rounded-full" : "w-5 h-5 rounded-full"
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
  <div className="flex items-start justify-between gap-3 rounded-lg bg-[#F8FAFC] border border-[#E7EEF8] px-3 py-2.5">
    <span className="text-[12px] font-bold text-[#8AA0B6] uppercase">{label}</span>
    <span className="text-[13px] font-bold text-[#37474F] text-right leading-5">{value}</span>
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
}) => (
  <div className="bg-white border border-[#C8D8EB] rounded-xl px-5 py-4 flex flex-col shadow-sm min-h-[270px]">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="text-[16px] font-black text-[#37474F]">{card.title}</h3>
        <div className="mt-1 text-[12px] text-[#90A4AE]">拖动 ROI 后自动重算</div>
      </div>
      <div className={`px-3 py-1 rounded-full text-[12px] font-black ${STATUS_CLASS[card.status]}`}>{card.status}</div>
    </div>

    <MetricViewport card={card} image={image} onRoiPointChange={onRoiPointChange} />

    <div className="grid grid-cols-2 gap-2.5 mt-4">
      <QAMetricCell label="Limit" value={card.limit} />
      <QAMetricCell label="Actual" value={card.actual} />
    </div>

    <div className="mt-3 rounded-lg bg-[#FBFDFF] border border-[#EEF2F9] px-3 py-2.5 text-[12px] text-[#546E7A] font-medium leading-5">
      {card.summary}
    </div>
  </div>
);

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
          <button className="px-5 h-10 bg-white border border-[#4D94FF] text-[#4D94FF] font-black rounded-full hover:bg-[#F9FBFC] transition-all active:scale-95 text-[14px] flex items-center gap-2 shadow-sm">
            <History size={14} strokeWidth={3} />
            报告历史
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
