import type {
    ApiProtocolDetail,
    ApiSeriesDetail,
    ApiReconSeries,
    Selection,
    BasicDraft,
    SeriesDraft,
    ReconDraft,
} from "./types";
import { ProtocolSidebar } from "./components/ProtocolSidebar";
import { useI18n } from "../../lib/i18nContext";
import { 
    BasicInfoPanel, 
    ScoutParamsPanel, 
    HelicalParamsPanel, 
    ReconParamsPanel, 
    DoseParamsPanel 
} from "./components/Panels";

interface ProtocolDetailLayoutProps {
    protocol: ApiProtocolDetail | null;
    selection: Selection;
    onSelect: (selection: Selection) => void;
    isNewMode: boolean;
    isReadOnly: boolean;
    isSaving: boolean;
    saveMessage: string | null;
    basicDraft: BasicDraft;
    seriesDraft: SeriesDraft;
    reconDraft: ReconDraft;
    activeSeries: ApiSeriesDetail | null;
    activeRecon: ApiReconSeries | null;
    ageLabel: string;
    bodyPartOptions: string[];
    ageGroupOptions: BasicDraft["ageGroup"][];
    selectedPos: string;
    setSelectedPos: (pos: string) => void;
    onBasicDraftChange: (patch: Partial<BasicDraft>) => void;
    onSeriesDraftChange: (patch: Partial<SeriesDraft>) => void;
    onReconDraftChange: (patch: Partial<ReconDraft>) => void;
    onAppendSeries: (type: ApiSeriesDetail["series_type"]) => void;
    onAppendRecon: (seriesId: number) => void;
    onDeleteSeries: () => void;
    onDeleteRecon: () => void;
    onModeChange: (mode: string) => void;
    onSave: () => void;
    onCancel: () => void;
}

export function ProtocolDetailLayout({
    protocol,
    selection,
    onSelect,
    isNewMode,
    isReadOnly,
    isSaving,
    saveMessage,
    basicDraft,
    seriesDraft,
    reconDraft,
    activeSeries,
    activeRecon,
    ageLabel,
    bodyPartOptions,
    ageGroupOptions,
    selectedPos,
    setSelectedPos,
    onBasicDraftChange,
    onSeriesDraftChange,
    onReconDraftChange,
    onAppendSeries,
    onAppendRecon,
    onDeleteSeries,
    onDeleteRecon,
    onModeChange,
    onSave,
    onCancel
}: ProtocolDetailLayoutProps) {
    const { t } = useI18n();
    const isErrorMessage = saveMessage ? /失败|failed/i.test(saveMessage) : false;

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl text-[#37474F] font-sans select-none">
            <header className="flex items-center px-5 h-[52px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <span className="text-[16px] font-bold text-[#37474F]">{t("protocolDetail.header")}</span>
            </header>

            <main className="flex-1 overflow-hidden p-2 flex gap-1">
                <ProtocolSidebar
                    protocol={protocol}
                    isNewMode={isNewMode}
                    selection={selection}
                    onSelect={onSelect}
                    onAppendSeries={onAppendSeries}
                    onAppendRecon={onAppendRecon}
                    ageLabel={ageLabel}
                />

                <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col overflow-hidden">
                    {selection.type === "basic" && (
                        <BasicInfoPanel
                            protocol={protocol}
                            draft={basicDraft}
                            selectedPos={selectedPos}
                            bodyPartOptions={bodyPartOptions}
                            ageGroupOptions={ageGroupOptions}
                            onPosChange={setSelectedPos}
                            onDraftChange={onBasicDraftChange}
                        />
                    )}
                    {selection.type === "series" && activeSeries?.series_type === "topogram" && (
                        <ScoutParamsPanel
                            draft={seriesDraft}
                            canEditMode={isNewMode}
                            onModeChange={onModeChange}
                            onDelete={onDeleteSeries}
                            onDraftChange={onSeriesDraftChange}
                        />
                    )}
                    {selection.type === "series" && activeSeries && activeSeries.series_type !== "topogram" && (
                        <HelicalParamsPanel
                            series={activeSeries}
                            draft={seriesDraft}
                            canEditMode={isNewMode}
                            onModeChange={onModeChange}
                            onDelete={onDeleteSeries}
                            onDraftChange={onSeriesDraftChange}
                        />
                    )}
                    {selection.type === "recon" && activeSeries && activeRecon && (
                        <ReconParamsPanel
                            series={activeSeries}
                            draft={reconDraft}
                            onDelete={onDeleteRecon}
                            onDraftChange={onReconDraftChange}
                        />
                    )}
                    {selection.type === "dose" && (
                        <DoseParamsPanel protocol={protocol} />
                    )}
                </section>
            </main>

            <footer className="flex items-center justify-end gap-3 px-5 h-[56px] bg-[#E8EAF1] border-t border-[#B0C4DE] shrink-0">
                {saveMessage && (
                    <span className={`mr-auto text-[12px] font-bold ${isErrorMessage ? "text-[#D32F2F]" : "text-[#1E88E5]"}`}>
                        {saveMessage}
                    </span>
                )}
                <button
                    onClick={onCancel}
                    className="h-[36px] px-6 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#546E7A] hover:bg-[#DCE6F2] transition-colors"
                >
                    {t("common.cancel")}
                </button>
                {!isReadOnly && (
                    <button
                        onClick={onSave}
                        disabled={isSaving || selection.type === "dose"}
                        className="h-[36px] px-6 bg-[#4D94FF] rounded-md text-[13px] font-bold text-white hover:bg-[#1E88E5] transition-colors disabled:bg-[#B0C4DE] disabled:cursor-not-allowed"
                    >
                        {isSaving ? `${t("common.saving")}...` : t("common.save")}
                    </button>
                )}
            </footer>
        </div>
    );
}
