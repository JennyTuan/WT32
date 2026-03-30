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

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
