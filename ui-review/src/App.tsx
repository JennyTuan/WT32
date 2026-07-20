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
import GatedHelicalConfirmScreen from "./screens/GatedHelicalConfirmScreen";
import GatedAxialConfirmScreen from "./screens/GatedAxialConfirmScreen";
import FourDDiagnosticConfirmScreen from "./screens/FourDDiagnosticConfirmScreen";
import FourDRescanSelectScreen from "./screens/FourDRescanSelectScreen";
import ViewScreen from "./screens/ViewScreen";
import ImageLoadScreen from "./screens/ImageLoadScreen";
import PhaseFilterScreen from "./screens/PhaseFilterScreen";
import ManualScanScreen from "./screens/ManualScanScreen";
import MobileModePlaceholderScreen from "./screens/MobileModePlaceholderScreen";
import MockScanScreen from "./screens/MockScanScreen";
import TubeWarmupScreen from "./screens/TubeWarmupScreen";
import AirCalibrationScreen from "./screens/AirCalibrationScreen";
import DailyQAScreen from "./screens/DailyQAScreen";
import HardwareTestScreen from "./screens/HardwareTestScreen";
import BatteryManagementScreen from "./screens/BatteryManagementScreen";
import DiskManagementScreen from "./screens/DiskManagementScreen";
import PerformanceEvaluationScreen from "./screens/PerformanceEvaluationScreen";
import RuntimeStatsPage from "./features/service/runtimeStats/RuntimeStatsPage";
import QAReportPage from "./features/service/qaReport/QAReportPage";
import ServiceSystemLogPage from "./features/service/reports/ServiceSystemLogPage";
import ServiceAuditLogPage from "./features/service/reports/ServiceAuditLogPage";
import ServiceDoseLogsPage from "./features/service/dose/ServiceDoseLogsPage";
import ServiceDoseSettingsPage from "./features/service/dose/ServiceDoseSettingsPage";
import ProtocolManagementScreen from "./screens/ProtocolManagementScreen";
import CornerInfoPage from "./features/service/cornerInfo/CornerInfoPage";
import DicomSettingsPage from "./features/service/dicom/DicomSettingsPage";
import UserManagementPage from "./features/service/userManagement/UserManagementPage";
import SystemSettingsPage from "./features/service/systemSettings/SystemSettingsPage";
import OrganizationInfoPage from "./features/service/organizationInfo/OrganizationInfoPage";
import LoginScreen from "./screens/LoginScreen";
import ChangePasswordScreen from "./screens/ChangePasswordScreen";
import FeedbackShowcaseScreen from "./screens/FeedbackShowcaseScreen";
import RequireAuth from "./components/RequireAuth";
import EmergencyModeBanner from "./components/EmergencyModeBanner";
import DeviceErrorCenter from "./components/DeviceErrorCenter";
import SoftKeyboard from "./components/SoftKeyboard";
import { AuthProvider, useAuth } from "./lib/authContext";

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

function AuthenticatedSystemOverlays() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <>
      <EmergencyModeBanner />
      <DeviceErrorCenter />
    </>
  );
}

export default function App() {
  const scale = useTabletScale();
  const shellWidth = TABLET_WIDTH * scale + 40;
  const shellHeight = TABLET_HEIGHT * scale + 40;

  return (
    <BrowserRouter>
      <AuthProvider>
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
            id="wt32-screen-root"
            className="absolute left-1/2 top-1/2 origin-center overflow-hidden rounded-[24px] bg-[#0B1220] ring-1 ring-black/30 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{
              width: TABLET_WIDTH,
              height: TABLET_HEIGHT,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            <AuthenticatedSystemOverlays />
            <Routes>
              <Route
                path="/dev/feedback-showcase"
                element={import.meta.env.DEV ? <FeedbackShowcaseScreen /> : <Navigate to="/login" replace />}
              />
              <Route path="/login" element={<LoginScreen />} />
              <Route element={<RequireAuth />}>
              <Route path="/change-password" element={<ChangePasswordScreen />} />
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
              <Route path="/gated-helical-confirm" element={<GatedHelicalConfirmScreen />} />
              <Route path="/gated-axial-confirm" element={<GatedAxialConfirmScreen />} />
              <Route path="/fourd-confirm" element={<FourDDiagnosticConfirmScreen />} />
              <Route path="/fourd-rescan-select" element={<FourDRescanSelectScreen />} />
              <Route path="/image-load" element={<ImageLoadScreen />} />
              <Route path="/phase-filter" element={<PhaseFilterScreen />} />
              <Route path="/image-viewer" element={<ViewScreen />} />

              <Route path="/mobile" element={<MobileModePlaceholderScreen />} />
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
              <Route path="/service/settings/dicom" element={<DicomSettingsPage />} />
              <Route path="/service/settings/user-management" element={<UserManagementPage />} />
              <Route path="/service/settings/system-settings" element={<SystemSettingsPage />} />
              <Route path="/service/settings/organization-info" element={<OrganizationInfoPage />} />
              <Route path="/service/reports/qa-report" element={<QAReportPage />} />
              <Route path="/service/reports/system-log" element={<ServiceSystemLogPage />} />
              <Route path="/service/reports/runtime-stats" element={<RuntimeStatsPage />} />
              <Route path="/service/reports/audit-log" element={<ServiceAuditLogPage />} />
              <Route path="/service/dose/settings" element={<ServiceDoseSettingsPage />} />
              <Route path="/service/dose/logs" element={<ServiceDoseLogsPage />} />

              <Route path="*" element={<Navigate to="/patients" replace />} />
              </Route>
            </Routes>
            <SoftKeyboard />
          </div>
        </div>
      </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
