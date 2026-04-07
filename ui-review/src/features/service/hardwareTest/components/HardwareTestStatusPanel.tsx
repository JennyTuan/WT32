import type { HardwareTestLog } from "../types";

type HardwareTestStatusPanelProps = {
  logs: HardwareTestLog[];
  onClearLogs: () => void;
};

const toneClassMap = {
  active: "text-[#52C41A]",
  normal: "text-white opacity-80",
  muted: "text-white opacity-40",
} as const;

export function HardwareTestStatusPanel({
  logs,
  onClearLogs,
}: HardwareTestStatusPanelProps) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-black text-[#90A4AE]">运行状态</span>
          <div className="w-2 h-2 rounded-full bg-[#52C41A] shadow-[0_0_8px_rgba(82,196,26,0.5)]" />
        </div>
        <button
          onClick={onClearLogs}
          className="bg-transparent border-0 p-0 m-0 shadow-none appearance-none text-[12px] font-black text-[#90A4AE] hover:text-[#546E7A] transition-colors"
        >
          清除日志
        </button>
      </div>

      <div className="h-[100px] bg-black rounded-xl p-4 font-mono text-[13px] border-l-4 border-[#2F54EB] overflow-y-auto custom-scrollbar shadow-inner">
        {logs.length === 0 ? (
          <div className="text-white opacity-40 leading-relaxed">暂无日志</div>
        ) : (
          logs.map((log) => (
            <div key={log.message} className={`${toneClassMap[log.tone]} leading-relaxed`}>
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
