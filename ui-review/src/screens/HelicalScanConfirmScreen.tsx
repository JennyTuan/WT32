import { useState } from "react";
import ScanConfirmScreen from "./ScanConfirmScreen";
import { TomographicScoutViewport } from "./SequenceScanConfirmScreen";

const HelicalScanConfirmScreen = () => {
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="helicalScan"
            helicalParamOverrides={measurements}
            rightViewportContent={<TomographicScoutViewport onMeasurementChange={setMeasurements} />}
        />
    );
};

export default HelicalScanConfirmScreen;
