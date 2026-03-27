import FreeBreathingModeConfirmWorkflowScreen from "./FreeBreathingModeConfirmWorkflowScreen";

export default function FreeBreathingModeConfirmScreen() {
    return (
        <FreeBreathingModeConfirmWorkflowScreen
            firstStepLabel={String.fromCharCode(0x547c, 0x5438, 0x91c7, 0x96c6)}
            bottomPanelMode="breathing"
            viewportBgClassName="bg-white"
            breathingWorkflowVariant="acquisition"
        />
    );
}
