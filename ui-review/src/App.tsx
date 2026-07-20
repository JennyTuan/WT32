import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./lib/authContext";

const HomeScreen = lazy(() => import("./screens/HomeScreen"));
const PatientListScreen = lazy(() => import("./screens/PatientListScreen"));
const ProtocolSetupScreen = lazy(() => import("./screens/ProtocolSetupScreen"));
const WT32ProtocolDetailScreen = lazy(() => import("./screens/WT32ProtocolDetailScreen"));
const WT32NewProtocolScoutDetailScreen = lazy(() => import("./screens/WT32NewProtocolScoutDetailScreen"));
const WT32NewProtocolHelicalDetailScreen = lazy(() => import("./screens/WT32NewProtocolHelicalDetailScreen"));
const WT32NewProtocolReconDetailScreen = lazy(() => import("./screens/WT32NewProtocolReconDetailScreen"));
const WT32NewProtocolDoseDetailScreen = lazy(() => import("./screens/WT32NewProtocolDoseDetailScreen"));
const ScoutScanScreen = lazy(() => import("./screens/ScoutScanScreen"));
const ScanConfirmScreen = lazy(() => import("./screens/ScanConfirmScreen"));
const ScoutExecuteScanScreen = lazy(() => import("./screens/ScoutExecuteScanScreen"));
const SequenceScanConfirmScreen = lazy(() => import("./screens/SequenceScanConfirmScreen"));
const HelicalScanConfirmScreen = lazy(() => import("./screens/HelicalScanConfirmScreen"));
const HelicalExecuteScanScreen = lazy(() => import("./screens/HelicalExecuteScanScreen"));
const GatedHelicalConfirmScreen = lazy(() => import("./screens/GatedHelicalConfirmScreen"));
const GatedAxialConfirmScreen = lazy(() => import("./screens/GatedAxialConfirmScreen"));
const FourDDiagnosticConfirmScreen = lazy(() => import("./screens/FourDDiagnosticConfirmScreen"));
const FourDRescanSelectScreen = lazy(() => import("./screens/FourDRescanSelectScreen"));
const ViewScreen = lazy(() => import("./screens/ViewScreen"));
const ImageLoadScreen = lazy(() => import("./screens/ImageLoadScreen"));
const PhaseFilterScreen = lazy(() => import("./screens/PhaseFilterScreen"));
const ManualScanScreen = lazy(() => import("./screens/ManualScanScreen"));
const MobileModePlaceholderScreen = lazy(() => import("./screens/MobileModePlaceholderScreen"));
const MockScanScreen = lazy(() => import("./screens/MockScanScreen"));
const TubeWarmupScreen = lazy(() => import("./screens/TubeWarmupScreen"));
const AirCalibrationScreen = lazy(() => import("./screens/AirCalibrationScreen"));
const DailyQAScreen = lazy(() => import("./screens/DailyQAScreen"));
const HardwareTestScreen = lazy(() => import("./screens/HardwareTestScreen"));
const BatteryManagementScreen = lazy(() => import("./screens/BatteryManagementScreen"));
const DiskManagementScreen = lazy(() => import("./screens/DiskManagementScreen"));
const PerformanceEvaluationScreen = lazy(() => import("./screens/PerformanceEvaluationScreen"));
const RuntimeStatsPage = lazy(() => import("./features/service/runtimeStats/RuntimeStatsPage"));
const QAReportPage = lazy(() => import("./features/service/qaReport/QAReportPage"));
const ServiceSystemLogPage = lazy(() => import("./features/service/reports/ServiceSystemLogPage"));
const ServiceAuditLogPage = lazy(() => import("./features/service/reports/ServiceAuditLogPage"));
const ServiceDoseLogsPage = lazy(() => import("./features/service/dose/ServiceDoseLogsPage"));
const ServiceDoseSettingsPage = lazy(() => import("./features/service/dose/ServiceDoseSettingsPage"));
const ProtocolManagementScreen = lazy(() => import("./screens/ProtocolManagementScreen"));
const CornerInfoPage = lazy(() => import("./features/service/cornerInfo/CornerInfoPage"));
const DicomSettingsPage = lazy(() => import("./features/service/dicom/DicomSettingsPage"));
const UserManagementPage = lazy(() => import("./features/service/userManagement/UserManagementPage"));
const SystemSettingsPage = lazy(() => import("./features/service/systemSettings/SystemSettingsPage"));
const OrganizationInfoPage = lazy(() => import("./features/service/organizationInfo/OrganizationInfoPage"));
const LoginScreen = lazy(() => import("./screens/LoginScreen"));
const ChangePasswordScreen = lazy(() => import("./screens/ChangePasswordScreen"));
const FeedbackShowcaseScreen = lazy(() => import("./screens/FeedbackShowcaseScreen"));
const RequireAuth = lazy(() => import("./components/RequireAuth"));
const EmergencyModeBanner = lazy(() => import("./components/EmergencyModeBanner"));
const DeviceErrorCenter = lazy(() => import("./components/DeviceErrorCenter"));
const KeyboardViewportAvoidance = lazy(() => import("./components/KeyboardViewportAvoidance"));

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

function AppLoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0B1220] text-slate-100">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-sky-400" />
        <p className="text-sm font-medium tracking-wide">正在加载控制台…</p>
      </div>
    </div>
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
            <Suspense fallback={<AppLoadingFallback />}>
              <AuthenticatedSystemOverlays />
              <Routes>
              <Route
                path="/dev/feedback-showcase"
                element={import.meta.env.DEV ? <FeedbackShowcaseScreen /> : <Navigate to="/login" replace />}
              />
              <Route path="/login" element={<LoginScreen />} />
              <Route element={<RequireAuth />}>
              <Route path="/change-password" element={<ChangePasswordScreen />} />
              <Route path="/" element={<HomeScreen />} />

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
              <KeyboardViewportAvoidance />
            </Suspense>
          </div>
        </div>
      </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
