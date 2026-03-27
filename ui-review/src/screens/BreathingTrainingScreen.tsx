import BreathingTrainingWorkflowScreen from "./BreathingTrainingWorkflowScreen";

const BreathingTrainingScreen = () => {
    return (
        <BreathingTrainingWorkflowScreen
            firstStepLabel={String.fromCharCode(0x53c2, 0x6570, 0x786e, 0x8ba4, 0x002d, 0x81ea, 0x7531, 0x547c, 0x5438, 0x6a21, 0x5f0f, 0x0056, 0x0031)}
            bottomPanelMode="breathing"
            viewportBgClassName="bg-white"
        />
    );
};

export default BreathingTrainingScreen;
