import { useRef, useState } from "react";

import { useI18n } from "../../../../lib/i18nContext";
import { PHANTOM_LABEL_KEYS, QA_STATUS_LABEL_KEYS } from "../dailyQaI18n";
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
  onRoiPointChange,
}: {
  card: QACardItem;
  image: PhantomImageData | null;
  onRoiPointChange: (metric: MetricKey, pointIndex: number, nextPoint: RoiPoint) => void;
}) => {
  const { t } = useI18n();
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
      className="relative h-[136px] overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,#3D4F65_0%,#1E2A38_60%,#111820_100%)] shadow-inner"
    >
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,1)_2px,rgba(255,255,255,1)_3px)] opacity-[0.06]" />
      <div className="pointer-events-none absolute top-2 left-2 h-4 w-4 border-l border-t border-white/30" />
      <div className="pointer-events-none absolute top-2 right-2 h-4 w-4 border-r border-t border-white/30" />
      <div className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-l border-b border-white/30" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-4 w-4 border-r border-b border-white/30" />
      {card.roiPoints.map((point, index) => (
        <button
          key={`${card.key}-${index}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragIndex(index);
          }}
          className={`absolute -translate-x-1/2 -translate-y-1/2 border-2 border-white/90 bg-[#4D94FF]/75 shadow-lg transition-colors hover:bg-[#4D94FF] ${
            card.roiShape === "circle" ? "h-9 w-9 rounded-full" : "h-4 w-4 rounded-full"
          }`}
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          title={t("service.dailyQa.dragRoiTitle")}
        />
      ))}
    </div>
  );
};

const splitAccuracyLimit = (value: string) => {
  const match = value.match(/Water\s*([^,]+),\s*Air\s*(.+)/i);
  if (!match) return { water: value, air: "-" };
  return { water: match[1].trim(), air: match[2].trim() };
};

const splitAccuracyActual = (value: string) => {
  if (value === "-") return { water: "-", air: "-" };
  const match = value.match(/W\s*([-\d.]+)\s*\/\s*A\s*([-\d.]+)/i);
  if (!match) return { water: value, air: "-" };
  return {
    water: match[1].trim(),
    air: match[2].trim(),
  };
};

const QATableHeader = () => (
  <QATableHeaderContent />
);

const QATableHeaderContent = () => {
  const { t } = useI18n();
  return (
    <>
      <div className="text-[11px] font-bold lowercase tracking-[0.08em] text-[#6F88A6]">{t("service.dailyQa.limit")}</div>
      <div className="text-[11px] font-bold lowercase tracking-[0.08em] text-[#6F88A6]">{t("service.dailyQa.actual")}</div>
    </>
  );
};

const QATableValue = ({ value }: { value: string }) => (
  <span className={`text-[14px] font-bold leading-6 ${value === "-" ? "text-[#AEBFD2]" : "text-[#14283B]"}`}>{value}</span>
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
  const { t } = useI18n();
  const cfg = STATUS_CONFIG[card.status];
  const accuracyLimit = card.key === "accuracy" ? splitAccuracyLimit(card.limit) : null;
  const accuracyActual = card.key === "accuracy" ? splitAccuracyActual(card.actual) : null;

  return (
    <div className="flex min-h-[290px] flex-col overflow-hidden rounded-2xl border border-[#D0DFF0] bg-white shadow-md">
      <div className={`h-1 w-full ${cfg.accent}`} />

      <div className="flex flex-1 flex-col px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-black tracking-tight text-[#1E2D3D]">{card.title}</h3>
            <div className="mt-0.5 text-[11px] font-medium text-[#9DB5CB]">{t("service.dailyQa.autoRecalculateHint")}</div>
          </div>
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${cfg.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {t(QA_STATUS_LABEL_KEYS[card.status])}
          </div>
        </div>

        <MetricViewport card={card} image={image} onRoiPointChange={onRoiPointChange} />

        <div className="mt-4 px-1">
          <div className="grid grid-cols-[minmax(0,1fr)_72px] items-end gap-x-4 gap-y-2">
            <QATableHeader />
            <div className="col-span-2 h-px bg-[#223A57]" />
            {card.key === "accuracy" && accuracyLimit && accuracyActual ? (
              <>
                <QATableValue value={`water ${accuracyLimit.water}`} />
                <QATableValue value={accuracyActual.water} />
                <div className="col-span-2 h-px bg-[#DCE5EF]" />
                <QATableValue value={`air ${accuracyLimit.air}`} />
                <QATableValue value={accuracyActual.air} />
              </>
            ) : (
              <>
                <QATableValue value={card.limit} />
                <QATableValue value={card.actual} />
              </>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-[#223A57]">{t("service.dailyQa.judgmentResult")}</span>
            <span
              className={`inline-flex min-w-[76px] justify-center rounded-full px-4 py-2 text-[13px] font-black text-white ${
                card.status === "PASS" ? "bg-[#2E7D32]" : "bg-[#C40000]"
              }`}
            >
              {t(QA_STATUS_LABEL_KEYS[card.status])}
            </span>
          </div>
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
  const { t } = useI18n();

  return (
    <section className="relative flex h-full flex-1 flex-col overflow-hidden rounded-md border border-[#B0C4DE] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-[#E7EEF8] bg-[#F8FAFC] px-4 py-3 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-black text-[#90A4AE]">{t("service.dailyQa.date")}</span>
            <div className="min-w-[168px] rounded-lg border border-[#D7E3F0] bg-[#F8FAFC] px-4 py-2 text-[14px] font-bold text-[#37474F]">
              {selectedDate.replaceAll("-", "/")}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[13px] font-black text-[#90A4AE]">{t("service.dailyQa.phantom")}</span>
            <select
              value={phantomType}
              onChange={(event) => onPhantomTypeChange(event.target.value as PhantomType)}
              className="min-w-[110px] cursor-pointer appearance-none rounded-lg border border-[#B0C4DE] bg-white px-4 py-2 pr-10 text-[14px] font-bold text-[#37474F] focus:border-[#4D94FF] focus:outline-none"
            >
              <option value="水模">{t(PHANTOM_LABEL_KEYS["水模"])}</option>
              <option value="气模">{t(PHANTOM_LABEL_KEYS["气模"])}</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onAnalyze}
            className="h-10 rounded-full bg-[#4D94FF] px-6 text-[14px] font-black text-white shadow-lg transition-all hover:bg-[#3B82F6] active:scale-95"
          >
            {t("service.dailyQa.runQa")}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        {cards.map((card) => (
          <QACard key={card.key} card={card} image={phantomImage} onRoiPointChange={onRoiPointChange} />
        ))}
      </div>
    </section>
  );
}
