import { buildApiUrl } from "./apiClient";
import { cacheScanSessionIfSelected, fetchSelectedScanSession, type ApiScanSessionDetail } from "./scanSession";
import type {
  BedPhaseCell,
  FourDPostScanState,
  FourDScanResult,
  PhaseSelections,
  RescanChoices,
} from "./fourDTypes";

export type FourDResultWorkflowStage = "acquired" | "rescan_selected" | "phase_selected" | "ready";

type ApiBedPhaseCell = {
  frame_count: number;
  selected_frame: number;
};

type ApiFourDScanResult = {
  bed_count: number;
  phase_count: number;
  scan_length: number;
  phase_matrix: ApiBedPhaseCell[][];
  rescan_occurred: boolean;
  rescan_bed_range: [number, number] | null;
};

type ApiFourDResult = {
  id: number;
  scan_session_id: number;
  patient_id: number;
  target_series_id: number;
  version: number;
  workflow_stage: FourDResultWorkflowStage;
  source_kind: "simulation";
  image_source_id: "fourd-engineer";
  image_source_version: 1;
  source_attempt_id: number | null;
  scan_result: ApiFourDScanResult;
  rescan_choices: Record<string, "first" | "rescan"> | null;
  phase_selections: Record<string, number> | null;
  created_at: string;
  updated_at: string;
};

export type PersistedFourDResult = {
  id: number;
  scanSessionId: number;
  patientId: number;
  targetSeriesId: number;
  version: number;
  workflowStage: FourDResultWorkflowStage;
  sourceKind: "simulation";
  imageSourceId: "fourd-engineer";
  imageSourceVersion: 1;
  sourceAttemptId?: number;
  scanResult: FourDScanResult;
  rescanChoices?: RescanChoices;
  phaseSelections?: PhaseSelections;
  createdAt: string;
  updatedAt: string;
};

const toApiCell = (cell: BedPhaseCell): ApiBedPhaseCell => ({
  frame_count: cell.frameCount,
  selected_frame: cell.selectedFrame,
});

const toApiScanResult = (result: FourDScanResult): ApiFourDScanResult => ({
  bed_count: result.bedCount,
  phase_count: result.phaseCount,
  scan_length: result.scanLength,
  phase_matrix: result.phaseMatrix.map((row) => row.map(toApiCell)),
  rescan_occurred: result.rescanOccurred,
  rescan_bed_range: result.rescanBedRange,
});

const fromApiScanResult = (result: ApiFourDScanResult): FourDScanResult => ({
  bedCount: result.bed_count,
  phaseCount: result.phase_count,
  scanLength: result.scan_length,
  phaseMatrix: result.phase_matrix.map((row) => row.map((cell) => ({
    frameCount: cell.frame_count,
    selectedFrame: cell.selected_frame,
  }))),
  rescanOccurred: result.rescan_occurred,
  rescanBedRange: result.rescan_bed_range,
});

const fromApiResult = (result: ApiFourDResult): PersistedFourDResult => ({
  id: result.id,
  scanSessionId: result.scan_session_id,
  patientId: result.patient_id,
  targetSeriesId: result.target_series_id,
  version: result.version,
  workflowStage: result.workflow_stage,
  sourceKind: result.source_kind,
  imageSourceId: result.image_source_id,
  imageSourceVersion: result.image_source_version,
  sourceAttemptId: result.source_attempt_id ?? undefined,
  scanResult: fromApiScanResult(result.scan_result),
  rescanChoices: result.rescan_choices ?? undefined,
  phaseSelections: result.phase_selections ?? undefined,
  createdAt: result.created_at,
  updatedAt: result.updated_at,
});

export class FourDResultRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FourDResultRequestError";
    this.status = status;
  }
}

const parseError = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => null) as { detail?: string } | null;
  return new FourDResultRequestError(body?.detail || `${fallback}: ${response.status}`, response.status);
};

export const fetchFourDResult = async ({
  scanSessionId,
  patientId,
  targetSeriesId,
}: {
  scanSessionId: number;
  patientId: number;
  targetSeriesId: number;
}) => {
  const query = new URLSearchParams({
    patient_id: String(patientId),
    target_series_id: String(targetSeriesId),
  });
  const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}/fourd-result?${query}`));
  if (!response.ok) throw await parseError(response, "Failed to load 4D result");
  return fromApiResult(await response.json() as ApiFourDResult);
};

export const saveFourDResult = async ({
  scanSessionId,
  patientId,
  targetSeriesId,
  expectedVersion,
  workflowStage,
  state,
}: {
  scanSessionId: number;
  patientId: number;
  targetSeriesId: number;
  expectedVersion: number;
  workflowStage: FourDResultWorkflowStage;
  state: Pick<FourDPostScanState, "scanResult" | "rescanChoices" | "phaseSelections">;
}) => {
  const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}/fourd-result`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patient_id: patientId,
      target_series_id: targetSeriesId,
      expected_version: expectedVersion,
      workflow_stage: workflowStage,
      scan_result: toApiScanResult(state.scanResult),
      rescan_choices: state.rescanChoices ?? null,
      phase_selections: state.phaseSelections ?? null,
    }),
  });
  if (!response.ok) throw await parseError(response, "Failed to save 4D result");
  return fromApiResult(await response.json() as ApiFourDResult);
};

export const toFourDPostScanState = (result: PersistedFourDResult): FourDPostScanState => ({
  scanSessionId: result.scanSessionId,
  targetSeriesId: result.targetSeriesId,
  resultVersion: result.version,
  workflowStage: result.workflowStage,
  imageSourceId: result.imageSourceId,
  imageSourceVersion: result.imageSourceVersion,
  sourceAttemptId: result.sourceAttemptId,
  scanResult: result.scanResult,
  rescanChoices: result.rescanChoices,
  phaseSelections: result.phaseSelections,
  showSliceLoadingBeforeImageLoad: false,
});

type ApiFinalizeFourDResultResponse = {
  replayed: boolean;
  result: ApiFourDResult;
  scan_session: ApiScanSessionDetail;
};

export const finalizeFourDResult = async ({
  scanSessionId,
  patientId,
  targetSeriesId,
  expectedVersion,
}: {
  scanSessionId: number;
  patientId: number;
  targetSeriesId: number;
  expectedVersion: number;
}) => {
  const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}/fourd-result/finalize`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patient_id: patientId,
      target_series_id: targetSeriesId,
      expected_version: expectedVersion,
    }),
  });
  if (!response.ok) throw await parseError(response, "Failed to finalize 4D result");
  const result = await response.json() as ApiFinalizeFourDResultResponse;
  cacheScanSessionIfSelected(result.scan_session);
  return {
    replayed: result.replayed,
    result: fromApiResult(result.result),
    scanSession: result.scan_session,
  };
};

export const fetchSelectedFourDPostScanState = async (patientId: number) => {
  const scanSession = await fetchSelectedScanSession({ preferCache: false });
  if (!scanSession || scanSession.patient_id !== patientId || scanSession.acquisition_type !== "four_d") {
    throw new Error("当前患者与 4D 扫描会话不匹配");
  }
  const targets = scanSession.series.filter((series) => series.series_type === "4d");
  if (targets.length !== 1) throw new Error("当前扫描会话没有唯一的 4D 目标序列");
  return toFourDPostScanState(await fetchFourDResult({
    scanSessionId: scanSession.id,
    patientId,
    targetSeriesId: targets[0].id,
  }));
};
