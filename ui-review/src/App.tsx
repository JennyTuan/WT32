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
      <div className="min-h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top,#dbeafe_0%,#e2e8f0_30%,#cbd5e1_60%,#94a3b8_100%)] flex items-center justify-center p-6">
        <div
          className="relative rounded-[42px] bg-[#0f172a] p-5 shadow-[0_40px_100px_rgba(15,23,42,0.38),inset_0_1px_0_rgba(255,255,255,0.08)]"
          style={{ width: shellWidth, height: shellHeight }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-[10px] flex justify-center">
            <div className="h-[8px] w-[148px] rounded-full bg-[#334155]" />
          </div>
          <div className="pointer-events-none absolute left-[12px] top-[150px] h-[54px] w-[4px] rounded-full bg-[#1e293b]" />
          <div className="pointer-events-none absolute right-[12px] top-1/2 h-[72px] w-[4px] -translate-y-1/2 rounded-full bg-[#1e293b]" />

          <div
            className="absolute left-1/2 top-1/2 origin-center overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
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

              <Route path="*" element={<Navigate to="/patients" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
