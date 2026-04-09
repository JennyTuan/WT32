import { useProtocolDetail } from "../features/protocolDetail/hooks/useProtocolDetail";
import { ProtocolDetailLayout } from "../features/protocolDetail/ProtocolDetailLayout";

export default function WT32ProtocolDetailScreen() {
    const {
        protocol,
        selection,
        setSelection,
        isSaving,
        saveMessage,
        basicDraft,
        setBasicDraft,
        seriesDraft,
        setSeriesDraft,
        reconDraft,
        setReconDraft,
        isReadOnly,
        isNewMode,
        ageLabel,
        bodyPartOptions,
        ageGroupOptions,
        selectedPos,
        setSelectedPos,
        activeSeries,
        activeRecon,
        appendDraftSeries,
        appendDraftRecon,
        handleDeleteActiveSeries,
        handleDeleteActiveRecon,
        handleSeriesModeChange,
        handleSave,
        navigate
    } = useProtocolDetail();

    return (
        <ProtocolDetailLayout
            protocol={protocol}
            selection={selection}
            onSelect={setSelection}
            isNewMode={isNewMode}
            isReadOnly={isReadOnly}
            isSaving={isSaving}
            saveMessage={saveMessage}
            basicDraft={basicDraft}
            seriesDraft={seriesDraft}
            reconDraft={reconDraft}
            activeSeries={activeSeries}
            activeRecon={activeRecon}
            ageLabel={ageLabel}
            bodyPartOptions={bodyPartOptions}
            ageGroupOptions={ageGroupOptions}
            selectedPos={selectedPos}
            setSelectedPos={setSelectedPos}
            onBasicDraftChange={(patch) => setBasicDraft((current) => ({ ...current, ...patch }))}
            onSeriesDraftChange={(patch) => setSeriesDraft((current) => ({ ...current, ...patch }))}
            onReconDraftChange={(patch) => setReconDraft((current) => ({ ...current, ...patch }))}
            onAppendSeries={appendDraftSeries}
            onAppendRecon={appendDraftRecon}
            onDeleteSeries={handleDeleteActiveSeries}
            onDeleteRecon={handleDeleteActiveRecon}
            onModeChange={handleSeriesModeChange}
            onSave={() => void handleSave()}
            onCancel={() => navigate(-1)}
        />
    );
}