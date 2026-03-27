import BreathingAcquisitionWorkflowScreen from "./BreathingAcquisitionWorkflowScreen";

const BreathingAcquisitionScreen = () => {
    return (
        <BreathingAcquisitionWorkflowScreen
            firstStepLabel={String.fromCharCode(0x547c, 0x5438, 0x91c7, 0x96c6)}
            bottomPanelMode="breathing"
            viewportBgClassName="bg-white"
            breathingWorkflowVariant="acquisition"
        />
    );
};

export default BreathingAcquisitionScreen;
