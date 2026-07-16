import { fetchFourDResult, toFourDPostScanState } from "./fourDResult";
import {
    fetchScanSessionById,
    type ApiScanSessionDetail,
} from "./scanSession";
import type { FourDPostScanState } from "./fourDTypes";

export type CompletedExamViewerState =
    | { offlineRecon: true }
    | (FourDPostScanState & {
        initialBrowseMode: "phase";
        offlineRecon: true;
    });

type CompletedExamReference = {
    patientId: number;
    scanSessionId: number | null;
    acquisitionType: ApiScanSessionDetail["acquisition_type"] | null;
    scanMode: ApiScanSessionDetail["scan_mode"] | null;
};

type CompletedExamViewerDependencies = {
    fetchScanSession: typeof fetchScanSessionById;
    fetchResult: typeof fetchFourDResult;
};

const defaultDependencies: CompletedExamViewerDependencies = {
    fetchScanSession: fetchScanSessionById,
    fetchResult: fetchFourDResult,
};

const unavailableViewerState = (): CompletedExamViewerState => ({ offlineRecon: true });

export const resolveCompletedExamViewerState = async (
    reference: CompletedExamReference,
    dependencies: CompletedExamViewerDependencies = defaultDependencies,
): Promise<CompletedExamViewerState> => {
    const isFourD = reference.acquisitionType === "four_d" || reference.scanMode === "4d";
    if (!isFourD || !reference.scanSessionId) return unavailableViewerState();

    try {
        const scanSession = await dependencies.fetchScanSession(reference.scanSessionId);
        if (
            scanSession.id !== reference.scanSessionId
            || scanSession.patient_id !== reference.patientId
            || scanSession.acquisition_type !== "four_d"
            || scanSession.status !== "completed"
        ) {
            return unavailableViewerState();
        }

        const targets = scanSession.series.filter((series) => series.series_type === "4d");
        if (targets.length !== 1 || targets[0].execution_status !== "image_ready") {
            return unavailableViewerState();
        }

        const target = targets[0];
        const result = await dependencies.fetchResult({
            scanSessionId: scanSession.id,
            patientId: reference.patientId,
            targetSeriesId: target.id,
        });
        if (
            result.scanSessionId !== scanSession.id
            || result.patientId !== reference.patientId
            || result.targetSeriesId !== target.id
            || result.workflowStage !== "ready"
            || result.imageSourceId !== "fourd-engineer"
            || result.imageSourceVersion !== 1
        ) {
            return unavailableViewerState();
        }

        return {
            ...toFourDPostScanState(result),
            initialBrowseMode: "phase",
            offlineRecon: true,
        };
    } catch {
        // 历史影像读取失败时仍进入查看器，由查看器统一展示“影像不可用”。
        return unavailableViewerState();
    }
};
