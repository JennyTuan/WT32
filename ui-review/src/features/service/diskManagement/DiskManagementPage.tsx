import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Database,
  FileCode,
  Lock,
  RotateCcw,
  Search,
  Share2,
  Trash2,
} from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";

type StorageCardProps = {
  title: string;
  icon: React.ElementType;
  color: string;
  percent: number;
  threshold: number;
  isExpanded: boolean;
  onToggle: () => void;
};

const StorageCard = ({
  title,
  icon: Icon,
  color,
  percent,
  threshold,
  isExpanded,
  onToggle,
}: StorageCardProps) => (
  <div className="bg-white border border-[#B0C4DE]/40 rounded-2xl shadow-sm overflow-hidden mb-4 transition-all hover:shadow-md">
    <div className="p-5 flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
          style={{ backgroundColor: color }}
        >
          <Icon size={22} />
        </div>
        <div className="flex flex-col gap-1 w-full max-w-[500px]">
          <span className="text-[16px] font-black text-[#263238] uppercase tracking-wide">{title}</span>
          <div className="w-full h-1.5 bg-[#EEF2F9] rounded-full overflow-hidden mt-1">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${percent}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-[11px] font-bold text-[#90A4AE]">
            使用率: <span className="text-[#263238]">{percent}%</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-bold text-[#546E7A]">阈值</span>
          <div className="flex items-center bg-[#F8FAFC] border border-[#B0C4DE] rounded-md h-[28px] px-2 gap-2 shadow-inner">
            <input
              type="text"
              value={threshold}
              readOnly
              className="w-6 bg-transparent text-[13px] font-black text-[#263238] text-center"
            />
            <div className="flex flex-col border-l border-[#B0C4DE]/30 pl-1">
              <ChevronDown size={10} className="rotate-180 text-[#B0C4DE]" />
              <ChevronDown size={10} className="text-[#B0C4DE]" />
            </div>
          </div>
          <span className="text-[12px] font-bold text-[#B0C4DE]">%</span>
        </div>

        <div className="flex items-center gap-2">
          <button className="w-8 h-8 rounded-full border border-[#B0C4DE] flex items-center justify-center text-[#546E7A] hover:bg-gray-50 transition-colors">
            <RotateCcw size={16} />
          </button>
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-full border border-[#B0C4DE] flex items-center justify-center text-[#546E7A] hover:bg-gray-50 transition-colors"
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>
    </div>

    {isExpanded && (
      <div className="border-t border-[#EEF2F9] bg-[#F8FAFC]/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[13px] font-black text-[#546E7A]">已选择 0 项</span>
          <div className="flex gap-2">
            <button className="px-5 h-8 bg-[#4D94FF] text-white text-[12px] font-bold rounded shadow-sm hover:bg-[#3B82F6] transition-colors">
              保留选中
            </button>
            <button className="px-5 h-8 bg-white border border-[#B0C4DE] text-[#263238] text-[12px] font-bold rounded shadow-sm hover:bg-gray-50 transition-colors">
              释放选中
            </button>
            <button className="px-5 h-8 bg-[#FF4D4F] text-white text-[12px] font-bold rounded shadow-sm hover:bg-[#D9363E] transition-colors">
              删除选中
            </button>
          </div>
        </div>

        <table className="w-full border-collapse bg-white rounded-lg border border-[#B0C4DE]/30 overflow-hidden shadow-sm">
          <thead className="bg-[#EEF2F9] h-10 text-[11px] font-black text-[#546E7A] uppercase tracking-wider">
            <tr>
              <th className="w-10 text-center border-r border-white">
                <input type="checkbox" className="accent-[#4D94FF]" />
              </th>
              <th className="px-4 text-left border-r border-white">患者ID</th>
              <th className="px-4 text-left border-r border-white">检查协议名称</th>
              <th className="px-4 text-left border-r border-white">扫描序列</th>
              <th className="px-4 text-center border-r border-white">状态</th>
              <th className="px-4 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="text-[12px] text-[#546E7A]">
            {[
              { id: "P00001", protocol: "CT胸部平扫", sequence: "4D", status: "保留" },
              { id: "P00002", protocol: "CT头颅平扫", sequence: "4D", status: "" },
              { id: "P00003", protocol: "CT头颅平扫", sequence: "Enhance", status: "" },
            ].map((row, index) => (
              <tr key={index} className="h-10 border-b border-[#EEF2F9] hover:bg-[#F3F7FA] transition-colors">
                <td className="text-center">
                  <input type="checkbox" className="accent-[#4D94FF]" />
                </td>
                <td className="px-4 font-bold">{row.id}</td>
                <td className="px-4">{row.protocol}</td>
                <td className="px-4">{row.sequence}</td>
                <td className="px-4 text-center">
                  {row.status === "保留" && (
                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-[#E3F2FD] text-[#4D94FF] rounded-full mx-auto w-fit font-bold text-[10px] border border-[#4D94FF]/20">
                      <Lock size={10} /> 保留
                    </div>
                  )}
                </td>
                <td className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button className="w-6 h-6 rounded flex items-center justify-center border border-[#B0C4DE] text-[#546E7A] hover:bg-gray-50">
                      <Share2 size={12} />
                    </button>
                    <button className="w-6 h-6 rounded flex items-center justify-center bg-[#FF4D4F] text-white hover:bg-[#D9363E] shadow-sm">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default function DiskManagementScreen() {
  const [expandedCard, setExpandedCard] = useState<string | null>("RawData");
  const [autoCleanup, setAutoCleanup] = useState(false);

  return (
    <ServiceModeShell currentRoute="/service/disk">
      <section className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 h-full">
        <div className="bg-white border border-[#B0C4DE] rounded-md shadow-sm p-6 flex flex-col shrink-0 gap-4">
          <div className="flex items-center justify-between">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索患者ID..."
                className="w-[380px] h-[36px] pl-10 pr-4 bg-[#F8FAFC] border border-[#B0C4DE] rounded-md text-[13px] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20 transition-all font-medium"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" size={16} />
            </div>
            <button className="flex items-center gap-2 px-6 h-[36px] bg-white border border-[#B0C4DE] text-[#263238] font-bold rounded-full hover:bg-gray-50 transition-all active:scale-95 shadow-sm text-[12px]">
              <RotateCcw size={16} className="text-[#4D94FF]" /> 刷新
            </button>
          </div>

          <div className="flex items-center gap-8 pt-2 border-t border-[#EEF2F9]">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-bold text-[#546E7A]">保留策略</span>
              <div className="flex items-center bg-[#F8FAFC] border border-[#B0C4DE] rounded-md h-[30px] px-3 gap-3 shadow-inner">
                <input
                  type="text"
                  value="7"
                  readOnly
                  className="w-6 bg-transparent text-[13px] font-black text-[#263238] text-center"
                />
                <div className="flex flex-col border-l border-[#B0C4DE]/30 pl-2">
                  <ChevronDown size={12} className="rotate-180 text-[#B0C4DE]" />
                  <ChevronDown size={12} className="text-[#B0C4DE]" />
                </div>
              </div>
              <span className="text-[12px] font-bold text-[#546E7A]">天</span>

              <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-md h-[30px] px-4 flex items-center font-bold text-[#263238] text-[12px] shadow-inner ml-2">
                00 : 00
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoCleanup(!autoCleanup)}
                className={`px-6 h-[30px] rounded-full border transition-all text-[11px] font-black shadow-sm ${autoCleanup ? "bg-[#4D94FF] text-white border-[#4D94FF]" : "bg-white text-[#546E7A] border-[#B0C4DE] hover:bg-gray-50"}`}
              >
                自动清理: {autoCleanup ? "开" : "关"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 pb-4">
          <StorageCard
            title="生数据"
            icon={Database}
            color="#4D94FF"
            percent={10}
            threshold={80}
            isExpanded={expandedCard === "RawData"}
            onToggle={() => setExpandedCard(expandedCard === "RawData" ? null : "RawData")}
          />
          <StorageCard
            title="DICOM"
            icon={FileCode}
            color="#4D94FF"
            percent={7}
            threshold={80}
            isExpanded={expandedCard === "DICOM"}
            onToggle={() => setExpandedCard(expandedCard === "DICOM" ? null : "DICOM")}
          />
          <StorageCard
            title="PACS"
            icon={Share2}
            color="#4D94FF"
            percent={5}
            threshold={80}
            isExpanded={expandedCard === "PACS"}
            onToggle={() => setExpandedCard(expandedCard === "PACS" ? null : "PACS")}
          />
        </div>
      </section>
    </ServiceModeShell>
  );
}
