import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Activity, Check, ChevronLeft, ClipboardPenLine, Download, FileText, Play, ScanLine, ShieldAlert, Upload, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import CornerstoneMPRViewport from "../../components/CornerstoneMPRViewport";
import { apiFetch } from "../../lib/apiClient";
import LungLobeSurfaceViewport from "./LungLobeSurfaceViewport";

type Artifact = { id: string; kind: string; label: string; version: string; review: string; overlay_available: boolean; lobe_overlay_available?: boolean; surface_available?: boolean; run_status?: string };
type Study = {
  patient_pseudonym: string;
  body_part: string;
  series: { label: string; image_urls: string[]; instance_count: number };
  artifacts: Artifact[];
  report_draft: string;
  report_assistance?: { provider: string; model: string; artifact_id: string; generated_at: string } | null;
};
type SegmentationOverlay = {
  artifact_id: string;
  label: string;
  source: string;
  rows: number;
  columns: number;
  spans_by_image_index: Record<string, [number, number, number][]>;
  lobe_layers?: Array<{ label: string; color: string; spans_by_image_index: Record<string, [number, number, number][]> }>;
};

const reviewLabel: Record<string, string> = { pending: "待复核", accepted: "已采纳", rejected: "未采纳", ignored: "已忽略" };
const artifactIndex = (index: number) => String(index + 1).padStart(2, "0");
const artifactLayerLabel = (artifact: Artifact) => artifact.surface_available ? "3D" : artifact.overlay_available ? "叠加" : "无图层";
const isAiComparisonReadyArtifact = (artifact: Artifact) => artifact.kind === "ai_preliminary" && (artifact.overlay_available || artifact.surface_available);
const isReviewableArtifact = (artifact: Artifact) => artifact.kind !== "manual_reference" && (artifact.kind !== "ai_preliminary" || isAiComparisonReadyArtifact(artifact));

function SegmentationResultPanel({
  label,
  meta,
  children,
}: {
  label: string;
  meta: string;
  children?: ReactNode;
}) {
  return <div className="relative min-h-0 overflow-hidden border border-[#344348] bg-[#05090a]">
    {children}
    <div className="pointer-events-none absolute left-2 top-2 z-20 bg-black/75 px-2 py-1">
      <p className="font-mono text-[9px] tracking-[.12em] text-[#8fa4a6]">{meta}</p>
      <p className="mt-0.5 max-w-[28ch] truncate text-[11px] font-medium text-[#e4eceb]">{label}</p>
    </div>
  </div>;
}

function EmptySegmentation3D({ message }: { message: string }) {
  return <div className="absolute inset-0 grid place-items-center px-8 text-center text-[12px] leading-5 text-[#8aa4a4]">
    <span>{message}</span>
  </div>;
}

function ReferenceSegmentationPreview({ overlay }: { overlay: SegmentationOverlay | null }) {
  return <EmptySegmentation3D message={overlay ? "参考标注已载入；当前样本仅提供二维 DICOM SEG 轮廓，未生成可对比的三维表面。" : "参考标注暂不可用；导入二维轮廓或三维表面后再对比。"} />;
}

export default function PhysicianWorkstationScreen() {
  const navigate = useNavigate();
  const { studyKey } = useParams<{ studyKey: string }>();
  const currentStudyKey = studyKey ?? "lidc-idri-0314";
  const [study, setStudy] = useState<Study | null>(null);
  const [draft, setDraft] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [manualOverlay, setManualOverlay] = useState<SegmentationOverlay | null>(null);
  const [aiResultVisible, setAiResultVisible] = useState(true);
  const [manualOverlayVisible, setManualOverlayVisible] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportAssistance, setReportAssistance] = useState<Study["report_assistance"]>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [aiStage, setAiStage] = useState("");
  const [offlineBusy, setOfflineBusy] = useState(false);
  const offlineResultInput = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => {
    const artifacts = study?.artifacts ?? [];
    const current = artifacts.find((artifact) => artifact.id === selectedArtifact);
    if (current && isReviewableArtifact(current)) return current;
    return artifacts.find(isReviewableArtifact) ?? artifacts[0];
  }, [selectedArtifact, study]);
  const manualReferenceArtifacts = useMemo(() => (study?.artifacts ?? []).filter((artifact) => artifact.kind === "manual_reference"), [study?.artifacts]);
  const aiComparisonArtifact = useMemo(() => {
    const artifacts = study?.artifacts ?? [];
    if (selected && isAiComparisonReadyArtifact(selected)) return selected;
    const aiArtifacts = artifacts.filter(isAiComparisonReadyArtifact);
    const surfaceAiArtifacts = aiArtifacts.filter((artifact) => artifact.surface_available);
    return surfaceAiArtifacts[surfaceAiArtifacts.length - 1] ?? aiArtifacts[aiArtifacts.length - 1] ?? null;
  }, [selected, study?.artifacts]);
  const manualComparisonArtifact = manualReferenceArtifacts[0] ?? null;
  const artifactGroups = useMemo(() => {
    const artifacts = study?.artifacts ?? [];
    return [
      { kind: "external_benchmark_candidate", title: "B / 历史候选", description: "外部候选 · 供人工复核", artifacts: artifacts.filter((artifact) => artifact.kind === "external_benchmark_candidate") },
      { kind: "wt32_mock", title: "C / WT32 模拟输出", description: "原型结果 · 需人工确认", artifacts: artifacts.filter((artifact) => artifact.kind === "wt32_mock") },
      { kind: "ai_preliminary", title: "D / AI 初步分割", description: "模型输出 · 需医生确认", artifacts: artifacts.filter(isAiComparisonReadyArtifact) },
      { kind: "physician_revision", title: "E / 医生修订", description: "独立图层 · 不改写 AI", artifacts: artifacts.filter((artifact) => artifact.kind === "physician_revision") },
    ].filter((group) => group.artifacts.length);
  }, [study?.artifacts]);
  const artifactQueueIndexes = useMemo(() => {
    const ids = artifactGroups.flatMap((group) => group.artifacts.map((artifact) => artifact.id));
    return new Map(ids.map((id, index) => [id, artifactIndex(index)]));
  }, [artifactGroups]);
  const selectedNeedsReview = !!selected && isReviewableArtifact(selected);
  const orderedSeries = useMemo(() => {
    const imageUrls = study?.series.image_urls ?? [];
    // MPR 必须保持 DICOM 的原始空间顺序；循环重排会在冠/矢状面制造伪断层。
    return { imageUrls };
  }, [study?.series.image_urls]);
  const aiSurfaceUrl = aiComparisonArtifact?.surface_available
    ? `/api/physician/studies/${currentStudyKey}/artifacts/${aiComparisonArtifact.id}/surface`
    : null;

  const loadStudy = useCallback(async () => {
    try {
      setError("");
      const response = await apiFetch(`/api/physician/studies/${currentStudyKey}`);
      if (!response.ok) throw new Error("样本影像暂不可用");
      const next = await response.json() as Study;
      setStudy(next);
      setDraft(next.report_draft);
      setReportAssistance(next.report_assistance);
      setSelectedArtifact((current) => {
        const currentArtifact = next.artifacts.find((artifact) => artifact.id === current);
        if (currentArtifact && isReviewableArtifact(currentArtifact)) return current;
        const aiArtifacts = next.artifacts.filter(isAiComparisonReadyArtifact);
        const surfaceAiArtifacts = aiArtifacts.filter((artifact) => artifact.surface_available);
        return surfaceAiArtifacts[surfaceAiArtifacts.length - 1]?.id ?? aiArtifacts[aiArtifacts.length - 1]?.id ?? next.artifacts.find(isReviewableArtifact)?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法加载工作站样本");
    }
  }, [currentStudyKey]);

  useEffect(() => { void loadStudy(); }, [loadStudy]);

  useEffect(() => {
    const pendingRun = study?.artifacts.find((artifact) => artifact.kind === "ai_preliminary" && (artifact.run_status === "queued" || artifact.run_status === "running"));
    if (!pendingRun) return undefined;

    const runId = pendingRun.id.replace(/^ai-/, "");
    let cancelled = false;
    let timer: number | undefined;
    const poll = async (): Promise<void> => {
      const response = await apiFetch(`/api/physician/studies/${currentStudyKey}/ai-runs/${runId}`);
      if (!response.ok) {
        if (!cancelled) setError("无法读取 AI 初步分割状态");
        return;
      }
      const next = await response.json() as { status: string; stage?: string; error?: string | null };
      if (cancelled) return;
      setAiStage(next.stage ?? next.status);
      if (next.status === "succeeded") {
        await loadStudy();
        return;
      }
      if (next.status === "failed") {
        setError(next.error || "AI 初步分割失败");
        return;
      }
      timer = window.setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [currentStudyKey, loadStudy, study?.artifacts]);

  useEffect(() => {
    if (!manualComparisonArtifact?.overlay_available) {
      setManualOverlay(null);
      return;
    }
    let cancelled = false;
    const loadOverlay = async () => {
      try {
        const response = await apiFetch(`/api/physician/studies/${currentStudyKey}/artifacts/${manualComparisonArtifact.id}/overlay`);
        if (!response.ok) throw new Error("参考标注暂不可用");
        const next = await response.json() as SegmentationOverlay;
        if (!cancelled) setManualOverlay(next);
      } catch (cause) {
        if (!cancelled) {
          setManualOverlay(null);
          setError(cause instanceof Error ? cause.message : "参考标注暂不可用");
        }
      }
    };
    void loadOverlay();
    return () => { cancelled = true; };
  }, [currentStudyKey, manualComparisonArtifact?.id, manualComparisonArtifact?.overlay_available]);

  const updateReview = async (status: "accepted" | "rejected" | "ignored") => {
    if (!selected) return;
    const response = await apiFetch(`/api/physician/studies/${currentStudyKey}/artifacts/${selected.id}/review`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!response.ok) return setError("复核状态未能保存");
    await loadStudy();
  };

  const startAiSegmentation = async () => {
    setAiStage("正在提交 AI 初步分割…");
    const response = await apiFetch(`/api/physician/studies/${currentStudyKey}/ai-runs`, { method: "POST" });
    if (!response.ok) return setError("AI 初步分割服务当前不可用；影像浏览和人工复核仍可继续");
    await loadStudy();
  };

  const exportOfflineJob = async () => {
    setOfflineBusy(true);
    setError("");
    setAiStage("正在生成 DSW 离线任务包…");
    try {
      const response = await apiFetch(`/api/physician/studies/${currentStudyKey}/ai-offline-jobs`, { method: "POST" });
      if (!response.ok) throw new Error("DSW 离线任务包未能生成");
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "wt32-dsw-job.zip";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setAiStage("任务包已下载；上传到 DSW 运行后，再导入结果包");
      await loadStudy();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "DSW 离线任务包未能生成");
    } finally {
      setOfflineBusy(false);
    }
  };

  const importOfflineResult = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setOfflineBusy(true);
    setError("");
    setAiStage("正在校验并导入 DSW 分割结果…");
    try {
      const response = await apiFetch(`/api/physician/studies/${currentStudyKey}/ai-offline-results`, {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      if (!response.ok) throw new Error("结果包无效，或不是当前导出的任务结果");
      const result = await response.json() as { artifact_id: string };
      setSelectedArtifact(result.artifact_id);
      setAiStage("五肺叶初步分割已导入；结果仅供参考，需人工确认");
      await loadStudy();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "DSW 分割结果未能导入");
    } finally {
      setOfflineBusy(false);
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/physician/studies/${currentStudyKey}/report-draft`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: draft }),
      });
      if (!response.ok) throw new Error("草稿未能保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "草稿未能保存");
    } finally { setSaving(false); }
  };

  const generateDraft = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const response = await apiFetch(`/api/physician/studies/${currentStudyKey}/report-draft/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: draft, artifact_id: selected.id }),
      });
      if (!response.ok) throw new Error("报告草稿生成暂不可用，原有内容未改变");
      const next = await response.json() as { content: string; provider: string; model: string };
      setDraft(next.content);
      setReportAssistance({ provider: next.provider, model: next.model, artifact_id: selected.id, generated_at: new Date().toISOString() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "报告草稿生成暂不可用，原有内容未改变");
    } finally { setGenerating(false); }
  };

  return <main className="h-screen overflow-hidden bg-[#101719] text-[#d9e2e4] selection:bg-[#59d7d0]/30">
    <header className="flex h-[62px] shrink-0 items-stretch border-b border-[#344348] bg-[#151e21]">
      <div className="flex min-w-[370px] items-center gap-3 border-r border-[#344348] px-5"><span className="grid h-7 w-7 place-items-center border border-[#59d7d0] text-[#59d7d0]"><ScanLine className="h-4 w-4" /></span><div className="leading-none"><span className="font-mono text-[15px] font-semibold tracking-[.12em] text-[#f1f5f2]">WT32</span><span className="ml-2 text-[11px] tracking-[.12em] text-[#8fa4a6]">IMAGE ANALYSIS</span></div></div>
      <div className="flex min-w-0 flex-1 items-center px-5"><span className="font-mono text-[10px] tracking-[.14em] text-[#657b7d]">APPLICATION /</span><span className="ml-3 text-sm text-[#e4eceb]">肺结节复核</span></div>
      <div className="flex items-center gap-5 border-l border-[#344348] px-5 text-[11px] text-[#8fa4a6]"><span className="font-mono tracking-[.08em]">RESEARCH PROTOTYPE</span><span className="border-l border-[#344348] pl-5 text-[#d9e2e4]">需人工确认</span></div>
    </header>
    <div className="grid h-[calc(100vh-62px)] grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
      <aside className="relative flex min-h-0 flex-col overflow-hidden border-r border-[#344348] bg-[#131c1f]">
        <button onClick={() => navigate("/physician/worklist")} className="flex h-12 w-full items-center gap-1 border-b border-[#344348] bg-[#131c1f] px-5 text-xs text-[#8fa4a6] hover:bg-[#1b272a] hover:text-[#e4eceb]"><ChevronLeft className="h-4 w-4" />检查工作列表</button>
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 p-4">
          <section className="border border-[#3b5557] bg-[#152326] p-2">
            <div className="mb-2 flex items-center justify-between"><span className="font-mono text-[10px] tracking-[.12em] text-[#84b8b5]">DSW 离线分割</span><span className="text-[9px] text-[#71878a]">无需公网网关</span></div>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={offlineBusy} onClick={() => void exportOfflineJob()} className="flex items-center justify-center gap-1 border border-[#59d7d0] px-2 py-1.5 text-[10px] text-[#9fe5df] hover:bg-[#20383a] disabled:opacity-50"><Download className="h-3.5 w-3.5" />1. 导出任务包</button>
              <button disabled={offlineBusy} onClick={() => offlineResultInput.current?.click()} className="flex items-center justify-center gap-1 border border-[#5dba90] px-2 py-1.5 text-[10px] text-[#95d7b4] hover:bg-[#1b3229] disabled:opacity-50"><Upload className="h-3.5 w-3.5" />2. 导入结果包</button>
              <input ref={offlineResultInput} type="file" accept=".zip,application/zip" onChange={(event) => void importOfflineResult(event)} className="hidden" />
            </div>
          </section>
          <section className="border-b border-[#344348] pb-3"><p className="font-mono text-[10px] tracking-[.16em] text-[#6f8587]">01 / CASE CONTEXT</p><div className="mt-2 flex items-end justify-between gap-3"><h1 className="font-mono text-lg font-semibold tracking-tight text-[#f1f5f2]">{study?.patient_pseudonym ?? "载入中"}</h1><span className="font-mono text-[10px] text-[#8fa4a6]">{study?.body_part ?? "—"} · {study?.series.instance_count ?? "—"} IMG</span></div><button className="mt-3 flex w-full items-center justify-between border-l-2 border-[#59d7d0] bg-[#1a2d30] px-3 py-2 text-left text-sm text-[#e2eeee] hover:bg-[#20383a]"><span className="font-medium">{study?.series.label ?? "Chest CT"}</span><span className="font-mono text-[10px] tracking-[.1em] text-[#75b7b4]">PRIMARY</span></button></section>
          <section className="min-h-0"><div className="flex items-center justify-between border-b border-[#344348] pb-2"><p className="font-mono text-[10px] tracking-[.16em] text-[#6f8587]">02 / REVIEW MATERIAL</p><button onClick={() => void startAiSegmentation()} className="flex items-center gap-1 border border-[#59d7d0] bg-[#59d7d0] px-2 py-1 text-[11px] font-medium text-[#102022] hover:bg-[#8be6df]"><Play className="h-3.5 w-3.5" />AI 自动分割</button></div><div className="border-b border-[#344348]">{artifactGroups.map((group) => <div key={group.kind}><div className="border-b border-[#2d3d40] bg-[#111a1c] px-2 py-1"><span className="font-mono text-[9px] tracking-[.12em] text-[#84b8b5]">{group.title}</span></div>{group.artifacts.map((artifact) => { const queueIndex = artifactQueueIndexes.get(artifact.id) ?? "--"; const needsReview = isReviewableArtifact(artifact); return <button key={artifact.id} onClick={() => setSelectedArtifact(artifact.id)} className={`grid w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 !rounded-none !border-x-0 !border-t-0 border-b border-[#344348] py-1.5 text-left ${selected?.id === artifact.id ? "border-l-2 !border-l-[#59d7d0] bg-[#1a2d30] pl-2" : "bg-transparent hover:bg-[#192528]"}`}><span className={`font-mono text-[10px] ${selected?.id === artifact.id ? "text-[#82ded8]" : "text-[#829496]"}`}>{queueIndex}</span><span className="min-w-0 truncate text-xs font-medium text-[#e2eae9]">{artifact.label}</span><span className="flex items-center gap-1.5 text-right font-mono text-[10px]"><span className={artifact.overlay_available || artifact.surface_available ? "text-[#84c9c6]" : "text-[#71878a]"}>{artifactLayerLabel(artifact)}</span><span className={needsReview ? "text-[#8fa4a6]" : "text-[#62777a]"}>{needsReview ? reviewLabel[artifact.review] ?? "待复核" : "参考"}</span></span></button>; })}</div>)}</div></section>
          <section className="border-t border-[#344348] pt-3"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] tracking-[.16em] text-[#6f8587]">03 / HUMAN REVIEW</p><p className="mt-1 truncate text-[11px] text-[#8fa4a6]">{selectedNeedsReview ? selected?.label ?? "选择结果" : "参考标注"}</p></div><button onClick={() => setReportOpen(true)} className="flex items-center gap-1 border border-[#4c6063] px-2 py-1 text-[11px] text-[#aebabb] hover:bg-[#243235]"><ClipboardPenLine className="h-3.5 w-3.5" />报告</button></div>{selectedNeedsReview ? <div className="mt-2 grid grid-cols-3 gap-2"><button onClick={() => void updateReview("accepted")} className="border border-[#5dba90] bg-[#14251f] py-1.5 text-xs text-[#95d7b4] hover:bg-[#1b3229]"><Check className="mx-auto mb-0.5 h-3.5 w-3.5" />采纳</button><button onClick={() => void updateReview("rejected")} className="border border-[#bc6e74] bg-[#2c1a1d] py-1.5 text-xs text-[#eea1a6] hover:bg-[#392124]"><ShieldAlert className="mx-auto mb-0.5 h-3.5 w-3.5" />不采纳</button><button onClick={() => void updateReview("ignored")} className="border border-[#526568] bg-[#192427] py-1.5 text-xs text-[#b5c0c1] hover:bg-[#1b282a]">忽略</button></div> : null}</section>
        </div>
        {reportOpen && <section className="absolute inset-0 z-20 flex flex-col bg-[#131c1f] p-5"><div className="flex items-center justify-between border-b border-[#344348] pb-3"><div className="flex items-center gap-2"><ClipboardPenLine className="h-4 w-4 text-[#8fa4a6]" /><p className="font-mono text-[10px] tracking-[.16em] text-[#8fa4a6]">REPORT NOTES</p></div><button onClick={() => setReportOpen(false)} aria-label="关闭报告草稿" className="grid h-7 w-7 place-items-center border border-[#4c6063] text-[#aebabb] hover:bg-[#243235]"><X className="h-4 w-4" /></button></div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="记录供人工确认的观察摘要…" className="mt-4 min-h-0 flex-1 resize-none border border-[#3d4e51] bg-[#0f1719] p-3 text-sm leading-6 text-[#d9e2e4] outline-none placeholder:text-[#62777a] focus:border-[#59d7d0]" /><div className="mt-3 grid grid-cols-2 gap-2"><button disabled={generating} onClick={() => void generateDraft()} className="flex items-center justify-center gap-2 border border-[#59d7d0] bg-[#1a2d30] py-2.5 text-xs text-[#9fe5df] hover:bg-[#20383a] disabled:opacity-60"><Activity className="h-4 w-4" />{generating ? "生成中" : "生成参考草稿"}</button><button disabled={saving} onClick={() => void saveDraft()} className="flex items-center justify-center gap-2 border border-[#4c6063] bg-[#202d30] py-2.5 text-xs text-[#e2eae9] hover:bg-[#2a3a3d] disabled:opacity-60"><FileText className="h-4 w-4" />{saving ? "保存中" : "保存草稿"}</button></div><p className="mt-3 flex gap-1 text-[11px] leading-4 text-[#71878a]"><Activity className="mt-0.5 h-3 w-3 shrink-0" />{reportAssistance ? `${reportAssistance.provider} / ${reportAssistance.model} 已生成参考文本；编辑并保存后才保留为草稿。` : "原型草稿，不是正式临床报告；需人工确认。"}</p></section>}
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col bg-[#0b1012] p-4">
        <div className="mb-3 flex items-center justify-between border-b border-[#28383b] pb-3">
          <div>
            <p className="font-mono text-[10px] tracking-[.16em] text-[#6f8587]">SEGMENTATION TOOLS / 01</p>
            <h2 className="mt-1 text-sm font-medium text-[#e4eceb]">图像分割工具区域 <span className="ml-2 font-mono text-[10px] font-normal text-[#71878a]">DICOM · CHEST · 1 MM</span></h2>
            {aiStage && <p className="mt-1 text-[10px] text-[#84c9c6]">{aiStage}</p>}
          </div>
          <div className="flex items-center gap-2 text-xs" aria-label="图像分割工具">
            <button type="button" title="显示或隐藏 AI 三维分割结果" onClick={() => setAiResultVisible((value) => !value)} disabled={!aiComparisonArtifact} className={`border px-3 py-1.5 ${aiResultVisible && aiComparisonArtifact ? "border-[#59d7d0] bg-[#1a2d30] text-[#9fe5df]" : "border-[#3b4c4f] bg-[#182326] text-[#71878a]"} disabled:cursor-not-allowed`}>AI 结果显示</button>
            <button type="button" title="显示或隐藏参考标注" onClick={() => setManualOverlayVisible((value) => !value)} disabled={!manualComparisonArtifact} className={`border px-3 py-1.5 ${manualOverlayVisible && manualComparisonArtifact ? "border-[#f59e0b] bg-[#2b2112] text-[#fbd38d]" : "border-[#3b4c4f] bg-[#182326] text-[#71878a]"} disabled:cursor-not-allowed`}>参考标注显示</button>
            <button type="button" disabled title="医生三维修订工具尚未启用" className="border border-[#3b4c4f] bg-[#182326] px-3 py-1.5 text-[#62777a] disabled:cursor-not-allowed">医生修订</button>
          </div>
        </div>
        <div className="grid min-h-[520px] flex-1 grid-cols-[0.9fr_1.25fr_1.25fr] gap-3 overflow-hidden">
          <div className="relative min-h-0 overflow-hidden border border-[#344348] bg-black">
            {orderedSeries.imageUrls.length ? <CornerstoneMPRViewport imageUrls={orderedSeries.imageUrls} activeTool="stackScroll" renderMode="MPR" layoutMode="vertical-three" volumePanelMode="slab" windowCenter={-600} windowWidth={1500} showCrosshairs={false} showAnnotations={false} stateKey={`physician-${currentStudyKey}-mpr-column`} className="absolute inset-0 grid grid-cols-1 grid-rows-3 gap-px overflow-hidden bg-[#0F172A]" /> : <div className="grid h-full place-items-center text-sm text-[#71878a]">{error || "正在加载 MPR"}</div>}
            <div className="pointer-events-none absolute left-2 top-2 bg-black/75 px-2 py-1"><p className="font-mono text-[9px] tracking-[.12em] text-[#8fa4a6]">MPR / 三视图</p><p className="mt-0.5 text-[11px] font-medium text-[#e4eceb]">轴位 · 冠状 · 矢状</p></div>
          </div>
          <SegmentationResultPanel label={aiComparisonArtifact?.label ?? "AI 初步分割待生成"} meta="AI 三维分割结果">
            {aiResultVisible ? <LungLobeSurfaceViewport surfaceUrl={aiSurfaceUrl} /> : <EmptySegmentation3D message="AI 三维结果已隐藏。" />}
          </SegmentationResultPanel>
          <SegmentationResultPanel label={manualComparisonArtifact ? `参考标注（${manualReferenceArtifacts.length} 组，二维轮廓）` : "暂无参考标注"} meta="参考标注对比">
            {manualOverlayVisible ? <ReferenceSegmentationPreview overlay={manualOverlay} /> : <EmptySegmentation3D message="参考标注已隐藏。" />}
          </SegmentationResultPanel>
        </div>
        <div className="mt-3 flex items-center gap-5 border-t border-[#28383b] pt-3 text-[11px] text-[#71878a]"><span className="font-mono">RESULT / AI {aiResultVisible && aiComparisonArtifact ? "显示" : "未显示"} · 参考标注 {manualOverlayVisible && manualComparisonArtifact ? "显示" : "未显示"}</span><span>AI 三维 / 参考二维轮廓</span><span>需人工确认</span>{error && <span className="text-[#e8b87b]">{error}</span>}</div>
      </section>
    </div>
  </main>;
}
