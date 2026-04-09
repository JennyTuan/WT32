import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import HomeScreen from "./screens/HomeScreen";
import PatientListScreen from "./screens/PatientListScreen";
import ProtocolSetupScreen from "./screens/ProtocolSetupScreen";
import WT32ProtocolDetailScreen from "./screens/WT32ProtocolDetailScreen";
import WT32NewProtocolScoutDetailScreen from "./screens/WT32NewProtocolScoutDetailScreen";
import WT32NewProtocolHelicalDetailScreen from "./screens/WT32NewProtocolHelicalDetailScreen";
import WT32NewProtocolReconDetailScreen from "./screens/WT32NewProtocolReconDetailScreen";
import WT32NewProtocolDoseDetailScreen from "./screens/WT32NewProtocolDoseDetailScreen";
import ScoutScanScreen from "./screens/ScoutScanScreen";
import ScanConfirmScreen from "./screens/ScanConfirmScreen";
import ScoutExecuteScanScreen from "./screens/ScoutExecuteScanScreen";
import SequenceScanConfirmScreen from "./screens/SequenceScanConfirmScreen";
import HelicalScanConfirmScreen from "./screens/HelicalScanConfirmScreen";
import HelicalExecuteScanScreen from "./screens/HelicalExecuteScanScreen";
import ViewScreen from "./screens/ViewScreen";
import ManualScanScreen from "./screens/ManualScanScreen";
import MockScanScreen from "./screens/MockScanScreen";
import TubeWarmupScreen from "./screens/TubeWarmupScreen";
import AirCalibrationScreen from "./screens/AirCalibrationScreen";
import DailyQAScreen from "./screens/DailyQAScreen";
import HardwareTestScreen from "./screens/HardwareTestScreen";
import BatteryManagementScreen from "./screens/BatteryManagementScreen";
import DiskManagementScreen from "./screens/DiskManagementScreen";
import PerformanceEvaluationScreen from "./screens/PerformanceEvaluationScreen";
import ServicePlaceholderScreen from "./screens/ServicePlaceholderScreen";
import QAReportPage from "./features/service/qaReport/QAReportPage";
import ProtocolManagementScreen from "./screens/ProtocolManagementScreen";
import CornerInfoPage from "./features/service/cornerInfo/CornerInfoPage";

const HomeRoute = HomeScreen ?? (() => <Navigate to="/patients" replace />);
const TABLET_WIDTH = 1024;
const TABLET_HEIGHT = 768;
const TABLET_PADDING = 96;

function useTabletScale() {
  const computeScale = () => {
    if (typeof window === "undefined") return 1;

    const availableWidth = window.innerWidth - TABLET_PADDING;
    const availableHeight = window.innerHeight - TABLET_PADDING;
    const widthScale = availableWidth / TABLET_WIDTH;
    const heightScale = availableHeight / TABLET_HEIGHT;

    return Math.min(widthScale, heightScale, 1);
  };

  const [scale, setScale] = useState(computeScale);

  useEffect(() => {
    const handleResize = () => setScale(computeScale());

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return scale;
}

export default function App() {
  const scale = useTabletScale();
  const shellWidth = TABLET_WIDTH * scale + 40;
  const shellHeight = TABLET_HEIGHT * scale + 40;

  return (
    <BrowserRouter>
      <div className="min-h-screen w-full overflow-hidden bg-[radial-gradient(ellipse_at_top,#e0f2fe_0%,#cbd5e1_40%,#94a3b8_100%)] flex items-center justify-center p-6">
        <div
          className="relative rounded-[36px] bg-gradient-to-b from-[#1e293b] to-[#0a1120] shadow-[0_60px_140px_rgba(0,0,0,0.55),0_20px_40px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.5)]"
          style={{ width: shellWidth, height: shellHeight }}
        >
          {/* 顶部摄像头 */}
          <div className="pointer-events-none absolute inset-x-0 top-[11px] flex justify-center items-center gap-[6px]">
            <div className="h-[8px] w-[8px] rounded-full bg-[#0d1f35] border border-[#1a3050] shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]" />
          </div>
          {/* 左侧音量键 */}
          <div className="pointer-events-none absolute left-[-2px] top-[130px] h-[40px] w-[3px] rounded-r-full bg-gradient-to-r from-[#1e293b] to-[#334155]" />
          <div className="pointer-events-none absolute left-[-2px] top-[180px] h-[40px] w-[3px] rounded-r-full bg-gradient-to-r from-[#1e293b] to-[#334155]" />
          {/* 右侧电源键 */}
          <div className="pointer-events-none absolute right-[-2px] top-1/2 h-[56px] w-[3px] -translate-y-1/2 rounded-l-full bg-gradient-to-l from-[#1e293b] to-[#334155]" />
          {/* 底部 Home 指示条 */}
          <div className="pointer-events-none absolute inset-x-0 bottom-[8px] flex justify-center">
            <div className="h-[3px] w-[80px] rounded-full bg-[#334155]/70" />
          </div>

          <div
            className="absolute left-1/2 top-1/2 origin-center overflow-hidden rounded-[24px] bg-white ring-1 ring-black/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
            style={{
              width: TABLET_WIDTH,
              height: TABLET_HEIGHT,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            <Routes>
              <Route path="/" element={<HomeRoute />} />

              <Route path="/patients" element={<PatientListScreen />} />
              <Route path="/protocol-select" element={<ProtocolSetupScreen />} />
              <Route path="/protocol-detail" element={<WT32ProtocolDetailScreen />} />
              <Route path="/protocol-detail/scout" element={<WT32NewProtocolScoutDetailScreen />} />
              <Route path="/protocol-detail/helical" element={<WT32NewProtocolHelicalDetailScreen />} />
              <Route path="/protocol-detail/recon" element={<WT32NewProtocolReconDetailScreen />} />
              <Route path="/protocol-detail/dose" element={<WT32NewProtocolDoseDetailScreen />} />
              <Route path="/scout-scan" element={<ScoutScanScreen />} />
              <Route path="/scan-confirm" element={<ScanConfirmScreen />} />
              <Route path="/scout-execute" element={<ScoutExecuteScanScreen />} />
              <Route path="/sequence-confirm" element={<SequenceScanConfirmScreen />} />
              <Route path="/helical-confirm" element={<HelicalScanConfirmScreen />} />
              <Route path="/helical-execute" element={<HelicalExecuteScanScreen />} />
              <Route path="/image-viewer" element={<ViewScreen />} />

              <Route path="/mobile/manual-scan" element={<ManualScanScreen />} />
              <Route path="/mobile/mock-scan" element={<MockScanScreen />} />
              <Route path="/mobile/image-viewer" element={<ViewScreen />} />

              <Route path="/service/tube-warmup" element={<TubeWarmupScreen />} />
              <Route path="/service/air-calibration" element={<AirCalibrationScreen />} />
              <Route path="/service/daily-qa" element={<DailyQAScreen />} />
              <Route path="/service/hardware-test" element={<HardwareTestScreen />} />
              <Route path="/service/battery" element={<BatteryManagementScreen />} />
              <Route path="/service/disk" element={<DiskManagementScreen />} />
              <Route path="/service/performance" element={<PerformanceEvaluationScreen />} />
              <Route path="/service/settings/protocol-management" element={<ProtocolManagementScreen />} />
              <Route path="/service/settings/corner-info" element={<CornerInfoPage />} />
              <Route path="/service/settings/dicom" element={<ServicePlaceholderScreen currentRoute="/service/settings/dicom" title="DICOM" description="用于配置 DICOM 节点、传输、发送接收策略和连接参数。" />} />
              <Route path="/service/settings/user-management" element={<ServicePlaceholderScreen currentRoute="/service/settings/user-management" title="用户管理" description="用于维护用户、角色、权限和登录访问控制。" />} />
              <Route path="/service/settings/system-settings" element={<ServicePlaceholderScreen currentRoute="/service/settings/system-settings" title="系统设置" description="用于设置系统级参数、时间网络、设备偏好和基础配置。" />} />
              <Route path="/service/settings/organization-info" element={<ServicePlaceholderScreen currentRoute="/service/settings/organization-info" title="机构信息设置" description="用于配置机构名称、标识、科室信息和对外显示内容。" />} />
              <Route path="/service/reports/qa-report" element={<QAReportPage />} />
              <Route path="/service/reports/system-log" element={<ServicePlaceholderScreen currentRoute="/service/reports/system-log" title="系统日志" description="用于检索系统运行日志、异常信息和关键事件记录。" />} />
              <Route path="/service/reports/runtime-stats" element={<ServicePlaceholderScreen currentRoute="/service/reports/runtime-stats" title="运行统计" description="用于查看设备运行时长、使用频率和关键运行指标统计。" />} />
              <Route path="/service/reports/audit-log" element={<ServicePlaceholderScreen currentRoute="/service/reports/audit-log" title="审计日志" description="用于查看关键操作记录、用户行为轨迹和审计追踪信息。" />} />
              <Route path="/service/dose/settings" element={<ServicePlaceholderScreen currentRoute="/service/dose/settings" title="剂量设置" description="用于配置剂量策略、剂量阈值和扫描剂量相关参数。" />} />
              <Route path="/service/dose/logs" element={<ServicePlaceholderScreen currentRoute="/service/dose/logs" title="剂量日志" description="用于查看剂量历史、剂量事件记录和相关追踪信息。" />} />

              <Route path="*" element={<Navigate to="/patients" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
