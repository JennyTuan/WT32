import FourDBreathingPreparationWorkflowScreen from "./FourDBreathingPreparationWorkflowScreen";

export default function FourDBreathingPreparationScreen() {
    return (
        <FourDBreathingPreparationWorkflowScreen
            firstStepLabel={String.fromCharCode(0x547c, 0x5438, 0x91c7, 0x96c6)}
            bottomPanelMode="breathing"
            viewportBgClassName="bg-white"
            breathingWorkflowVariant="acquisition"
        />
    );
}
