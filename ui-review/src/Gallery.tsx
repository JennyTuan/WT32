import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { ChevronDown, ChevronRight } from "lucide-react";

import ProtocolEditorModal from "./components/ProtocolEditorModal";
import HomeScreen from "./screens/HomeScreen";
import PatientListScreen from "./screens/PatientListScreen";
import ProtocolSetupScreen from "./screens/ProtocolSetupScreen";
import WT32ProtocolDetailScreen from "./screens/WT32ProtocolDetailScreen";
import WT32ProtocolScoutDetailScreen from "./screens/WT32NewProtocolScoutDetailScreen";
import WT32ProtocolHelicalDetailScreen from "./screens/WT32NewProtocolHelicalDetailScreen";
import WT32ProtocolReconDetailScreen from "./screens/WT32NewProtocolReconDetailScreen";
import WT32ProtocolDoseDetailScreen from "./screens/WT32NewProtocolDoseDetailScreen";
import ScoutScanScreen from "./screens/ScoutScanScreen";
import ScanConfirmScreen from "./screens/ScanConfirmScreen";
import ScoutExecuteScanScreen from "./screens/ScoutExecuteScanScreen";
import SequenceScanConfirmScreen from "./screens/SequenceScanConfirmScreen";
import HelicalScanConfirmScreen from "./screens/HelicalScanConfirmScreen";
import BreathingAcquisitionScreen from "./screens/BreathingAcquisitionScreen";
import BreathingTrainingScreen from "./screens/BreathingTrainingScreen";
import FourDBreathingPreparationScreen from "./screens/FourDBreathingPreparationScreen";
import FreeBreathingModeConfirmScreen from "./screens/FreeBreathingModeConfirmScreen";
import ViewScreen from "./screens/ViewScreen";
import FourDViewScreen from "./screens/FourDViewScreen";
import MockScanScreen from "./screens/MockScanScreen";
import TubeWarmupScreen from "./screens/TubeWarmupScreen";
import AirCalibrationScreen from "./screens/AirCalibrationScreen";
import DailyQAScreen from "./screens/DailyQAScreen";
import HardwareTestScreen from "./screens/HardwareTestScreen";
import BatteryManagementScreen from "./screens/BatteryManagementScreen";
import DiskManagementScreen from "./screens/DiskManagementScreen";
import PerformanceEvaluationScreen from "./screens/PerformanceEvaluationScreen";
import ManualScanScreen from "./screens/ManualScanScreen";
import ComponentLibraryScreen from "./screens/ComponentLibraryScreen";
import CTSimulatorUIRefactor from "./screens/CTSimulatorUIRefactor";
import CTSimulatorUIRefactorLight from "./screens/CTSimulatorUIRefactorLight";
import CTSimulatorUIRefactorLight2 from "./screens/CTSimulatorUIRefactorLight2";
import LegacyVerticalCTHomeScreen from "./screens/LegacyVerticalCTHomeScreen";
import LegacyVerticalCTModeConfirmScreen from "./screens/LegacyVerticalCTModeConfirmScreen";
import LegacyVerticalCTPatientPositioningScreen from "./screens/LegacyVerticalCTPatientPositioningScreen";
import LegacyVerticalCTPatientPositioningVerticalScreen from "./screens/LegacyVerticalCTPatientPositioningVerticalScreen";
import LegacyVerticalCTScoutConfirmScreen from "./screens/LegacyVerticalCTScoutConfirmScreen";

type ScreenItem = {
    key: string;
    name: string;
    component: React.ReactNode;
};

type Category = {
    id: string;
    name: string;
    screens: ScreenItem[];
};

export default function Gallery() {
    const previewRef = useRef<HTMLDivElement | null>(null);
    const [activeKey, setActiveKey] = useState("home");
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
        wt32: true,
        "vertical-ct": true,
        "legacy-vertical-ct": true,
    });

    const openProtocolDetail = () => setActiveKey("protocol_detail");
    const backToProtocolSetup = () => setActiveKey("protocol_setup");

    const categories = useMemo<Category[]>(
        () => [
            {
                id: "wt32",
                name: "WT32 平台",
                screens: [
                    { key: "home", name: "首页", component: <HomeScreen /> },
                    { key: "patient_list", name: "患者列表", component: <PatientListScreen /> },
                    { key: "protocol_setup", name: "协议选择", component: <ProtocolSetupScreen onOpenProtocolDetail={openProtocolDetail} /> },
                    { key: "protocol_detail", name: "协议详情", component: <ProtocolEditorModal onCancel={backToProtocolSetup}><WT32ProtocolDetailScreen /></ProtocolEditorModal> },
                    { key: "protocol_scout_detail", name: "协议详情-定位像", component: <ProtocolEditorModal><WT32ProtocolScoutDetailScreen /></ProtocolEditorModal> },
                    { key: "protocol_helical_detail", name: "协议详情-螺旋扫描", component: <ProtocolEditorModal><WT32ProtocolHelicalDetailScreen /></ProtocolEditorModal> },
                    { key: "protocol_recon_soft", name: "协议详情-重建(软组织)", component: <ProtocolEditorModal><WT32ProtocolReconDetailScreen type="soft" /></ProtocolEditorModal> },
                    { key: "protocol_recon_bone", name: "协议详情-重建(骨骼)", component: <ProtocolEditorModal><WT32ProtocolReconDetailScreen type="bone" /></ProtocolEditorModal> },
                    { key: "protocol_dose_detail", name: "协议详情-剂量通知", component: <ProtocolEditorModal><WT32ProtocolDoseDetailScreen /></ProtocolEditorModal> },
                    { key: "scout_scan", name: "激光灯定位-定位像", component: <ScoutScanScreen /> },
                    { key: "scan_confirm", name: "参数确认-定位像", component: <ScanConfirmScreen /> },
                    { key: "scout_execute_scan", name: "执行扫描-定位像", component: <ScoutExecuteScanScreen /> },
                    { key: "sequence_scan_confirm", name: "参数确认-序列扫描", component: <SequenceScanConfirmScreen /> },
                    { key: "helical_scan_confirm", name: "参数确认-螺旋扫描", component: <HelicalScanConfirmScreen /> },
                    { key: "4d-scan", name: "呼吸采集", component: <BreathingAcquisitionScreen /> },
                    { key: "breathing-training", name: "参数确认-自由呼吸模式V1", component: <BreathingTrainingScreen /> },
                    { key: "4d-breathing-prep", name: "呼吸训练-自由呼吸模式", component: <FourDBreathingPreparationScreen /> },
                    { key: "free-breathing-mode-confirm", name: "参数确认-自由呼吸模式", component: <FreeBreathingModeConfirmScreen /> },
                    { key: "view", name: "图像浏览", component: <ViewScreen /> },
                    { key: "4d-view", name: "图像浏览-4D", component: <FourDViewScreen /> },
                    { key: "mock_scan", name: "模拟按键", component: <MockScanScreen /> },
                    { key: "tube-warmup", name: "球管预热", component: <TubeWarmupScreen /> },
                    { key: "air-calibration", name: "空气校正", component: <AirCalibrationScreen /> },
                    { key: "daily-qa", name: "日常QA", component: <DailyQAScreen /> },
                    { key: "hardware-test", name: "硬件测试", component: <HardwareTestScreen /> },
                    { key: "battery-management", name: "电池管理", component: <BatteryManagementScreen /> },
                    { key: "disk-management", name: "磁盘管理", component: <DiskManagementScreen /> },
                    { key: "performance-evaluation", name: "性能评估", component: <PerformanceEvaluationScreen /> },
                    { key: "manual-scan", name: "手动扫描", component: <ManualScanScreen /> },
                    { key: "component-library", name: "组件库", component: <ComponentLibraryScreen /> },
                ],
            },
            {
                id: "vertical-ct",
                name: "垂直 CT 平台",
                screens: [
                    { key: "ct-simulator-ui-refactor-dark", name: "CTSimulatorUIRefactor-dark", component: <CTSimulatorUIRefactor /> },
                    { key: "CTSimulatorUIRefactor-light", name: "CTSimulatorUIRefactor-light", component: <CTSimulatorUIRefactorLight /> },
                    { key: "CTSimulatorUIRefactor-light2", name: "CTSimulatorUIRefactor-light2", component: <CTSimulatorUIRefactorLight2 /> },
                ],
            },
            {
                id: "legacy-vertical-ct",
                name: "旧版垂直CT平台",
                screens: [
                    { key: "legacy-vertical-ct-home", name: "首页", component: <LegacyVerticalCTHomeScreen /> },
                    { key: "legacy-vertical-ct-mode-confirm", name: "模式确认", component: <LegacyVerticalCTModeConfirmScreen /> },
                    { key: "legacy-vertical-ct-patient-positioning", name: "患者摆位-水平", component: <LegacyVerticalCTPatientPositioningScreen /> },
                    { key: "legacy-vertical-ct-patient-positioning-vertical", name: "患者摆位-垂直", component: <LegacyVerticalCTPatientPositioningVerticalScreen /> },
                    { key: "legacy-vertical-ct-scout-confirm", name: "定位像确认", component: <LegacyVerticalCTScoutConfirmScreen /> },
                ],
            },
        ],
        []
    );

    const allScreens = useMemo(() => categories.flatMap((category) => category.screens), [categories]);
    const active = allScreens.find((screen) => screen.key === activeKey) ?? allScreens[0];

    useEffect(() => {
        const matchedCategory = categories.find((category) => category.screens.some((screen) => screen.key === activeKey));
        if (matchedCategory) {
            setExpandedCategories((prev) => ({ ...prev, [matchedCategory.id]: true }));
        }
    }, [activeKey, categories]);

    const toggleCategory = (categoryId: string) => {
        setExpandedCategories((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
    };

    const handleExport = async () => {
        if (!previewRef.current) return;
        const canvas = await html2canvas(previewRef.current, {
            backgroundColor: null,
            useCORS: true,
            scale: 1,
        });
        const link = document.createElement("a");
        link.download = `${active?.key ?? "preview"}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    };

    return (
        <div className="h-screen w-screen flex bg-[#F8FAFC]">
            <aside className="w-[290px] bg-white border-r border-[#E2E8F0] flex flex-col">
                <div className="px-5 py-5 border-b border-[#F1F5F9]">
                    <div className="text-[18px] font-black text-[#0F172A] tracking-tight">Screen Gallery</div>
                    <div className="text-[11px] text-[#94A3B8] font-bold uppercase tracking-[0.18em] mt-1">UI Review</div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                    {categories.map((category) => (
                        <div key={category.id} className="mb-4 last:mb-2">
                            <button
                                type="button"
                                onClick={() => toggleCategory(category.id)}
                                className="w-full px-3 py-2 mb-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white transition-colors flex items-center justify-between text-left"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-1 h-3 bg-[#CBD5E1] rounded-full shrink-0"></span>
                                    <span className="text-[11px] font-black text-[#94A3B8] uppercase tracking-[0.15em] truncate">
                                        {category.name}
                                    </span>
                                    <span className="text-[10px] text-[#94A3B8] font-semibold shrink-0">{category.screens.length}</span>
                                </div>
                                {expandedCategories[category.id] ? (
                                    <ChevronDown size={16} className="text-[#94A3B8] shrink-0" />
                                ) : (
                                    <ChevronRight size={16} className="text-[#94A3B8] shrink-0" />
                                )}
                            </button>

                            {expandedCategories[category.id] && (
                                <div className="space-y-0.5 pl-2 ml-3 border-l border-[#E2E8F0]">
                                    {category.screens.map((screen) => {
                                        const isActive = screen.key === activeKey;
                                        return (
                                            <button
                                                key={screen.key}
                                                onClick={() => setActiveKey(screen.key)}
                                                className={`w-full text-left px-4 py-2 rounded-lg transition-all duration-200 relative ${
                                                    isActive
                                                        ? "bg-[#F1F5F9] text-[#2563EB] font-bold shadow-sm"
                                                        : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                                                }`}
                                            >
                                                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#2563EB] rounded-r-full" />}
                                                <div className="text-[13px] tracking-tight">{screen.name}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-[#F1F5F9] bg-[#F8FAFC]">
                    <div className="text-[10px] text-[#94A3B8] font-bold text-center uppercase tracking-widest">v4.2.0 Build 2026.03</div>
                </div>
            </aside>

            <main className="flex-1 overflow-hidden flex flex-col bg-[#F1F5F9]/30">
                <header className="h-14 bg-white/80 backdrop-blur-md border-b border-[#E2E8F0] px-8 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[#94A3B8] font-medium uppercase tracking-wider">Previewing:</span>
                        <span className="text-[14px] font-bold text-[#1E293B]">{active?.name}</span>
                    </div>
                    <button
                        onClick={handleExport}
                        className="px-5 py-1.5 border-2 border-red-500 text-red-500 font-bold rounded hover:bg-red-50 transition-colors flex items-center gap-2 text-sm shadow-sm"
                    >
                        导出
                    </button>
                </header>

                <div className="flex-1 overflow-auto p-8 flex justify-center items-start">
                    <div ref={previewRef} className="rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-[#E2E8F0] overflow-hidden">
                        {active?.component}
                    </div>
                </div>
            </main>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #E2E8F0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #CBD5E1;
                }
            `}</style>
        </div>
    );
}
