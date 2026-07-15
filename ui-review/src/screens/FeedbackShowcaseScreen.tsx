import { CheckCircle2, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { FeedbackNotice, FeedbackViewportOverlay } from "../components/FeedbackNotice";
import { FEEDBACK_TONE_STYLES } from "../components/feedbackStyles";

export default function FeedbackShowcaseScreen() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#EEF3F8] text-[#1E293B]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#DCE6F2] bg-white px-6">
        <div>
          <h1 className="text-[18px] font-black">错误与状态反馈 UI 预览</h1>
          <p className="text-[11px] font-medium text-[#64748B]">本地开发验收页 · 1024 × 768</p>
        </div>
        <span className="rounded-full bg-[#E3F2FD] px-3 py-1 text-[11px] font-bold text-[#1565C0]">DEV ONLY</span>
      </header>

      <main className="grid min-h-0 flex-1 grid-rows-[170px_minmax(0,1fr)] gap-4 p-4">
        <section className="grid grid-cols-3 gap-4">
          <PreviewCard title="普通错误 · Inline">
            <FeedbackNotice compact title="保存失败">
              无法保存患者信息，请检查必填项后重试。
            </FeedbackNotice>
          </PreviewCard>

          <PreviewCard title="设备警告 · Banner">
            <FeedbackNotice
              tone="warning"
              title="设备警告 · 0x02010003"
              action={<button type="button" className="h-9 rounded-md bg-[#D97706] px-3 text-[11px] font-bold text-white">确认知悉</button>}
            >
              通信状态异常，请核对当前设备状态。
            </FeedbackNotice>
          </PreviewCard>

          <PreviewCard title="任务状态 · Info / Success">
            <div className="flex flex-col gap-2">
              <FeedbackNotice tone="info" compact>重建任务正在运行 · 64%</FeedbackNotice>
              <FeedbackNotice tone="success" compact>重建完成，结果已关联。</FeedbackNotice>
            </div>
          </PreviewCard>
        </section>

        <section className="grid min-h-0 grid-cols-[0.9fr_1.1fr] gap-4">
          <PreviewCard title="影像加载错误 · Viewport Overlay" className="min-h-0">
            <div className="relative h-full min-h-[310px] overflow-hidden rounded-lg bg-[#020617]">
              <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_45%_45%,#94A3B8_0%,#334155_18%,#020617_52%)]" />
              <FeedbackViewportOverlay title="影像加载失败" message="无法连接影像服务，请检查网络后重试。" />
            </div>
          </PreviewCard>

          <PreviewCard title="严重设备错误 · Blocking Dialog" className="min-h-0">
            <div className="flex h-full min-h-[310px] items-center justify-center rounded-lg bg-[#0F172A]/55 p-5">
              <div role="alertdialog" aria-modal="true" className="w-full max-w-[520px] rounded-xl border-t-4 border-[#B91C1C] bg-white p-5 shadow-2xl">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${FEEDBACK_TONE_STYLES.fatal.badge}`}>
                    <ShieldAlert size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <h2 className="text-[16px] font-black">设备通信链路中断</h2>
                      <span className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-1 font-mono text-[10px] font-bold text-[#475569]">0x02010003</span>
                    </div>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-[76px_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[11px]">
                  <dt className="font-bold text-[#64748B]">所属模块</dt><dd className="font-semibold">通信控制</dd>
                  <dt className="font-bold text-[#64748B]">来源</dt><dd>错误状态上报</dd>
                  <dt className="font-bold text-[#64748B]">参考处理</dt><dd>核对设备连接状态，恢复操作需要确认。</dd>
                </dl>
                <FeedbackNotice tone="warning" compact className="mt-3 shadow-none">
                  通信告警信息仅供状态核对；任何恢复操作均需要确认。
                </FeedbackNotice>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="flex h-9 items-center gap-1.5 rounded-md bg-[#B91C1C] px-4 text-[11px] font-bold text-white">
                    <CheckCircle2 size={14} />确认知悉
                  </button>
                </div>
              </div>
            </div>
          </PreviewCard>
        </section>
      </main>
    </div>
  );
}

function PreviewCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <article className={`flex flex-col rounded-xl border border-[#DCE6F2] bg-white p-4 shadow-sm ${className}`}>
      <h2 className="mb-3 text-[12px] font-black text-[#475569]">{title}</h2>
      <div className="min-h-0 flex-1">{children}</div>
    </article>
  );
}
