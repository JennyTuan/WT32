import type { HardwareTestLog } from "../types";

type HardwareTestStatusPanelProps = {
  logs: HardwareTestLog[];
  onClearLogs: () => void;
};

const resultToneStyles = {
  success: "text-[#16A34A]",
  warning: "text-[#D97706]",
  error: "text-[#DC2626]",
  info: "text-[#2F7BFF]",
} as const;

export function HardwareTestStatusPanel({ logs, onClearLogs }: HardwareTestStatusPanelProps) {
  return (
    <div className="shrink-0 bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#EEF2F9] bg-[#F8FAFC]">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#475569]">操作日志</span>
          <span className="text-[11px] text-[#94A3B8]">最近 {logs.length} 条记录，当前无动作运行</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] ml-1" />
        </div>
        <button
          onClick={onClearLogs}
          className="text-[11px] font-medium text-[#94A3B8] hover:text-[#475569] transition-colors px-2 py-0.5 rounded hover:bg-[#F1F5F9]"
        >
          清空日志
        </button>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[100px_80px_120px_1fr_1fr] px-5 py-1.5 border-b border-[#F1F5F9]">
        {["时间", "模块", "动作", "参数快照", "结果"].map((col) => (
          <div key={col} className="text-[10px] font-semibold text-[#CBD5E1] tracking-widest uppercase">
            {col}
          </div>
        ))}
      </div>

      {/* Log rows */}
      <div className="max-h-[120px] overflow-y-auto">
        {logs.length === 0 ? (
          <div className="px-5 py-3 text-[12px] text-[#CBD5E1] italic">暂无日志</div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`grid grid-cols-[100px_80px_120px_1fr_1fr] items-center px-5 py-2 ${i < logs.length - 1 ? "border-b border-[#F8FAFC]" : ""} hover:bg-[#FAFCFF] transition-colors`}
            >
              <div className="text-[11px] font-mono text-[#94A3B8]">{log.time}</div>
              <div className="text-[12px] font-medium text-[#475569]">{log.module}</div>
              <div className="text-[12px] text-[#475569]">{log.action}</div>
              <div className="text-[12px] text-[#94A3B8]">{log.params}</div>
              <div className={`text-[12px] font-medium ${resultToneStyles[log.resultTone]}`}>{log.result}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
