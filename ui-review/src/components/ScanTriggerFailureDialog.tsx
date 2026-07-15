import { AlertCircle, RotateCcw } from "lucide-react";

type ScanTriggerFailureDialogProps = {
    failure: { title: string; message: string } | null;
    onRetry: () => void;
    onReturnToConfirm: () => void;
};

/**
 * 扫描按键流程的本地恢复出口：设备告警仍由全局错误中心展示，
 * 此处只负责让当前执行页退出不可继续操作的按键状态。
 */
export default function ScanTriggerFailureDialog({
    failure,
    onRetry,
    onReturnToConfirm,
}: ScanTriggerFailureDialogProps) {
    if (!failure) return null;

    return (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-[#0F172A]/55 p-8 backdrop-blur-[1px]">
            <div role="alertdialog" aria-modal="true" aria-labelledby="scan-trigger-failure-title" className="w-[480px] rounded-2xl border border-[#FCA5A5] bg-white p-6 shadow-2xl">
                <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FEE2E2] text-[#DC2626]">
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <h2 id="scan-trigger-failure-title" className="text-[18px] font-black text-[#1E293B]">{failure.title}</h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-[#475569]">{failure.message}</p>
                    </div>
                </div>
                <p className="mt-5 rounded-lg bg-[#F8FAFC] px-4 py-3 text-[11px] leading-relaxed text-[#64748B]">
                    本界面仅模拟扫描流程；请确认设备状态和患者准备情况后再重新触发。
                </p>
                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onReturnToConfirm} className="h-10 rounded-lg border border-[#94A3B8] bg-white px-4 text-[12px] font-bold text-[#475569] hover:bg-slate-50">
                        返回确认
                    </button>
                    <button type="button" onClick={onRetry} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 text-[12px] font-bold text-white hover:bg-[#1D4ED8]">
                        <RotateCcw size={15} />
                        重新尝试
                    </button>
                </div>
            </div>
        </div>
    );
}
