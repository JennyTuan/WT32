import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Contrast, ImageIcon, Loader2, RefreshCw } from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import type { TranslationKey } from "../../../lib/i18n";
import { API_BASE_URL, apiFetch } from "../../../lib/apiClient";
import { useI18n } from "../../../lib/i18nContext";

type TabKey = "MTF" | "FWHM_H" | "FWHM_V";

type DatasetSummary = { id: string; name: string; slice_count: number };
type DatasetInfo = {
  dataset_id: string;
  slice_count: number;
  rows: number;
  columns: number;
  default_window_center: number;
  default_window_width: number;
  pixel_spacing_mm: [number, number];
  slices: { index: number; instance_number: number; thickness: number }[];
};

type Point = { x: number; y: number };

type AnalyzeResponse = {
  dataset_id: string;
  pixel_spacing_mm: [number, number];
  edge_slice_index: number;
  peak_slice_index: number;
  peak_row: number;
  peak_col: number;
  mtf: {
    title: string;
    subtitle: string;
    unit: string;
    y_label: string;
    points: Point[];
    mtf50: number | null;
    mtf10: number | null;
    roi_x: number;
    roi_y: number;
    roi_size: number;
  };
  fwhm_h: {
    title: string;
    subtitle: string;
    unit: string;
    y_label: string;
    points: Point[];
    fwhm_pixels: number;
    fwhm_mm: number;
    peak_center: number;
  };
  fwhm_v: {
    title: string;
    subtitle: string;
    unit: string;
    y_label: string;
    points: Point[];
    fwhm_pixels: number;
    fwhm_mm: number;
    peak_center: number;
  };
};

const DEMO_PROFILES = {
  MTF: {
    titleKey: "service.performance.demo.mtfTitle" as TranslationKey,
    subtitleKey: "service.performance.demo.mtfSubtitle" as TranslationKey,
    unit: "lp/cm",
    yLabel: "MTF",
    points: [
      { x: 0, y: 1 },
      { x: 1, y: 0.67 },
      { x: 2.5, y: 0.28 },
      { x: 4, y: 0.25 },
      { x: 6, y: 0.14 },
      { x: 7.5, y: 0.18 },
      { x: 10, y: 0.12 },
      { x: 11, y: 0.08 },
      { x: 15, y: 0.02 },
      { x: 20, y: 0.01 },
      { x: 25, y: 0.005 },
    ] as Point[],
    markers: { mtf50: 1.5, mtf10: 10.5 },
  },
  FWHM_H: {
    titleKey: "service.performance.demo.fwhmHTitle" as TranslationKey,
    subtitleKey: "service.performance.demo.fwhmHSubtitle" as TranslationKey,
    unit: "Pixel",
    yLabel: "HU",
    points: Array.from({ length: 50 }, (_, i) => {
      const sigma = 1.5;
      return { x: i, y: 3000 * Math.exp(-Math.pow(i - 22, 2) / (2 * sigma * sigma)) };
    }) as Point[],
    fwhmPx: 2.4,
    peakCenter: 22,
  },
  FWHM_V: {
    titleKey: "service.performance.demo.fwhmVTitle" as TranslationKey,
    subtitleKey: "service.performance.demo.fwhmVSubtitle" as TranslationKey,
    unit: "Pixel",
    yLabel: "HU",
    points: Array.from({ length: 50 }, (_, i) => {
      const sigma = 1.8;
      return { x: i, y: 2950 * Math.exp(-Math.pow(i - 21, 2) / (2 * sigma * sigma)) };
    }) as Point[],
    fwhmPx: 3.0,
    peakCenter: 21,
  },
};

const tabMeta: Record<TabKey, { labelKey: TranslationKey; accent: string }> = {
  MTF: { labelKey: "service.performance.tab.mtf", accent: "text-[#1D4ED8]" },
  FWHM_H: { labelKey: "service.performance.tab.fwhmH", accent: "text-[#0F766E]" },
  FWHM_V: { labelKey: "service.performance.tab.fwhmV", accent: "text-[#7C3AED]" },
};

export default function PerformanceEvaluationScreen() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabKey>("MTF");
  const [showBaseline, setShowBaseline] = useState(true);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [info, setInfo] = useState<DatasetInfo | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [windowCenter, setWindowCenter] = useState<number | null>(null);
  const [windowWidth, setWindowWidth] = useState<number | null>(null);
  const [previewWindowCenter, setPreviewWindowCenter] = useState<number | null>(null);
  const [previewWindowWidth, setPreviewWindowWidth] = useState<number | null>(null);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mtfRoi, setMtfRoi] = useState<{ slice: number; x: number; y: number; size: number } | null>(null);
  const [fwhmPeak, setFwhmPeak] = useState<{ slice: number; x: number; y: number } | null>(null);
  const [dragMode, setDragMode] = useState<null | "roi-move" | "roi-resize" | "peak-move" | "window">(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const windowDragStart = useRef<{ x: number; y: number; center: number; width: number } | null>(null);
  const windowValuesRef = useRef<{ center: number; width: number } | null>(null);

  // When tab changes, jump to the slice where the relevant marker lives.
  useEffect(() => {
    if (!analysis) return;
    const target = activeTab === "MTF" ? mtfRoi?.slice : fwhmPeak?.slice;
    if (target != null) setSliceIndex(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    apiFetch("/api/performance/datasets")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data) => setDatasets(data.datasets ?? []))
      .catch((e) => console.warn("Failed to load performance datasets", e));
  }, []);

  const activeDataset = datasets[0] ?? null;

  const previewUrl = useMemo(() => {
    if (!info || !activeDataset) return "";
    const base = API_BASE_URL;
    const wc = previewWindowCenter ?? info.default_window_center;
    const ww = previewWindowWidth ?? info.default_window_width;
    return `${base}/api/performance/dataset/${activeDataset.id}/slice/${sliceIndex}/preview.png?wc=${wc}&ww=${ww}`;
  }, [info, activeDataset, sliceIndex, previewWindowCenter, previewWindowWidth]);

  const applyAnalysis = (aData: AnalyzeResponse) => {
    setAnalysis(aData);
    setAnalysisDirty(false);
    setMtfRoi({
      slice: aData.edge_slice_index,
      x: aData.mtf.roi_x,
      y: aData.mtf.roi_y,
      size: aData.mtf.roi_size,
    });
    setFwhmPeak({
      slice: aData.peak_slice_index,
      x: aData.peak_col,
      y: aData.peak_row,
    });
  };

  const handleImport = async () => {
    if (!activeDataset) {
      setError(t("service.performance.errorMissingDataset"));
      return;
    }
    setLoading(true);
      setError(null);
    try {
      const infoRes = await apiFetch(`/api/performance/dataset/${activeDataset.id}/slices`);
      if (!infoRes.ok) throw new Error(t("service.performance.errorFetchSlices"));
      const infoData: DatasetInfo = await infoRes.json();
      setImageLoaded(false);
      setInfo(infoData);
      setWindowCenter(infoData.default_window_center);
      setWindowWidth(infoData.default_window_width);
      setPreviewWindowCenter(infoData.default_window_center);
      setPreviewWindowWidth(infoData.default_window_width);
      windowValuesRef.current = { center: infoData.default_window_center, width: infoData.default_window_width };
      const analyzeRes = await apiFetch(`/api/performance/dataset/${activeDataset.id}/analyze`, {
        method: "POST",
      });
      if (!analyzeRes.ok) throw new Error(t("service.performance.errorAnalyze"));
      const aData: AnalyzeResponse = await analyzeRes.json();
      applyAnalysis(aData);
      // Jump to the slice relevant to the active tab so the ROI/peak is visible.
      const targetSlice = activeTab === "MTF" ? aData.edge_slice_index : aData.peak_slice_index;
      setSliceIndex(targetSlice ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.performance.errorImport"));
    } finally {
      setLoading(false);
    }
  };

  const reanalyze = async (
    nextMtf: { slice: number; x: number; y: number; size: number } | null,
    nextPeak: { slice: number; x: number; y: number } | null,
  ) => {
    if (!activeDataset) return;
    const params = new URLSearchParams();
    if (nextMtf) {
      params.set("mtf_slice", String(nextMtf.slice));
      params.set("mtf_x", String(Math.round(nextMtf.x)));
      params.set("mtf_y", String(Math.round(nextMtf.y)));
      params.set("mtf_size", String(nextMtf.size));
    }
    if (nextPeak) {
      params.set("fwhm_slice", String(nextPeak.slice));
      params.set("fwhm_x", String(Math.round(nextPeak.x)));
      params.set("fwhm_y", String(Math.round(nextPeak.y)));
    }
    try {
      setLoading(true);
      const res = await apiFetch(`/api/performance/dataset/${activeDataset.id}/analyze?${params}`, { method: "POST" });
      if (!res.ok) throw new Error(t("service.performance.errorReanalyze"));
      setAnalysis(await res.json() as AnalyzeResponse);
      setAnalysisDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.performance.errorReanalyze"));
    } finally {
      setLoading(false);
    }
  };

  const pointerToImagePx = (e: React.PointerEvent | PointerEvent): { x: number; y: number } | null => {
    if (!imgRef.current || !info) return null;
    const rect = imgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.max(0, Math.min(((e.clientX - rect.left) / rect.width) * info.columns, info.columns - 1)),
      y: Math.max(0, Math.min(((e.clientY - rect.top) / rect.height) * info.rows, info.rows - 1)),
    };
  };

  // Image-pixel -> displayed percentage relative to the <img> element.
  const imageRectStyle = (cx: number, cy: number, sizePx: number) => {
    if (!info || !imageLoaded || !imgRef.current || !overlayRef.current) return undefined;
    const imgRect = imgRef.current.getBoundingClientRect();
    const parentRect = overlayRef.current.getBoundingClientRect();
    const scaleX = imgRect.width / info.columns;
    const scaleY = imgRect.height / info.rows;
    const left = imgRect.left - parentRect.left + (cx - sizePx / 2) * scaleX;
    const top = imgRect.top - parentRect.top + (cy - sizePx / 2) * scaleY;
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${sizePx * scaleX}px`,
      height: `${sizePx * scaleY}px`,
    };
  };

  const imagePointStyle = (cx: number, cy: number) => {
    if (!info || !imageLoaded || !imgRef.current || !overlayRef.current) return undefined;
    const imgRect = imgRef.current.getBoundingClientRect();
    const parentRect = overlayRef.current.getBoundingClientRect();
    const scaleX = imgRect.width / info.columns;
    const scaleY = imgRect.height / info.rows;
    return {
      left: `${imgRect.left - parentRect.left + cx * scaleX}px`,
      top: `${imgRect.top - parentRect.top + cy * scaleY}px`,
    };
  };

  const adjustWindowCenter = (delta: number) => {
    if (!info) return;
    const center = (windowValuesRef.current?.center ?? windowCenter ?? info.default_window_center) + delta;
    const width = windowValuesRef.current?.width ?? windowWidth ?? info.default_window_width;
    windowValuesRef.current = { center, width };
    setWindowCenter(center);
    setPreviewWindowCenter(center);
  };

  const adjustWindowWidth = (delta: number) => {
    if (!info) return;
    const center = windowValuesRef.current?.center ?? windowCenter ?? info.default_window_center;
    const width = Math.max(1, (windowValuesRef.current?.width ?? windowWidth ?? info.default_window_width) + delta);
    windowValuesRef.current = { center, width };
    setWindowWidth(width);
    setPreviewWindowWidth(width);
  };

  const handleOverlayPointerDown = (event: React.PointerEvent, mode: "roi-move" | "roi-resize" | "peak-move") => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragMode(mode);
  };

  const handleImagePointerDown = (event: React.PointerEvent) => {
    if (!info) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    windowDragStart.current = {
      x: event.clientX,
      y: event.clientY,
      center: windowCenter ?? info.default_window_center,
      width: windowWidth ?? info.default_window_width,
    };
    setDragMode("window");
  };

  const handleOverlayPointerMove = (event: React.PointerEvent) => {
    if (!dragMode || !info) return;
    if (dragMode === "window") {
      const start = windowDragStart.current;
      if (!start) return;
      const width = Math.max(1, Math.round(start.width + (event.clientX - start.x) * 4));
      const center = Math.round(start.center - (event.clientY - start.y) * 2);
      windowValuesRef.current = { center, width };
      setWindowWidth(width);
      setWindowCenter(center);
      return;
    }

    const point = pointerToImagePx(event);
    if (!point) return;
    if (dragMode === "roi-move" || dragMode === "roi-resize") {
      setMtfRoi((current) => {
        const roi = current ?? { slice: sliceIndex, x: point.x, y: point.y, size: 48 };
        if (dragMode === "roi-move") return { ...roi, x: point.x, y: point.y };
        const size = Math.max(24, Math.min(192, Math.round(2 * Math.max(Math.abs(point.x - roi.x), Math.abs(point.y - roi.y)))));
        return { ...roi, size };
      });
      return;
    }
    setFwhmPeak((current) => ({ slice: current?.slice ?? sliceIndex, x: point.x, y: point.y }));
  };

  const handleOverlayPointerUp = () => {
    if (!dragMode) return;
    if (dragMode === "window" && windowValuesRef.current) {
      setPreviewWindowCenter(windowValuesRef.current.center);
      setPreviewWindowWidth(windowValuesRef.current.width);
    }
    const needsReanalysis = dragMode !== "window";
    setDragMode(null);
    windowDragStart.current = null;
    if (needsReanalysis) setAnalysisDirty(true);
  };

  // Derive chart inputs from analysis or fall back to demo
  const profile = useMemo(() => {
    if (analysis) {
      if (activeTab === "MTF") {
        return {
          title: analysis.mtf.title,
          subtitle: analysis.mtf.subtitle,
          unit: analysis.mtf.unit,
          yLabel: analysis.mtf.y_label,
          points: analysis.mtf.points,
        };
      }
      const src = activeTab === "FWHM_H" ? analysis.fwhm_h : analysis.fwhm_v;
      return {
        title: src.title,
        subtitle: src.subtitle,
        unit: src.unit,
        yLabel: src.y_label,
        points: src.points,
      };
    }
    const demo = DEMO_PROFILES[activeTab];
    return {
      title: t(demo.titleKey),
      subtitle: t(demo.subtitleKey),
      unit: demo.unit,
      yLabel: demo.yLabel,
      points: demo.points,
    };
  }, [analysis, activeTab, t]);

  const chartWidth = 244;
  const chartHeight = 184;
  const padding = { left: 32, right: 10, top: 12, bottom: 20 };

  const { minX, maxX, minY, maxY, xTicks, yTicks } = useMemo(() => {
    const xs = profile.points.map((p) => p.x);
    const ys = profile.points.map((p) => p.y);
    if (activeTab === "MTF") {
      const mx = Math.max(...xs, 1);
      return {
        minX: 0,
        maxX: Math.min(Math.max(25, Math.ceil(mx)), 30),
        minY: 0,
        maxY: 1,
        xTicks: [0, 5, 10, 15, 20, 25],
        yTicks: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
      };
    }
    const yMax = Math.max(...ys, 1);
    const yMin = Math.min(...ys, 0);
    const span = yMax - yMin || 1;
    const padY = span * 0.05;
    const minXv = Math.min(...xs, 0);
    const maxXv = Math.max(...xs, 1);
    const range = maxXv - minXv;
    const step = Math.max(Math.round(range / 5), 1);
    return {
      minX: minXv,
      maxX: maxXv,
      minY: yMin - padY,
      maxY: yMax + padY,
      xTicks: Array.from({ length: 6 }, (_, i) => Math.round(minXv + i * step)).filter((v) => v <= maxXv),
      yTicks: Array.from({ length: 5 }, (_, i) => yMin + (i * span) / 4),
    };
  }, [profile, activeTab]);

  const toX = (v: number) =>
    padding.left + ((v - minX) / Math.max(maxX - minX, 1e-6)) * (chartWidth - padding.left - padding.right);
  const toY = (v: number) =>
    chartHeight - padding.bottom -
    ((v - minY) / Math.max(maxY - minY, 1e-6)) * (chartHeight - padding.top - padding.bottom);

  const buildPath = (pts: Point[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x)} ${toY(p.y)}`).join(" ");

  const currentPath = buildPath(profile.points);

  // FWHM markers
  const fwhmInfo = useMemo(() => {
    if (activeTab === "MTF") return null;
    if (analysis) {
      const src = activeTab === "FWHM_H" ? analysis.fwhm_h : analysis.fwhm_v;
      const ys = src.points.map((p) => p.y);
      const peakY = Math.max(...ys);
      const baseY = Math.min(...ys);
      const halfMax = baseY + (peakY - baseY) / 2;
      const peakIdx = ys.indexOf(peakY);
      return {
        halfMax,
        x1: src.peak_center - src.fwhm_pixels / 2,
        x2: src.peak_center + src.fwhm_pixels / 2,
        peakCenter: src.peak_center,
        peakIdx,
        fwhmPx: src.fwhm_pixels,
        fwhmMm: src.fwhm_mm,
      };
    }
    const demo = DEMO_PROFILES[activeTab];
    const ys = demo.points.map((p) => p.y);
    const peakY = Math.max(...ys);
    return {
      halfMax: peakY / 2,
      x1: demo.peakCenter - demo.fwhmPx / 2,
      x2: demo.peakCenter + demo.fwhmPx / 2,
      peakCenter: demo.peakCenter,
      peakIdx: ys.indexOf(peakY),
      fwhmPx: demo.fwhmPx,
      fwhmMm: 0,
    };
  }, [activeTab, analysis]);

  return (
    <ServiceModeShell currentRoute="/service/performance">
      <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-3 flex flex-col relative overflow-hidden h-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 rounded-2xl border border-[#D6E2F2] bg-[linear-gradient(180deg,#F8FBFF_0%,#EDF3FA_100%)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_14px_rgba(148,163,184,0.12)]">
            {(Object.keys(tabMeta) as TabKey[]).map((tab) => {
              const active = activeTab === tab;
              const meta = tabMeta[tab];
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`group relative flex h-[42px] min-w-[104px] flex-col items-start justify-center rounded-[14px] border px-4 text-left transition-all duration-200 ${active ? "border-[#BFDBFE] bg-white shadow-[0_8px_18px_rgba(59,130,246,0.18)]" : "border-transparent bg-transparent text-[#94A3B8] hover:border-white/70 hover:bg-white/65"}`}
                >
                  <span className={`text-[12px] font-black tracking-[0.06em] ${active ? meta.accent : "text-[#64748B]"}`}>
                    {tab}
                  </span>
                  <span className={`mt-0.5 text-[10px] font-bold ${active ? "text-[#475569]" : "text-[#A3B2C2] group-hover:text-[#64748B]"}`}>
                    {t(meta.labelKey)}
                  </span>
                  {active && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#60A5FA] shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-[#90A4AE]">{t("service.performance.showBaseline")}</span>
              <div
                onClick={() => setShowBaseline(!showBaseline)}
                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-all duration-200 ${showBaseline ? "bg-[#4D94FF]" : "bg-[#B0C4DE]"}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-all ${showBaseline ? "translate-x-6" : "translate-x-0"}`} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void reanalyze(mtfRoi, fwhmPeak)}
              disabled={loading || !analysisDirty}
              className="flex h-10 items-center gap-2 rounded-full border border-[#B8D8FF] bg-white px-4 text-[12px] font-bold text-[#2563EB] transition-colors hover:bg-[#F0F7FF] disabled:cursor-not-allowed disabled:border-[#E2E8F0] disabled:text-[#A0AEC0]"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("service.performance.recalculate")}
            </button>
            <button
              onClick={handleImport}
              disabled={loading || !activeDataset}
              className="px-6 h-10 bg-[#2F54EB] text-white font-bold rounded-full hover:bg-blue-600 transition-all active:scale-95 shadow-md text-[13px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              {loading ? t("service.performance.analyzing") : t("service.performance.importImages")}
            </button>
          </div>
        </div>

        <div className="flex-1 flex gap-3 overflow-hidden">
          <div className="flex-1 bg-[#050A19] rounded-3xl relative flex items-center justify-center overflow-hidden border border-[#1A2642] shadow-2xl">
            {info && previewUrl ? (
              <>
                <div
                  ref={overlayRef}
                  className="absolute inset-0 flex items-center justify-center"
                  onPointerDown={handleImagePointerDown}
                  onPointerMove={handleOverlayPointerMove}
                  onPointerUp={handleOverlayPointerUp}
                  onPointerCancel={handleOverlayPointerUp}
                >
                  <img
                    ref={imgRef}
                    src={previewUrl}
                    alt={`Slice ${sliceIndex + 1}`}
                    className="max-w-full max-h-full object-contain select-none"
                    draggable={false}
                    onLoad={() => setImageLoaded(true)}
                  />
                  {/* MTF ROI box */}
                  {activeTab === "MTF" && mtfRoi && imageLoaded && (
                    <div
                      className="absolute cursor-move border-2 border-[#FBBF24] shadow-[0_0_18px_rgba(251,191,36,0.5)]"
                      style={imageRectStyle(mtfRoi.x, mtfRoi.y, mtfRoi.size)}
                      onPointerDown={(event) => handleOverlayPointerDown(event, "roi-move")}
                    >
                      <div className="absolute -top-5 left-0 text-[10px] font-black text-[#FBBF24] bg-black/60 px-1.5 py-0.5 rounded">
                        ROI {mtfRoi.size}px
                      </div>
                      <div
                        className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-black/40 bg-[#FBBF24]"
                        onPointerDown={(event) => handleOverlayPointerDown(event, "roi-resize")}
                      />
                      {/* center marker */}
                      <div className="absolute top-1/2 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FBBF24]" />
                    </div>
                  )}
                  {/* FWHM peak marker on its slice */}
                  {activeTab !== "MTF" && fwhmPeak && imageLoaded && (
                    <div
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move"
                      style={imagePointStyle(fwhmPeak.x, fwhmPeak.y)}
                      onPointerDown={(event) => handleOverlayPointerDown(event, "peak-move")}
                    >
                      <div className="w-7 h-7 rounded-full border-2 border-[#22D3EE] shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                      {activeTab === "FWHM_H" && <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-24 h-[1px] bg-[#22D3EE]/70" />}
                      {activeTab === "FWHM_V" && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1px] h-24 bg-[#22D3EE]/70" />}
                    </div>
                  )}
                </div>
                <div className="absolute top-3 left-3 bg-black/60 text-[#7DD3FC] text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wider">
                  SLICE {sliceIndex + 1}/{info.slice_count}
                </div>
                <div className="absolute right-3 top-3 bg-black/60 text-[#94A3B8] text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wider">
                  {info.rows}×{info.columns} · {info.pixel_spacing_mm[0].toFixed(3)} mm/px
                </div>
                <div className="hidden">
                  <span className="text-[9px] font-black tracking-wide text-[#7DD3FC]">图像工具</span>
                  <div className="flex items-center gap-1 border-l border-white/15 pl-2 text-[9px] font-bold" title="ROI 固定显示">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FBBF24]" />
                    ROI
                  </div>
                  <div className="flex items-center gap-1 border-l border-white/15 pl-2 text-[9px] font-bold">
                    <span>WW {windowWidth ?? info.default_window_width}</span>
                    <button type="button" title={`${t("protocolDetail.fieldWindowWidth")} -100`} onClick={() => adjustWindowWidth(-100)} className="flex h-5 w-5 items-center justify-center rounded bg-white/10 hover:bg-white/20"><ChevronLeft size={13} /></button>
                    <button type="button" title={`${t("protocolDetail.fieldWindowWidth")} +100`} onClick={() => adjustWindowWidth(100)} className="flex h-5 w-5 items-center justify-center rounded bg-white/10 hover:bg-white/20"><ChevronRight size={13} /></button>
                  </div>
                  <div className="flex items-center gap-1 border-l border-white/15 pl-2 text-[9px] font-bold">
                    <span>WL {windowCenter ?? info.default_window_center}</span>
                    <button type="button" title={`${t("protocolDetail.fieldWindowLevel")} -20`} onClick={() => adjustWindowCenter(-20)} className="flex h-5 w-5 items-center justify-center rounded bg-white/10 hover:bg-white/20"><ChevronDown size={13} /></button>
                    <button type="button" title={`${t("protocolDetail.fieldWindowLevel")} +20`} onClick={() => adjustWindowCenter(20)} className="flex h-5 w-5 items-center justify-center rounded bg-white/10 hover:bg-white/20"><ChevronUp size={13} /></button>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 border-l border-white/15 pl-2">
                    <span className="text-[9px] font-bold text-[#7DD3FC]">{sliceIndex + 1}</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(info.slice_count - 1, 0)}
                      value={sliceIndex}
                      onChange={(e) => setSliceIndex(Number(e.target.value))}
                      className="min-w-0 flex-1 accent-[#4D94FF]"
                    />
                    <span className="text-[9px] font-bold text-[#7DD3FC]">{info.slice_count}</span>
                  </div>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-xl bg-black/50 px-3 py-2 backdrop-blur">
                  <span className="text-[10px] font-bold tracking-widest text-[#7DD3FC]">1</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(info.slice_count - 1, 0)}
                    value={sliceIndex}
                    onChange={(e) => setSliceIndex(Number(e.target.value))}
                    className="flex-1 accent-[#4D94FF]"
                  />
                  <span className="text-[10px] font-bold tracking-widest text-[#7DD3FC]">{info.slice_count}</span>
                </div>
                <aside className="hidden">
                  <div className="border-b border-white/10 px-1 py-2 text-center">
                    <div className="text-[9px] font-black tracking-[0.12em] text-[#60A5FA]">TOOLS</div>
                    <div className="mt-0.5 text-[8px] font-bold text-[#CBD5E1]">2D</div>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 px-1.5 py-2">
                    <div className="flex h-[50px] w-[52px] flex-col items-center justify-center rounded-[10px] border border-[#FBBF24]/70 bg-[#854D0E]/35 text-[9px] font-bold text-[#FDE68A]" title="ROI">
                      <span className="mb-1 h-4 w-4 border-2 border-[#FBBF24]" />
                      <span>ROI</span>
                    </div>
                    <div className="flex h-[50px] w-[52px] flex-col items-center justify-center rounded-[10px] border border-[#60A5FA] bg-[#2563EB] text-[9px] font-bold text-white shadow-[0_0_12px_rgba(59,130,246,0.45)]" title={t("view.tool.windowLevel")}>
                      <Contrast size={18} />
                      <span className="mt-1 leading-none">WL</span>
                    </div>
                    <div className="my-1 h-px w-full bg-white/10" />
                    <div className="grid w-[52px] grid-cols-2 gap-1">
                      <button type="button" title={`${t("protocolDetail.fieldWindowWidth")} -100`} onClick={() => adjustWindowWidth(-100)} className="flex h-6 items-center justify-center rounded-lg bg-white/5 text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15"><ChevronLeft size={14} /></button>
                      <button type="button" title={`${t("protocolDetail.fieldWindowWidth")} +100`} onClick={() => adjustWindowWidth(100)} className="flex h-6 items-center justify-center rounded-lg bg-white/5 text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15"><ChevronRight size={14} /></button>
                      <button type="button" title={`${t("protocolDetail.fieldWindowLevel")} +20`} onClick={() => adjustWindowCenter(20)} className="flex h-6 items-center justify-center rounded-lg bg-white/5 text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15"><ChevronUp size={14} /></button>
                      <button type="button" title={`${t("protocolDetail.fieldWindowLevel")} -20`} onClick={() => adjustWindowCenter(-20)} className="flex h-6 items-center justify-center rounded-lg bg-white/5 text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15"><ChevronDown size={14} /></button>
                    </div>
                    <div className="mt-1 text-center text-[8px] font-bold leading-4 text-[#93C5FD]">
                      <div>WW {windowWidth ?? info.default_window_width}</div>
                      <div>WL {windowCenter ?? info.default_window_center}</div>
                    </div>
                  </div>
                </aside>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 opacity-40">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#4D94FF] flex items-center justify-center text-[#4D94FF]">
                  <ImageIcon size={32} />
                </div>
                <span className="text-[#4D94FF] text-[14px] font-bold tracking-widest uppercase">
                  {t("service.performance.targetPhantomView")}
                </span>
                {error && (
                  <span className="text-[#F87171] text-[11px] font-bold mt-2 max-w-[280px] text-center">{error}</span>
                )}
              </div>
            )}

            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-24 h-24 border-t border-l border-[#4D94FF]/20 rounded-tl-3xl m-6" />
              <div className="absolute top-0 right-0 w-24 h-24 border-t border-r border-[#4D94FF]/20 rounded-tr-3xl m-6" />
              <div className="absolute bottom-0 left-0 w-24 h-24 border-b border-l border-[#4D94FF]/20 rounded-bl-3xl m-6" />
              <div className="absolute bottom-0 right-0 w-24 h-24 border-b border-r border-[#4D94FF]/20 rounded-br-3xl m-6" />
            </div>
          </div>

          <div className="w-[300px] flex flex-col gap-3 h-full overflow-hidden">
            <div className="flex flex-col flex-1 bg-[#F8FAFC] border border-[#B0C4DE]/50 rounded-3xl p-3 shadow-sm overflow-hidden">
              <div className="flex items-start justify-between gap-3 mb-2 shrink-0">
                <div>
                  <div className="font-black text-[#263238] text-[15px]">{profile.title}</div>
                  <div className="text-[10px] text-[#90A4AE] font-medium leading-[1.2] mt-0.5">
                    {profile.subtitle}
                  </div>
                </div>
                <div className="shrink-0 rounded-full bg-[#E3F2FD] px-2.5 py-1 text-[10px] font-black text-[#1E88E5]">
                  {activeTab}
                </div>
              </div>

              <div className="flex-1 bg-white rounded-2xl border border-[#D7E3F4] shadow-inner p-2 min-h-[180px] flex flex-col">
                <div className="flex-1 items-center justify-center flex overflow-hidden">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(77,148,255,0.25)" />
                        <stop offset="100%" stopColor="rgba(77,148,255,0.01)" />
                      </linearGradient>
                    </defs>

                    {yTicks.map((value, i) => (
                      <line
                        key={`yg-${i}`}
                        x1={padding.left}
                        y1={toY(value)}
                        x2={chartWidth - padding.right}
                        y2={toY(value)}
                        stroke="#E2E8F0"
                        strokeWidth="0.5"
                        strokeDasharray="3 4"
                      />
                    ))}

                    {profile.points.length > 0 && (
                      <path
                        d={`${currentPath} L ${toX(profile.points[profile.points.length - 1].x)} ${toY(minY)} L ${toX(profile.points[0].x)} ${toY(minY)} Z`}
                        fill="url(#curveFill)"
                      />
                    )}

                    {activeTab === "MTF" && analysis && (
                      <>
                        {analysis.mtf.mtf50 !== null && (
                          <g>
                            <line
                              x1={padding.left}
                              y1={toY(0.5)}
                              x2={toX(analysis.mtf.mtf50)}
                              y2={toY(0.5)}
                              stroke="#94A3B8"
                              strokeDasharray="2 2"
                              strokeWidth="1"
                            />
                            <line
                              x1={toX(analysis.mtf.mtf50)}
                              y1={padding.top}
                              x2={toX(analysis.mtf.mtf50)}
                              y2={toY(0)}
                              stroke="#EF4444"
                              strokeDasharray="4 2"
                              strokeWidth="1.5"
                            />
                            <circle cx={toX(analysis.mtf.mtf50)} cy={toY(0.5)} r="3.5" fill="#EF4444" stroke="white" strokeWidth="1.5" />
                            <text x={toX(analysis.mtf.mtf50) + 4} y={toY(0.5) - 6} fontSize="8" fontWeight="bold" fill="#EF4444">
                              MTF50
                            </text>
                          </g>
                        )}
                        {analysis.mtf.mtf10 !== null && (
                          <g>
                            <line
                              x1={padding.left}
                              y1={toY(0.1)}
                              x2={toX(analysis.mtf.mtf10)}
                              y2={toY(0.1)}
                              stroke="#94A3B8"
                              strokeDasharray="2 2"
                              strokeWidth="1"
                            />
                            <line
                              x1={toX(analysis.mtf.mtf10)}
                              y1={padding.top}
                              x2={toX(analysis.mtf.mtf10)}
                              y2={toY(0)}
                              stroke="#3B82F6"
                              strokeDasharray="4 2"
                              strokeWidth="1.5"
                            />
                            <circle cx={toX(analysis.mtf.mtf10)} cy={toY(0.1)} r="3.5" fill="#3B82F6" stroke="white" strokeWidth="1.5" />
                            <text x={toX(analysis.mtf.mtf10) + 4} y={toY(0.1) - 6} fontSize="8" fontWeight="bold" fill="#3B82F6">
                              MTF10
                            </text>
                          </g>
                        )}
                      </>
                    )}
                    {activeTab === "MTF" && !analysis && (
                      <>
                        <g>
                          <line x1={padding.left} y1={toY(0.5)} x2={toX(1.5)} y2={toY(0.5)} stroke="#94A3B8" strokeDasharray="2 2" strokeWidth="1" />
                          <line x1={toX(1.5)} y1={padding.top} x2={toX(1.5)} y2={toY(0)} stroke="#EF4444" strokeDasharray="4 2" strokeWidth="1.5" />
                          <circle cx={toX(1.5)} cy={toY(0.5)} r="3.5" fill="#EF4444" stroke="white" strokeWidth="1.5" />
                          <text x={toX(1.5) + 4} y={toY(0.5) - 6} fontSize="8" fontWeight="bold" fill="#EF4444">MTF50</text>
                        </g>
                        <g>
                          <line x1={padding.left} y1={toY(0.1)} x2={toX(10.5)} y2={toY(0.1)} stroke="#94A3B8" strokeDasharray="2 2" strokeWidth="1" />
                          <line x1={toX(10.5)} y1={padding.top} x2={toX(10.5)} y2={toY(0)} stroke="#3B82F6" strokeDasharray="4 2" strokeWidth="1.5" />
                          <circle cx={toX(10.5)} cy={toY(0.1)} r="3.5" fill="#3B82F6" stroke="white" strokeWidth="1.5" />
                          <text x={toX(10.5) + 4} y={toY(0.1) - 6} fontSize="8" fontWeight="bold" fill="#3B82F6">MTF10</text>
                        </g>
                      </>
                    )}

                    {activeTab !== "MTF" && fwhmInfo && (
                      <>
                        <line
                          x1={padding.left}
                          y1={toY(fwhmInfo.halfMax)}
                          x2={chartWidth - padding.right}
                          y2={toY(fwhmInfo.halfMax)}
                          stroke="#EF4444"
                          strokeDasharray="4 2"
                          strokeWidth="1.2"
                        />
                        <line x1={toX(fwhmInfo.x1)} y1={padding.top} x2={toX(fwhmInfo.x1)} y2={toY(minY)} stroke="#10B981" strokeDasharray="4 2" strokeWidth="1.5" />
                        <line x1={toX(fwhmInfo.x2)} y1={padding.top} x2={toX(fwhmInfo.x2)} y2={toY(minY)} stroke="#10B981" strokeDasharray="4 2" strokeWidth="1.5" />
                      </>
                    )}

                    <path d={currentPath} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

                    <line x1={padding.left} y1={toY(minY)} x2={chartWidth - padding.right} y2={toY(minY)} stroke="#475569" strokeWidth="1" />
                    <line x1={padding.left} y1={padding.top} x2={padding.left} y2={chartHeight - padding.bottom} stroke="#475569" strokeWidth="1" />

                    {yTicks.map((value, i) => (
                      <text key={`y-${i}`} x={padding.left - 6} y={toY(value) + 3} textAnchor="end" fontSize="8" fontWeight="500" fill="#64748B">
                        {Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(value < 1 && value > -1 ? 2 : 0)}
                      </text>
                    ))}
                    {xTicks.map((value, i) => (
                      <text key={`x-${i}`} x={toX(value)} y={chartHeight - 8} textAnchor="middle" fontSize="8" fontWeight="500" fill="#64748B">
                        {value.toFixed(value < 1 && value > -1 ? 1 : 0)}
                      </text>
                    ))}
                  </svg>
                </div>

                <div className="mt-1 flex items-center justify-between text-[8px] font-bold text-[#94A3B8] border-t border-[#F1F5F9] pt-1">
                  <span>{t("service.performance.unitLabel", { value: profile.unit })}</span>
                  <span>{t("service.performance.axisLabel", { value: profile.yLabel })}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-[#D7E3F4] p-4 shadow-sm shrink-0">
              <div className="text-[12px] font-black text-[#1E293B] mb-3 uppercase tracking-tighter flex items-center gap-2">
                <div className="w-1 h-3 bg-[#3B82F6] rounded-full" />
                {t("service.performance.measurementStats")}
              </div>
              <div className="space-y-2">
                {activeTab === "MTF" ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#64748B] font-semibold">{t("service.performance.mtf50Frequency")}</span>
                      <span className="text-[12px] text-[#2563EB] font-black">
                        {analysis?.mtf.mtf50 != null ? `${analysis.mtf.mtf50.toFixed(2)} lp/cm` : "1.5 lp/cm"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#64748B] font-semibold">{t("service.performance.mtf10Frequency")}</span>
                      <span className="text-[12px] text-[#2563EB] font-black">
                        {analysis?.mtf.mtf10 != null ? `${analysis.mtf.mtf10.toFixed(2)} lp/cm` : "10.5 lp/cm"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#64748B] font-semibold">{t("service.performance.fwhmEstimate")}</span>
                      <span className="text-[12px] text-[#059669] font-black">
                        {fwhmInfo ? `${fwhmInfo.fwhmPx.toFixed(2)} px` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#64748B] font-semibold">FWHM (mm)</span>
                      <span className="text-[12px] text-[#059669] font-black">
                        {analysis && fwhmInfo ? `${fwhmInfo.fwhmMm.toFixed(2)} mm` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#64748B] font-semibold">{t("service.performance.peakCenter")}</span>
                      <span className="text-[12px] text-[#059669] font-black">
                        {fwhmInfo ? fwhmInfo.peakCenter.toFixed(1) : "—"}
                      </span>
                    </div>
                  </>
                )}
                <div className="pt-2 border-t border-[#F1F5F9] flex justify-between items-center">
                  <span className="text-[11px] text-[#64748B] font-semibold">{t("service.performance.dataStatus")}</span>
                  <div className="flex items-center gap-1">
                    {analysis ? (
                      <>
                        <span className="text-[12px] text-[#059669] font-black">{t("service.performance.loaded")}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                      </>
                    ) : (
                      <>
                        <span className="text-[12px] text-[#DC2626] font-black">{t("service.performance.demoData")}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-[#DC2626] animate-pulse" />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </ServiceModeShell>
  );
}
