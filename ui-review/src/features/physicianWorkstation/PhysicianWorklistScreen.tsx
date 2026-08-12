import { useEffect, useState } from "react";
import { ChevronRight, ScanLine } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../../lib/apiClient";

type WorklistItem = { study_key: string; patient_pseudonym: string; body_part: string; series_count: number; status: string };

export default function PhysicianWorklistScreen() {
  const navigate = useNavigate();
  const [items, setItems] = useState<WorklistItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await apiFetch("/api/physician/worklist");
      if (!response.ok) return setError("检查工作列表暂不可用");
      const body = await response.json() as { items: WorklistItem[] };
      setItems(body.items);
    })();
  }, []);

  return <main className="min-h-screen bg-[#101719] p-10 text-[#d9e2e4]"><header className="flex items-center gap-3 border-b border-[#344348] pb-6"><span className="grid h-9 w-9 place-items-center border border-[#59d7d0] text-[#59d7d0]"><ScanLine className="h-5 w-5" /></span><div><p className="font-mono text-sm tracking-[.16em] text-[#f1f5f2]">WT32 IMAGE ANALYSIS</p><p className="mt-1 text-xs text-[#8fa4a6]">检查工作列表 · 研究原型</p></div></header><section className="mx-auto mt-12 max-w-4xl"><p className="font-mono text-xs tracking-[.16em] text-[#6f8587]">AVAILABLE STUDIES</p>{error ? <p className="mt-6 text-sm text-[#e8b87b]">{error}</p> : <div className="mt-4 border-y border-[#344348]">{items.map((item) => <button key={item.study_key} onClick={() => navigate(`/physician/studies/${item.study_key}/pulmonary-nodule`)} className="grid w-full grid-cols-[1fr_auto] items-center gap-4 border-b border-[#344348] px-5 py-5 text-left last:border-b-0 hover:bg-[#192528]"><span><span className="block font-mono text-lg text-[#f1f5f2]">{item.patient_pseudonym}</span><span className="mt-2 block text-xs text-[#8fa4a6]">{item.body_part} · {item.series_count} 组序列 · {item.status}</span></span><span className="flex items-center gap-2 text-sm text-[#80d6d0]">肺结节分析 <ChevronRight className="h-4 w-4" /></span></button>)}</div>}</section></main>;
}
