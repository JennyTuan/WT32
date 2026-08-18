import {
    fetchFourDResult,
    type FourDResultWorkflowStage,
    type PersistedFourDResult,
} from "./fourDResult";
import {
    fetchSelectedScanSession,
    type ApiScanSessionDetail,
    type ApiScanSessionSeries,
} from "./scanSession";

export type FourDRecoveryDestination =
    | "rescan"
    | "image-load"
    | "phase-filter"
    | "viewer"
    | "blocked";

export type AuthoritativeFourDRecovery = {
    session: ApiScanSessionDetail;
    target: ApiScanSessionSeries;
    result: PersistedFourDResult;
};

export type FourDRecoveryDependencies = {
    fetchSelectedSession: typeof fetchSelectedScanSession;
    fetchResult: typeof fetchFourDResult;
};

export type FourDRecoveryErrorCode =
    | "invalid_patient"
    | "session_not_found"
    | "patient_mismatch"
    | "not_four_d"
    | "target_count_mismatch"
    | "target_session_mismatch"
    | "result_session_mismatch"
    | "result_patient_mismatch"
    | "result_target_mismatch";

export class FourDRecoveryError extends Error {
    readonly code: FourDRecoveryErrorCode;

    constructor(code: FourDRecoveryErrorCode, message: string) {
        super(message);
        this.name = "FourDRecoveryError";
        this.code = code;
    }
}

const defaultDependencies: FourDRecoveryDependencies = {
    fetchSelectedSession: fetchSelectedScanSession,
    fetchResult: fetchFourDResult,
};

export const loadAuthoritativeFourDRecovery = async (
    patientId: number,
    dependencies: FourDRecoveryDependencies = defaultDependencies,
): Promise<AuthoritativeFourDRecovery> => {
    if (!Number.isInteger(patientId) || patientId <= 0) {
        throw new FourDRecoveryError("invalid_patient", "A valid patient is required to recover a 4D workflow.");
    }

    const session = await dependencies.fetchSelectedSession({ preferCache: false });
    if (!session) {
        throw new FourDRecoveryError("session_not_found", "No selected scan session is available.");
    }
    if (session.patient_id !== patientId) {
        throw new FourDRecoveryError("patient_mismatch", "The selected scan session belongs to another patient.");
    }
    if (session.acquisition_type !== "four_d") {
        throw new FourDRecoveryError("not_four_d", "The selected scan session is not a 4D acquisition.");
    }

    const targets = session.series.filter((series) => series.series_type === "4d");
    if (targets.length !== 1) {
        throw new FourDRecoveryError(
            "target_count_mismatch",
            "The selected scan session must contain exactly one 4D target series.",
        );
    }

    const target = targets[0];
    if (target.scan_session_id !== session.id) {
        throw new FourDRecoveryError(
            "target_session_mismatch",
            "The 4D target series is not bound to the selected scan session.",
        );
    }

    const result = await dependencies.fetchResult({
        scanSessionId: session.id,
        patientId,
        targetSeriesId: target.id,
    });
    if (result.scanSessionId !== session.id) {
        throw new FourDRecoveryError(
            "result_session_mismatch",
            "The persisted 4D result belongs to another scan session.",
        );
    }
    if (result.patientId !== patientId) {
        throw new FourDRecoveryError(
            "result_patient_mismatch",
            "The persisted 4D result belongs to another patient.",
        );
    }
    if (result.targetSeriesId !== target.id) {
        throw new FourDRecoveryError(
            "result_target_mismatch",
            "The persisted 4D result belongs to another target series.",
        );
    }

    return { session, target, result };
};

export type FourDRecoveryState = {
    workflowStage: FourDResultWorkflowStage;
    rescanOccurred: boolean;
    sessionStatus: ApiScanSessionDetail["status"];
    targetStatus: ApiScanSessionSeries["execution_status"];
};

export const resolveFourDRecoveryDestination = ({
    workflowStage,
    sessionStatus,
    targetStatus,
}: FourDRecoveryState): FourDRecoveryDestination => {
    if (sessionStatus === "completed") {
        return workflowStage === "ready" && targetStatus === "image_ready"
            ? "viewer"
            : "blocked";
    }

    if (sessionStatus !== "in_progress") return "blocked";

    if (workflowStage === "ready" || workflowStage === "phase_selected") {
        return targetStatus === "running" || targetStatus === "image_ready"
            ? "phase-filter"
            : "blocked";
    }

    if (targetStatus !== "running") return "blocked";
    if (workflowStage === "rescan_selected" || workflowStage === "data_reviewed") return "image-load";
    if (workflowStage === "acquired") return "rescan";
    return "blocked";
};

export const resolveLoadedFourDRecoveryDestination = ({
    session,
    target,
    result,
}: AuthoritativeFourDRecovery): FourDRecoveryDestination => resolveFourDRecoveryDestination({
    workflowStage: result.workflowStage,
    rescanOccurred: result.scanResult.rescanOccurred,
    sessionStatus: session.status,
    targetStatus: target.execution_status,
});
