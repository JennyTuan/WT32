import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Menu,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  SERVICE_MODE_ITEMS,
  SERVICE_MODE_SECTION_LABEL_KEYS,
  SERVICE_MODE_SECTION_ORDER,
  type ServiceModeSection,
  getServiceModeItem,
} from "./serviceModeRegistry";
import AppHeader from "../../../components/AppHeader";
import { useAuth } from "../../../lib/authContext";
import { isRouteAllowedInEmergency } from "../../../lib/emergencyAccess";
import { useI18n } from "../../../lib/i18nContext";

type ServiceModeShellProps = {
  currentRoute: string;
  currentHeat?: number;
  children: ReactNode;
  overlays?: ReactNode;
};

const buildExpandedState = (activeSection?: ServiceModeSection) =>
  SERVICE_MODE_SECTION_ORDER.reduce<Record<ServiceModeSection, boolean>>((acc, section) => {
    acc[section] = section === (activeSection ?? "hardware");
    return acc;
  }, {} as Record<ServiceModeSection, boolean>);

export default function ServiceModeShell({
  currentRoute,
  currentHeat = 60,
  children,
  overlays,
}: ServiceModeShellProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { isEmergencySession } = useAuth();
  const restrictedTooltip = t("emergency.restrictedTooltip");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");

  const currentItem = getServiceModeItem(currentRoute);
  const currentSectionLabel = currentItem ? t(SERVICE_MODE_SECTION_LABEL_KEYS[currentItem.section]) : t("service.section.hardware");
  const currentItemLabel = currentItem ? t(currentItem.labelKey) : t("service.fallbackFeature");
  const [expandedSections, setExpandedSections] = useState<Record<ServiceModeSection, boolean>>(
    buildExpandedState(currentItem?.section),
  );

  const filteredItems = useMemo(() => {
    const keyword = searchKeyword.trim().toLocaleLowerCase();
    if (!keyword) return SERVICE_MODE_ITEMS;
    return SERVICE_MODE_ITEMS.filter((item) => {
      const itemLabel = t(item.labelKey).toLocaleLowerCase();
      const sectionLabel = t(SERVICE_MODE_SECTION_LABEL_KEYS[item.section]).toLocaleLowerCase();
      return itemLabel.includes(keyword) || sectionLabel.includes(keyword) || item.route.includes(keyword);
    });
  }, [searchKeyword, t]);

  const sectionedItems = useMemo(
    () =>
      SERVICE_MODE_SECTION_ORDER.map((section) => ({
        section,
        items: filteredItems.filter((item) => item.section === section),
      })).filter((group) => group.items.length > 0),
    [filteredItems],
  );

  return (
    <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">
      <AppHeader
        tableLabel="60 mm"
        gantryLabel="3.0°"
        heatLabel={`${currentHeat.toFixed(0)}%`}
      />

      <main className="flex-1 overflow-hidden bg-white">
       <div className="flex h-full bg-white overflow-hidden">
        <aside
          className={`${isCollapsed ? "w-[80px]" : "w-[220px]"} flex flex-col p-4 shrink-0 overflow-hidden border-r border-[#E2EBF5] transition-all duration-300 ease-in-out`}
        >
          <div className="flex items-center justify-between mb-6 h-10">
            {!isCollapsed && (
              <div className="animate-in fade-in duration-300">
                <div className="text-[14px] font-black text-[#37474F] uppercase tracking-wider">{t("service.mode")}</div>
                <div className="text-[10px] text-[#90A4AE] font-bold mt-0.5">
                  {currentSectionLabel} / {currentItemLabel}
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
                placeholder={t("service.searchPlaceholder")}
                className="w-full h-[36px] pl-10 pr-4 bg-white border border-[#B0C4DE] rounded-md text-[13px] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" size={16} />
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {isCollapsed ? (
              <div className="space-y-2">
                {sectionedItems.map((group) => {
                  const active = group.section === currentItem?.section;
                  const SectionIcon = group.items[0]?.icon ?? LayoutGrid;

                  return (
                    <button
                      key={group.section}
                      onClick={() => {
                        setIsCollapsed(false);
                        setExpandedSections((prev) => ({ ...prev, [group.section]: true }));
                      }}
                      className={`w-full h-[48px] rounded-md flex items-center justify-center transition-all ${
                        active ? "bg-[#4D94FF] text-white shadow-sm" : "bg-white text-[#7B92A8] border border-[#D8E4F2] hover:bg-gray-50"
                      }`}
                    >
                      <SectionIcon size={18} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {sectionedItems.map((group) => {
                  const sectionActive = group.section === currentItem?.section;
                  const isExpanded = expandedSections[group.section];
                  const SectionIcon = group.items[0]?.icon ?? LayoutGrid;

                  return (
                    <div key={group.section} className="rounded-md">
                      <button
                        onClick={() =>
                          setExpandedSections((prev) => ({
                            ...prev,
                            [group.section]: !prev[group.section],
                          }))
                        }
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-md transition-all ${
                          sectionActive
                            ? "bg-[#EAF3FF] text-[#1E88E5] border border-[#B8D8FF] shadow-sm"
                            : "bg-[#F8FBFF] text-[#4F6B86] border border-[#D8E4F2] hover:bg-[#F1F6FC]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-md ${sectionActive ? "bg-white" : "bg-[#E8F0FA]"}`}>
                            <SectionIcon size={18} />
                          </div>
                          <span className="text-[14px] font-bold">{t(SERVICE_MODE_SECTION_LABEL_KEYS[group.section])}</span>
                        </div>
                        <div className={`transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`}>
                          <ChevronDown size={16} />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-1.5 ml-3 pl-3 border-l border-[#DCE7F3] space-y-1">
                          {group.items.map((item) => {
                            const active = item.route === currentRoute;
                            const Icon = item.icon;
                            const restricted = isEmergencySession && !isRouteAllowedInEmergency(item.route);

                            return (
                              <button
                                key={item.route}
                                onClick={() => {
                                  if (restricted) return;
                                  navigate(item.route);
                                }}
                                disabled={restricted}
                                title={restricted ? restrictedTooltip : undefined}
                                aria-disabled={restricted}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-all ${
                                  restricted
                                    ? "cursor-not-allowed text-[#B0BEC5] opacity-60"
                                    : active
                                    ? "bg-[#E3F2FD] text-[#1E88E5] border border-[#A9D0FF]"
                                    : "text-[#546E7A] hover:bg-gray-50"
                                }`}
                              >
                                <div className={restricted ? "text-[#B0BEC5]" : active ? "text-[#1E88E5]" : "text-[#90A4AE]"}>
                                  <Icon size={17} />
                                </div>
                                <span className={`text-[13px] whitespace-nowrap ${active ? "font-bold" : "font-medium"}`}>
                                  {t(item.labelKey)}
                                </span>
                                {active && !restricted && <ChevronRight size={14} className="ml-auto text-[#1E88E5]" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="relative flex min-h-0 flex-1 min-w-0 flex-col">{children}</div>
       </div>
      </main>

      <footer className="h-[56px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center px-8 shrink-0">
        <button
          onClick={() => navigate("/")}
          className="h-[36px] px-8 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] hover:bg-gray-50 shadow-sm transition-all active:scale-95"
        >
          {t("common.home")}
        </button>
        <div className="ml-8 text-[13px] text-[#546E7A] font-medium">
          {t("service.mode")} · {currentSectionLabel} / {currentItemLabel}
        </div>
      </footer>

      {overlays}
    </div>
  );
}
