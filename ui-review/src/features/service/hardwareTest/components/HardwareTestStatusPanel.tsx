import type { HardwareTestLog } from "../types";

type HardwareTestStatusPanelProps = {
  logs: HardwareTestLog[];
  onClearLogs: () => void;
  runningCount: number;
};

export function HardwareTestStatusPanel({
  logs,
  onClearLogs,
  runningCount,
}: HardwareTestStatusPanelProps) {
  return (
    <section className="mt-4 rounded-md border border-[#B0C4DE] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${runningCount > 0 ? "bg-[#2F67D8]" : "bg-[#90A4AE]"}`} />
          <div>
            <div className="text-[14px] font-black text-[#31485E]">操作日志</div>
            <div className="text-[12px] text-[#7B92A8]">
              最近 {logs.length} 条记录
              {runningCount > 0 ? `，当前有 ${runningCount} 项动作运行中` : "，当前无动作运行"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClearLogs}
          className="rounded-full border border-[#D7E3F0] px-4 py-2 text-[12px] font-black text-[#5D7288] transition-colors hover:bg-[#F8FAFC]"
        >
          清空日志
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-[#F8FAFD]">
        <div className="grid grid-cols-[96px_88px_1.1fr_1.2fr_100px] border-b border-[#DCE6F0] px-4 py-3 text-[12px] font-black tracking-[0.04em] text-[#7B92A8]">
          <div>时间</div>
          <div>模块</div>
          <div>动作</div>
          <div>参数快照</div>
          <div>结果</div>
        </div>

        <div className="max-h-[172px] overflow-y-auto custom-scrollbar">
          {logs.length === 0 ? (
            <div className="px-4 py-6 text-[13px] font-medium text-[#9FB0C0]">暂无日志</div>
          ) : (
            logs.map((log, index) => (
              <div
                key={log.id}
                className={`grid grid-cols-[96px_88px_1.1fr_1.2fr_100px] px-4 py-3 text-[13px] text-[#31485E] ${
                  index < logs.length - 1 ? "border-b border-[#E7EEF7]" : ""
                }`}
              >
                <div className="font-mono text-[#6A7F96]">{log.time}</div>
                <div className="font-bold">{log.module}</div>
                <div className="font-semibold">{log.actionName}</div>
                <div className="truncate text-[#6A7F96]" title={log.paramsSnapshot}>
                  {log.paramsSnapshot}
                </div>
                <div className="font-bold text-[#2F67D8]">{log.result}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
