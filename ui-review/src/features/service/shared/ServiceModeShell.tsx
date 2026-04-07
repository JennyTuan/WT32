import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  LayoutGrid,
  Lightbulb,
  Menu,
  Plus,
  Search,
  Settings,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { SERVICE_MODE_ITEMS, getServiceModeItem } from "./serviceModeRegistry";

type FooterStatusTone = "idle" | "active" | "success";

type FooterStatus = {
  label: string;
  tone: FooterStatusTone;
};

type ServiceModeShellProps = {
  currentRoute: string;
  currentHeat?: number;
  children: ReactNode;
  overlays?: ReactNode;
  footerStatus?: FooterStatus;
};

const formatClock = (date: Date) =>
  date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });

const getFooterStatusClassName = (tone: FooterStatusTone) => {
  if (tone === "active") return "bg-[#1E88E5]";
  if (tone === "success") return "bg-[#43A047]";
  return "bg-[#607D8B]";
};

export default function ServiceModeShell({
  currentRoute,
  currentHeat = 60,
  children,
  overlays,
  footerStatus = { label: "IDLE", tone: "idle" },
}: ServiceModeShellProps) {
  const navigate = useNavigate();
  const [clock, setClock] = useState(new Date());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");

  const currentItem = getServiceModeItem(currentRoute);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = searchKeyword.trim();
    if (!keyword) return SERVICE_MODE_ITEMS;
    return SERVICE_MODE_ITEMS.filter((item) => item.label.includes(keyword));
  }, [searchKeyword]);

  return (
    <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">
      <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
            <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
              <User size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-[#263238]">暂无选中患者</span>
              <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">ID: —</span>
            </div>
            <div className="ml-auto flex flex-col gap-0.5 text-[#546E7A] opacity-60">
              <div className="text-[9px] font-bold italic">∟ 60 mm</div>
              <div className="text-[9px] font-bold">∠ 3.0°</div>
              <div className="text-[9px] font-bold">热 {currentHeat.toFixed(0)}%</div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">
            {formatClock(clock)}
          </div>
          <div className="text-[12px] text-[#546E7A] font-medium mt-1">{formatDateLabel(clock)}</div>
        </div>

        <div className="flex items-center gap-6 pr-2">
          <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70">
            <Plus size={32} strokeWidth={1.5} />
          </div>
          <div className="p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
            <LayoutGrid size={24} />
          </div>
          <div className="p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
            <Lightbulb size={24} />
          </div>
          <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
            <Settings size={24} />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">
              100
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4 flex gap-4 bg-[#EEF2F9]">
        <aside
          className={`${isCollapsed ? "w-[80px]" : "w-[220px]"} bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col p-4 shrink-0 overflow-hidden transition-all duration-300 ease-in-out`}
        >
          <div className="flex items-center justify-between mb-6 h-10">
            {!isCollapsed && (
              <div className="animate-in fade-in duration-300">
                <div className="text-[14px] font-black text-[#37474F] uppercase tracking-wider">服务模式</div>
                <div className="text-[10px] text-[#90A4AE] font-bold mt-0.5">
                  {currentItem?.section ?? "硬件"} / {currentItem?.label ?? "服务功能"}
                </div>
              </div>
            )}
            <div
              onClick={() => setIsCollapsed((prev) => !prev)}
              className={`w-9 h-9 rounded-md bg-white border border-[#B0C4DE] flex items-center justify-center text-[#546E7A] hover:bg-gray-50 cursor-pointer transition-all active:scale-95 shadow-sm ${isCollapsed ? "mx-auto" : ""}`}
            >
              <Menu size={18} />
            </div>
          </div>

          {!isCollapsed && (
            <div className="relative mb-6 animate-in slide-in-from-left-2 duration-300">
              <input
                type="text"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="关键字搜索..."
                className="w-full h-[36px] pl-10 pr-4 bg-white border border-[#B0C4DE] rounded-md text-[13px] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" size={16} />
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            <div
              className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} p-3 bg-[#4D94FF] text-white rounded-md mb-4 shadow-sm transition-all`}
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-white/20 rounded-md">
                  <LayoutGrid size={20} />
                </div>
                {!isCollapsed && <span className="font-bold text-[14px]">{currentItem?.section ?? "硬件"}</span>}
              </div>
              {!isCollapsed && <ChevronDown size={18} className="opacity-60" />}
            </div>

            {filteredItems.map((item) => {
              const active = item.route === currentRoute;
              const Icon = item.icon;

              return (
                <button
                  key={item.route}
                  onClick={() => navigate(item.route)}
                  className={`w-full flex items-center ${isCollapsed ? "justify-center px-0" : "gap-3 px-4"} py-2.5 rounded-md transition-all ${active ? "bg-[#E3F2FD] text-[#1E88E5] border-l-4 border-[#1E88E5]" : "text-[#546E7A] hover:bg-gray-50"}`}
                >
                  <div className={active ? "text-[#1E88E5]" : "text-[#90A4AE]"}>
                    <Icon size={18} />
                  </div>
                  {!isCollapsed && (
                    <span className={`text-[13px] ${active ? "font-bold" : "font-medium"} whitespace-nowrap`}>
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 min-w-0 relative">{children}</div>
      </main>

      <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center px-8 shrink-0">
        <button
          onClick={() => navigate("/")}
          className="h-[52px] px-10 bg-white border-2 border-[#B0C4DE] rounded-md text-[14px] font-bold text-[#37474F] hover:bg-gray-50 shadow-sm transition-all active:scale-95"
        >
          首页
        </button>
        <div className="ml-8 text-[13px] text-[#546E7A] font-medium">
          服务模式 · {currentItem?.section ?? "硬件"} / {currentItem?.label ?? "服务功能"}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${getFooterStatusClassName(footerStatus.tone)}`}
          >
            {footerStatus.label}
          </div>
        </div>
      </footer>

      {overlays}
    </div>
  );
}
