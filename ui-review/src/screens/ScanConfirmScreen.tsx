import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsUp,
    FilePlus,
    Trash2,
    CheckCircle,
    StretchHorizontal,
    Check,
    AlertTriangle,
    Fingerprint,
    Stethoscope,
    UserCircle,
    Info,
    X,
} from "lucide-react";
import { ensureBusinessSnapshotImported, loadProtocolCasesFromDb, type RawProtocolCase } from "../lib/protocolDb";
import { loadSelectedPatient } from "../lib/patientSession";
import {
    clearSelectedScanSessionId,
    fetchSelectedScanSession,
    loadSelectedScanSessionId,
    updateSelectedScanSession,
    updateSelectedScanSessionTopogramParam,
    type ApiScanSessionDetail,
} from "../lib/scanSession";
import { applyScanWorkflowAction, createActionId } from "../lib/scanWorkflowActions";
import { loadSelectedScanWorkflowPlans, type WorkflowSequenceType } from "../lib/scanWorkflowSession";
import { isHeadDualScoutWorkflow, mergeDualScoutPlanSequences } from "../lib/headDualScoutDemo";
import AppHeader from "../components/AppHeader";
import PhysicalControlPanelSvg from "../components/PhysicalControlPanelSvg";
import { PhysicalButtonStatusDot } from "../components/SimulatedPhysicalButton";
import { useI18n } from "../lib/i18nContext";
import type { TranslationKey } from "../lib/i18n";
import { clampMa, getMaLimit } from "../lib/tubeCurrent";

interface Sequence {
    id: string;
    name: string;
    type?: WorkflowSequenceType;
    steps?: string[];
}

interface ProtocolGroup {
    id: string;
    name: string;
    sequences: Sequence[];
}

type ScanConfirmScreenProps = {
    activeScoutStepIndex?: number;
    activeSequenceId?: string;
    activeSequenceStepIndex?: number;
    forceFourDScoutWorkflow?: boolean;
    parameterPanelMode?: "scout" | "tomographicScan" | "helicalScan";
    tomographicParamOverrides?: Partial<TomographicScanDisplayParams>;
    helicalParamOverrides?: Partial<HelicalScanDisplayParams>;
    rightViewportContent?: React.ReactNode;
    rightViewportClassName?: string;
    extraParamSection?: React.ReactNode;
    extraParamSectionTitle?: string;
    autoMaEnabled?: boolean;
    onAutoMaEnabledChange?: (value: boolean) => void;
    readOnlyMode?: boolean;
    onExecuteScan?: () => void;
    onScoutAngleChange?: (angle: number) => void;
    patientConfirmBeforeExecute?: boolean;
    executeButtonLabel?: string;
    executeButtonCompact?: boolean;
    nextRoute?: string;
    allowBackNavigation?: boolean;
    executeDisabled?: boolean;
};

type ScoutDisplayParams = {
    scanLength: string;
    mA: string;
    kV: string;
    angle: string;
    position: string;
    scanningDirection: string;
    doseCtdiVol: string;
    doseDlp: string;
    notifyCtdiVol: string;
    notifyDlp: string;
};

type TomographicScanDisplayParams = {
    scanLength: string;
    mA: string;
    kV: string;
    angle: string;
    position: string;
    rotationTime: string;
    collimation: string;
    scanIncrement: string;
    cycleCount: string;
    scanningDirection: string;
    scoutFov: string;
    doseCtdiVol: string;
    doseDlp: string;
};

type HelicalScanDisplayParams = {
    scanLength: string;
    mA: string;
    kV: string;
    angle: string;
    position: string;
    rotationTime: string;
    collimation: string;
    pitch: string;
    scanningDirection: string;
    scoutFov: string;
    doseCtdiVol: string;
    doseDlp: string;
};

type ScoutDoseDisplayParams = {
    doseCtdiVol: string;
    doseDlp: string;
    notifyCtdiVol: string;
    notifyDlp: string;
};

const DEFAULT_SCOUT_PARAMS: ScoutDisplayParams = {
    scanLength: "--",
    mA: "--",
    kV: "--",
    angle: "--",
    position: "--",
    scanningDirection: "--",
    doseCtdiVol: "--",
    doseDlp: "--",
    notifyCtdiVol: "--",
    notifyDlp: "--",
};

const DEFAULT_TOMOGRAPHIC_SCAN_PARAMS: TomographicScanDisplayParams = {
    scanLength: "--",
    mA: "--",
    kV: "--",
    angle: "--",
    position: "--",
    rotationTime: "--",
    collimation: "--",
    scanIncrement: "--",
    cycleCount: "--",
    scanningDirection: "--",
    scoutFov: "--",
    doseCtdiVol: "--",
    doseDlp: "--",
};

const DEFAULT_HELICAL_SCAN_PARAMS: HelicalScanDisplayParams = {
    scanLength: "--",
    mA: "--",
    kV: "--",
    angle: "--",
    position: "--",
    rotationTime: "--",
    collimation: "--",
    pitch: "--",
    scanningDirection: "--",
    scoutFov: "--",
    doseCtdiVol: "--",
    doseDlp: "--",
};

const DEFAULT_SCOUT_DOSE_PARAMS: ScoutDoseDisplayParams = {
    doseCtdiVol: "--",
    doseDlp: "--",
    notifyCtdiVol: "--",
    notifyDlp: "--",
};

const buildSequenceSteps = (
    type: WorkflowSequenceType,
    isFourDScoutWorkflow: boolean,
    t: (key: TranslationKey) => string,
) => {
    if (type === "scout") {
        if (isFourDScoutWorkflow) {
            return [
                t("scanFlow.step.breathingAcquisition"),
                t("scanFlow.step.laserPosition"),
                t("scanFlow.step.parameterConfirm"),
                t("scanFlow.step.executeScan"),
            ];
        }
        return [
            t("scanFlow.step.laserPosition"),
            t("scanFlow.step.parameterConfirm"),
            t("scanFlow.step.executeScan"),
        ];
    }

    return [
        t("scanFlow.step.parameterConfirm"),
        t("scanFlow.step.executeScan"),
    ];
};

const DETAIL_TARGET_STORAGE_KEY = "scanConfirmDetailTarget";
const TUBE_ANGLE_OPTIONS = [0, 90, 180, 270] as const;

type TubeAngleOption = (typeof TUBE_ANGLE_OPTIONS)[number];

const isTubeAngleOption = (value: number): value is TubeAngleOption =>
    TUBE_ANGLE_OPTIONS.some((option) => option === value);

const parseTubeAngleOption = (value: unknown): TubeAngleOption | null => {
    const numeric = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(numeric)) return null;
    const normalized = ((Math.round(numeric) % 360) + 360) % 360;
    return isTubeAngleOption(normalized) ? normalized : null;
};

const toTubeAngleOption = (value: unknown, fallback: TubeAngleOption): TubeAngleOption =>
    parseTubeAngleOption(value) ?? fallback;

const patchTopogramAngleInScanSession = (
    scanSession: ApiScanSessionDetail,
    paramIds: number[],
    tubeAngle: TubeAngleOption,
): ApiScanSessionDetail => ({
    ...scanSession,
    series: scanSession.series.map((series) => {
        if (!series.topogram_param || !paramIds.includes(series.topogram_param.id)) return series;
        return {
            ...series,
            topogram_param: {
                ...series.topogram_param,
                tube_angle: tubeAngle,
            },
        };
    }),
});

const inferSequenceType = (sequence: Sequence): WorkflowSequenceType => {
    if (sequence.type) return sequence.type;

    const normalizedName = sequence.name.toLowerCase();
    if (normalizedName.includes("scout")) return "scout";
    if (normalizedName.includes("helical")) return "helical";
    if (normalizedName.includes("axial")) return "axial";
    if (normalizedName.includes("4d")) return "4d";
    return "other";
};

const mapScanSessionToProtocolCases = (scanSession: ApiScanSessionDetail | null): RawProtocolCase[] | undefined => {
    if (!scanSession) return undefined;

    return [{
        protocol: {
            id: String(scanSession.id),
            name: scanSession.name,
            acquisitionType: scanSession.acquisition_type,
            patientType: scanSession.age_group === "adult" ? "adult" : "child",
            scanLocationLabel: scanSession.body_part,
            supportedPositions: [scanSession.patient_position],
            supportedModes: scanSession.series.map((series) => {
                switch (series.series_type) {
                    case "topogram":
                        return "定位像";
                    case "helical":
                        return "螺旋扫描";
                    case "axial":
                        return "断层扫描";
                    case "4d":
                        return "4D";
                    default:
                        return series.series_type;
                }
            }),
        },
        sequences: scanSession.series.map((series) => {
            const topogram = series.topogram_param;
            const helical = series.helical_param;
            const axial = series.axial_param;
            const scanParams: Record<string, string | number | boolean> = {
                angle: topogram?.tube_angle ?? 0,
                collimation: "--",
                // 滑轨 CT 由机架沿患者固定体位移动，方向来自该序列本身而非床位设置。
                scanningDirection: topogram?.scan_direction
                    ?? helical?.scan_direction
                    ?? axial?.scan_direction
                    ?? "HEAD_TO_FOOT",
            };

            if (topogram?.scan_length !== undefined) scanParams.scanLength = topogram.scan_length;
            if (helical?.scan_length !== undefined) scanParams.scanLength = helical.scan_length;
            if (axial?.scan_length !== undefined) scanParams.scanLength = axial.scan_length;
            if (topogram?.ma !== undefined) scanParams.mA = topogram.ma;
            if (helical?.ma !== undefined) scanParams.mA = helical.ma;
            if (axial?.ma !== undefined) scanParams.mA = axial.ma;
            if (topogram?.kv !== undefined) scanParams.kV = topogram.kv;
            if (helical?.kv !== undefined) scanParams.kV = helical.kv;
            if (axial?.kv !== undefined) scanParams.kV = axial.kv;
            if (helical?.rotation_time !== undefined) scanParams.rotationTime = helical.rotation_time;
            if (axial?.rotation_time !== undefined) scanParams.rotationTime = axial.rotation_time;
            if (helical?.pitch !== undefined) scanParams.pitch = helical.pitch;
            if (axial?.slice_interval !== undefined) scanParams.scanIncrement = axial.slice_interval;
            if (axial?.step_count !== undefined && axial.step_count !== null) scanParams.cycleCount = axial.step_count;
            if (topogram?.fov !== undefined) scanParams.scoutFOV = topogram.fov;
            if (helical?.fov !== undefined) scanParams.scoutFOV = helical.fov;
            if (axial?.fov !== undefined) scanParams.scoutFOV = axial.fov;
            if (helical?.ctdi_vol != null) scanParams.ctdiVol = helical.ctdi_vol;
            if (helical?.dlp != null) scanParams.dlp = helical.dlp;
            if (axial?.ctdi_vol != null) scanParams.ctdiVol = axial.ctdi_vol;
            if (axial?.dlp != null) scanParams.dlp = axial.dlp;

            return {
                id: String(series.id),
                name: series.series_label,
                sequenceType: series.series_type === "topogram" ? "localizer" : "scan",
                mode: series.series_type === "topogram" ? "定位像" : series.series_type === "helical" ? "螺旋扫描" : series.series_type === "axial" ? "断层扫描" : "4D",
                scanParams,
                reconstructionParams: series.recon_series.map((recon) => {
                    const params: Record<string, string | number | boolean> = {
                        sliceThickness: recon.slice_thickness,
                        kernel: recon.kernel,
                        windowCenter: recon.window_level,
                        windowWidth: recon.window_width,
                        matrix: recon.matrix,
                    };
                    if (recon.increment !== undefined && recon.increment !== null) {
                        params.interval = recon.increment;
                    }

                    return {
                        id: String(recon.id),
                        name: recon.recon_name,
                        params,
                    };
                }),
            };
        }),
    }];
};

const getScoutDoseDisplayParamsFromSession = (scanSession: ApiScanSessionDetail | null): ScoutDoseDisplayParams | null => {
    if (!scanSession) return null;
    const scoutSeries = scanSession.series.find((series) => series.series_type === "topogram");
    const topogram = scoutSeries?.topogram_param;
    if (!topogram) return null;

    return {
        doseCtdiVol: toDisplayValue(topogram.ctdi_vol ?? undefined, 2),
        doseDlp: toDisplayValue(topogram.dlp ?? undefined, 2),
        notifyCtdiVol: toDisplayValue(topogram.ctdi_vol ?? undefined, 2),
        notifyDlp: toDisplayValue(topogram.dlp ?? undefined, 2),
    };
};

const toDisplayValue = (value: string | number | boolean | undefined, fractionDigits?: number): string => {
    if (typeof value === "number") {
        return typeof fractionDigits === "number" ? value.toFixed(fractionDigits) : String(value);
    }
    if (typeof value === "string" && value.trim().length > 0) return value;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return "--";
};

const getScoutDisplayParams = (protocolCases: RawProtocolCase[] | undefined): ScoutDisplayParams => {
    if (!protocolCases || protocolCases.length === 0) return DEFAULT_SCOUT_PARAMS;

    const protocolCase = protocolCases.find((item) =>
        item.sequences.some((sequence) => sequence.sequenceType === "localizer")
    );
    if (!protocolCase) return DEFAULT_SCOUT_PARAMS;

    const scoutSequence = protocolCase.sequences.find((sequence) => sequence.sequenceType === "localizer");
    if (!scoutSequence) return DEFAULT_SCOUT_PARAMS;

    return {
        scanLength: toDisplayValue(scoutSequence.scanParams.scanLength, 2),
        mA: toDisplayValue(scoutSequence.scanParams.mA),
        kV: toDisplayValue(scoutSequence.scanParams.kV),
        angle: toDisplayValue(scoutSequence.scanParams.angle),
        position: protocolCase.protocol.supportedPositions[0] ?? "--",
        scanningDirection: toDisplayValue(scoutSequence.scanParams.scanningDirection),
        doseCtdiVol: "--",
        doseDlp: "--",
        notifyCtdiVol: "--",
        notifyDlp: "--",
    };
};

const getTomographicScanDisplayParams = (protocolCases: RawProtocolCase[] | undefined): TomographicScanDisplayParams => {
    if (!protocolCases || protocolCases.length === 0) return DEFAULT_TOMOGRAPHIC_SCAN_PARAMS;

    const protocolCase = protocolCases.find((item) =>
        item.sequences.some((sequence) => sequence.sequenceType === "scan" && sequence.mode === "断层扫描")
    );
    if (!protocolCase) return DEFAULT_TOMOGRAPHIC_SCAN_PARAMS;

    const scanSequence = protocolCase.sequences.find(
        (sequence) => sequence.sequenceType === "scan" && sequence.mode === "断层扫描"
    );
    if (!scanSequence) return DEFAULT_TOMOGRAPHIC_SCAN_PARAMS;

    return {
        scanLength: toDisplayValue(scanSequence.scanParams.scanLength, 2),
        mA: toDisplayValue(scanSequence.scanParams.mA),
        kV: toDisplayValue(scanSequence.scanParams.kV),
        angle: toDisplayValue(scanSequence.scanParams.angle),
        position: protocolCase.protocol.supportedPositions[0] ?? "--",
        rotationTime: toDisplayValue(scanSequence.scanParams.rotationTime),
        collimation: toDisplayValue(scanSequence.scanParams.collimation),
        scanIncrement: toDisplayValue(scanSequence.scanParams.scanIncrement, 1),
        cycleCount: toDisplayValue(scanSequence.scanParams.cycleCount),
        scanningDirection: toDisplayValue(scanSequence.scanParams.scanningDirection),
        scoutFov: toDisplayValue(scanSequence.scanParams.scoutFOV),
        doseCtdiVol: toDisplayValue(scanSequence.scanParams.ctdiVol, 2),
        doseDlp: toDisplayValue(scanSequence.scanParams.dlp, 2),
    };
};

const getHelicalScanDisplayParams = (protocolCases: RawProtocolCase[] | undefined): HelicalScanDisplayParams => {
    if (!protocolCases || protocolCases.length === 0) return DEFAULT_HELICAL_SCAN_PARAMS;

    const protocolCase = protocolCases.find((item) =>
        item.sequences.some((sequence) => sequence.sequenceType === "scan" && sequence.mode === "螺旋扫描")
    );
    if (!protocolCase) return DEFAULT_HELICAL_SCAN_PARAMS;

    const scanSequence = protocolCase.sequences.find(
        (sequence) => sequence.sequenceType === "scan" && sequence.mode === "螺旋扫描"
    );
    if (!scanSequence) return DEFAULT_HELICAL_SCAN_PARAMS;

    return {
        scanLength: toDisplayValue(scanSequence.scanParams.scanLength, 2),
        mA: toDisplayValue(scanSequence.scanParams.mA),
        kV: toDisplayValue(scanSequence.scanParams.kV),
        angle: toDisplayValue(scanSequence.scanParams.angle),
        position: protocolCase.protocol.supportedPositions[0] ?? "--",
        rotationTime: toDisplayValue(scanSequence.scanParams.rotationTime),
        collimation: toDisplayValue(scanSequence.scanParams.collimation),
        pitch: toDisplayValue(scanSequence.scanParams.pitch, 3),
        scanningDirection: toDisplayValue(scanSequence.scanParams.scanningDirection),
        scoutFov: toDisplayValue(scanSequence.scanParams.scoutFOV),
        doseCtdiVol: toDisplayValue(scanSequence.scanParams.ctdiVol, 2),
        doseDlp: toDisplayValue(scanSequence.scanParams.dlp, 2),
    };
};

const ScanConfirmScreen = ({
    activeScoutStepIndex = 1,
    activeSequenceId,
    activeSequenceStepIndex,
    forceFourDScoutWorkflow = false,
    parameterPanelMode = "scout",
    tomographicParamOverrides,
    extraParamSection,
    extraParamSectionTitle,
    helicalParamOverrides,
    rightViewportContent,
    rightViewportClassName,
    autoMaEnabled,
    onAutoMaEnabledChange,
    readOnlyMode = false,
    onExecuteScan,
    onScoutAngleChange,
    patientConfirmBeforeExecute = false,
    executeButtonLabel,
    executeButtonCompact = false,
    nextRoute = "/scout-execute",
    allowBackNavigation = true,
    executeDisabled = false,
}: ScanConfirmScreenProps) => {
    const navigate = useNavigate();
    const { t } = useI18n();
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);
    const workflowPlans = useMemo(() => loadSelectedScanWorkflowPlans(), []);
    const isHeadDualScoutFlow = useMemo(() => isHeadDualScoutWorkflow(workflowPlans), [workflowPlans]);
    const [scanSession, setScanSession] = useState<ApiScanSessionDetail | null>(null);
    const [scanSessionLoadState, setScanSessionLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
    const [scanDirection, setScanDirection] = useState<"HEAD_TO_FOOT" | "FOOT_TO_HEAD">("HEAD_TO_FOOT");
    const [patientPosition, setPatientPosition] = useState("HFS");
    const [activeParamTab, setActiveParamTab] = useState<"main" | "extra">("main");
    const [dualScoutApAngle, setDualScoutApAngle] = useState<number>(0);
    const [dualScoutLatAngle, setDualScoutLatAngle] = useState<number>(90);
    const [dualScoutMa, setDualScoutMa] = useState<number | null>(null);
    const [dualScoutKv, setDualScoutKv] = useState<number | null>(null);
    const [dualScoutScanLength, setDualScoutScanLength] = useState<number | null>(null);
    const [editingDualField, setEditingDualField] = useState<"ma" | "kv" | "scanLength" | null>(null);

    // Data structure with sequences at the same level
    const [groups, setGroups] = useState<ProtocolGroup[]>([
                {
                    id: 'g1',
                    name: 'Head_FacialBoneVolume',
                    sequences: [
                { id: 's1', name: 'Scout', steps: [t("scanFlow.step.openLaserForPosition"), t("scanFlow.step.confirmParameters"), t("scanFlow.step.executeScan")] },
                { id: 's2', name: 'Helical Scan', steps: [t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")] }
            ]
        }
    ]);

    const [expandedSeqId, setExpandedSeqId] = useState<string | null>(null);
    const [checkedSeqIds, setCheckedSeqIds] = useState<string[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAbortConfirm, setShowAbortConfirm] = useState(false);
    const [abortError, setAbortError] = useState("");
    const [isAborting, setIsAborting] = useState(false);
    const abortActionIdRef = useRef<string | null>(null);
    const [showPatientConfirm, setShowPatientConfirm] = useState(false);
    const [laserActive, setLaserActive] = useState(false);
    const [scoutDoseDisplayParams, setScoutDoseDisplayParams] = useState<ScoutDoseDisplayParams>(DEFAULT_SCOUT_DOSE_PARAMS);
    const isFourDScoutWorkflow = forceFourDScoutWorkflow || scanSession?.acquisition_type === "four_d";
    const resolvedExtraParamSectionTitle = extraParamSectionTitle ?? t("scanFlow.gatingParams");
    const resolvedExecuteButtonLabel = executeButtonLabel ?? t("scanFlow.executeScan");

    const buildGroupsFromWorkflowPlans = useCallback((): ProtocolGroup[] => {
        if (workflowPlans.length === 0) {
            return [
                {
                    id: "g1",
                    name: "Head_FacialBoneVolume",
                    sequences: [
                        { id: "s1", name: "Scout", type: "scout", steps: buildSequenceSteps("scout", isFourDScoutWorkflow, t) },
                        { id: "s2", name: "Helical Scan", type: "helical", steps: buildSequenceSteps("helical", isFourDScoutWorkflow, t) },
                    ],
                },
            ];
        }

        return workflowPlans.map((plan) => {
            const effectivePlan = mergeDualScoutPlanSequences(plan);
            return {
                id: `group-${plan.id}`,
                name: plan.title,
                sequences: effectivePlan.sequences.map((sequence) => ({
                    id: `group-${plan.id}-seq-${sequence.id}`,
                    name: sequence.name,
                    type: sequence.type,
                    steps: buildSequenceSteps(sequence.type, isFourDScoutWorkflow, t),
                })),
            };
        });
    }, [isFourDScoutWorkflow, t, workflowPlans]);

    useEffect(() => {
        setGroups(buildGroupsFromWorkflowPlans());
    }, [buildGroupsFromWorkflowPlans]);

    const allSequences = useMemo(() => groups.flatMap((group) => group.sequences), [groups]);
    const firstScoutSequenceId = useMemo(
        () => allSequences.find((sequence) => inferSequenceType(sequence) === "scout")?.id ?? null,
        [allSequences]
    );
    const firstTomographicSequenceId = useMemo(
        () => allSequences.find((sequence) => inferSequenceType(sequence) !== "scout")?.id ?? null,
        [allSequences]
    );
    const resolvedActiveSequenceId = useMemo(() => {
        if (activeSequenceId && allSequences.some((sequence) => sequence.id === activeSequenceId)) {
            return activeSequenceId;
        }

        if (activeSequenceId === "s2") {
            return firstTomographicSequenceId ?? firstScoutSequenceId ?? allSequences[0]?.id ?? null;
        }

        return firstScoutSequenceId ?? allSequences[0]?.id ?? null;
    }, [activeSequenceId, allSequences, firstScoutSequenceId, firstTomographicSequenceId]);

    useEffect(() => {
        let cancelled = false;

        const loadScanSession = async () => {
            try {
                const currentScanSession = await fetchSelectedScanSession({ preferCache: false });
                if (!cancelled) {
                    setScanSession(currentScanSession);
                    setScanSessionLoadState("ready");
                }
            } catch (error) {
                console.error("Failed to load selected scan session.", error);
                if (!cancelled) setScanSessionLoadState("error");
            }
        };

        void loadScanSession();

        return () => {
            cancelled = true;
        };
    }, []);

    const dualScoutTopogramIds = useMemo(() => {
        if (!isHeadDualScoutFlow || !scanSession) return null;
        const topos = scanSession.series
            .filter((s) => s.series_type === "topogram" && s.topogram_param)
            .map((s) => s.topogram_param!);
        if (topos.length === 0) return null;
        return {
            apId: topos[0].id,
            latId: topos[1]?.id ?? null,
            apAngle: topos[0].tube_angle,
            latAngle: topos[1]?.tube_angle ?? 90,
            ma: topos[0].ma,
            kv: topos[0].kv,
            focusSize: topos[0].focus_size ?? "small",
            scanLength: topos[0].scan_length,
        };
    }, [isHeadDualScoutFlow, scanSession]);

    // Seed editable dual-scout fields from session once it loads.
    useEffect(() => {
        if (!dualScoutTopogramIds) return;
        setDualScoutMa((prev) => prev ?? dualScoutTopogramIds.ma);
        setDualScoutKv((prev) => prev ?? dualScoutTopogramIds.kv);
        setDualScoutScanLength((prev) => prev ?? dualScoutTopogramIds.scanLength);
        setDualScoutApAngle((prev) => (prev === 0 && dualScoutTopogramIds.apAngle !== 0 ? dualScoutTopogramIds.apAngle : prev));
        setDualScoutLatAngle((prev) => (prev === 90 && dualScoutTopogramIds.latAngle !== 90 ? dualScoutTopogramIds.latAngle : prev));
    }, [dualScoutTopogramIds]);

    const persistDualScoutPatch = useCallback(
        (patch: Partial<{ ma: number; kv: number; scan_length: number; tube_angle: number }>, target: "shared" | "ap" | "lat") => {
            if (!dualScoutTopogramIds) return;
            const writes: Promise<unknown>[] = [];
            const targetParamIds: number[] = [];
            if (target !== "lat") {
                writes.push(updateSelectedScanSessionTopogramParam(dualScoutTopogramIds.apId, patch));
                targetParamIds.push(dualScoutTopogramIds.apId);
            }
            if (target !== "ap" && dualScoutTopogramIds.latId != null) {
                writes.push(updateSelectedScanSessionTopogramParam(dualScoutTopogramIds.latId, patch));
                targetParamIds.push(dualScoutTopogramIds.latId);
            }
            const tubeAngle = parseTubeAngleOption(patch.tube_angle);
            if (tubeAngle !== null && targetParamIds.length > 0) {
                setScanSession((current) =>
                    current ? patchTopogramAngleInScanSession(current, targetParamIds, tubeAngle) : current
                );
            }
            Promise.all(writes).catch((error) => console.error("Failed to persist dual scout param.", error));
        },
        [dualScoutTopogramIds],
    );

    useEffect(() => {
        let isMounted = true;

        const importSnapshot = async () => {
            try {
                const response = await fetch("/db_business_4tables_for_ai.json");
                if (!response.ok) return;
                const snapshot = await response.json();
                if (!isMounted) return;
                await ensureBusinessSnapshotImported(snapshot);

                const protocolRows = snapshot?.tables?.protocol?.rows;
                if (!Array.isArray(protocolRows) || protocolRows.length === 0) return;

                const matchingProtocol =
                    protocolRows.find((row: { supportedModes?: string; doseCtdiVol?: number; doseDlp?: number }) =>
                        typeof row.supportedModes === "string" && row.supportedModes.includes("定位像")
                    ) ?? protocolRows[0];

                setScoutDoseDisplayParams({
                    doseCtdiVol: toDisplayValue(matchingProtocol?.doseCtdiVol, 2),
                    doseDlp: toDisplayValue(matchingProtocol?.doseDlp, 2),
                    notifyCtdiVol: toDisplayValue(matchingProtocol?.notifyCtdiVol, 2),
                    notifyDlp: toDisplayValue(matchingProtocol?.notifyDlp, 2),
                });
            } catch (error) {
                console.error("Failed to import protocol snapshot for scan confirm screen.", error);
            }
        };

        void importSnapshot();

        return () => {
            isMounted = false;
        };
    }, []);

    const dbProtocolCases = useLiveQuery(() => loadProtocolCasesFromDb(), [], []);
    const sessionProtocolCases = useMemo(() => mapScanSessionToProtocolCases(scanSession), [scanSession]);
    const effectiveProtocolCases = sessionProtocolCases ?? dbProtocolCases;
    const scoutDisplayParams = getScoutDisplayParams(effectiveProtocolCases);
    const tomographicScanDisplayParams = getTomographicScanDisplayParams(effectiveProtocolCases);
    const helicalScanDisplayParams = getHelicalScanDisplayParams(effectiveProtocolCases);
    const scoutDoseFromSession = useMemo(() => getScoutDoseDisplayParamsFromSession(scanSession), [scanSession]);
    const singleScoutTopogramParam = useMemo(
        () =>
            scanSession?.series.find((series) => series.series_type === "topogram" && series.topogram_param)
                ?.topogram_param ?? null,
        [scanSession],
    );
    const scoutAngleValue = toTubeAngleOption(scoutDisplayParams.angle, 270);
    const resolvedTomographicScanDisplayParams = {
        ...tomographicScanDisplayParams,
        ...tomographicParamOverrides,
    };
    const resolvedHelicalScanDisplayParams = {
        ...helicalScanDisplayParams,
        ...helicalParamOverrides,
    };
    const isTomographicMaLocked = Boolean(autoMaEnabled && onAutoMaEnabledChange);
    const isHelicalMaLocked = Boolean(autoMaEnabled && onAutoMaEnabledChange);
    const currentProtocolLabel =
        parameterPanelMode === "helicalScan"
            ? t("scanFlow.postScout.helical")
            : parameterPanelMode === "tomographicScan"
                ? t("scanFlow.postScout.axial")
                : t("scanFlow.scout");
    const currentProtocolName = workflowPlans[0]?.title ?? scanSession?.name ?? currentProtocolLabel;
    const currentSequenceName = allSequences.find((sequence) => sequence.id === resolvedActiveSequenceId)?.name ?? currentProtocolLabel;
    const currentDoseDisplayParams = parameterPanelMode === "helicalScan"
        ? resolvedHelicalScanDisplayParams
        : parameterPanelMode === "tomographicScan"
            ? resolvedTomographicScanDisplayParams
            : scoutDoseDisplayParams;
    const currentScanData = {
        ctdi: currentDoseDisplayParams.doseCtdiVol,
        dlp: currentDoseDisplayParams.doseDlp,
        protocol: currentProtocolName,
        sequence: currentSequenceName,
    };
    const handleScoutAngleChange = useCallback((nextAngle: TubeAngleOption) => {
        if (!singleScoutTopogramParam) return;
        const previousAngle = toTubeAngleOption(singleScoutTopogramParam.tube_angle, scoutAngleValue);
        const paramId = singleScoutTopogramParam.id;

        setScanSession((current) =>
            current ? patchTopogramAngleInScanSession(current, [paramId], nextAngle) : current
        );
        onScoutAngleChange?.(nextAngle);

        updateSelectedScanSessionTopogramParam(paramId, { tube_angle: nextAngle })
            .then(() => fetchSelectedScanSession({ preferCache: false }))
            .then((updatedSession) => {
                if (updatedSession) setScanSession(updatedSession);
            })
            .catch((error) => {
                console.error("Failed to persist scout angle.", error);
                setScanSession((current) =>
                    current ? patchTopogramAngleInScanSession(current, [paramId], previousAngle) : current
                );
                onScoutAngleChange?.(previousAngle);
            });
    }, [onScoutAngleChange, scoutAngleValue, singleScoutTopogramParam]);

    const renderScoutAngleSelectCard = (label: string) => (
        <label className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode || !singleScoutTopogramParam ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
            <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{label}</span>
            <div className="relative mt-[1px] w-full">
                <select
                    value={String(scoutAngleValue)}
                    disabled={readOnlyMode || !singleScoutTopogramParam}
                    onChange={(event) => handleScoutAngleChange(toTubeAngleOption(event.target.value, scoutAngleValue))}
                    className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none disabled:cursor-default"
                >
                    {TUBE_ANGLE_OPTIONS.map((angle) => (
                        <option key={angle} value={String(angle)}>{`${angle}\u00b0`}</option>
                    ))}
                </select>
                <ChevronDown size={9} className={`pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
            </div>
        </label>
    );
    const handleOpenDetails = () => {
        const detailTarget = parameterPanelMode === "helicalScan"
            ? "helical"
            : parameterPanelMode === "tomographicScan"
                ? "axial"
                : "topogram";
        localStorage.setItem(DETAIL_TARGET_STORAGE_KEY, detailTarget);
        navigate("/protocol-detail");
    };

    const handlePatientPositionChange = useCallback((position: string) => {
        setPatientPosition(position);
        if (readOnlyMode) return;

        void updateSelectedScanSession({ patient_position: position })
            .then((updatedSession) => setScanSession(updatedSession))
            .catch((error) => console.error("Failed to persist patient position.", error));
    }, [readOnlyMode]);

    useEffect(() => {
        if (scoutDoseFromSession) {
            setScoutDoseDisplayParams(scoutDoseFromSession);
        }
    }, [scoutDoseFromSession]);

    useEffect(() => {
        const resolvedPosition = parameterPanelMode === "tomographicScan"
            ? resolvedTomographicScanDisplayParams.position
            : parameterPanelMode === "helicalScan"
                ? resolvedHelicalScanDisplayParams.position
                : scoutDisplayParams.position;
        if (resolvedPosition !== "--") {
            setPatientPosition(resolvedPosition);
        }
    }, [parameterPanelMode, scoutDisplayParams.position, resolvedTomographicScanDisplayParams.position, resolvedHelicalScanDisplayParams.position]);

    useEffect(() => {
        const direction = parameterPanelMode === "helicalScan"
            ? resolvedHelicalScanDisplayParams.scanningDirection
            : parameterPanelMode === "tomographicScan"
                ? resolvedTomographicScanDisplayParams.scanningDirection
                : scoutDisplayParams.scanningDirection;
        if (direction === "HEAD_TO_FOOT" || direction === "FOOT_TO_HEAD") {
            setScanDirection(direction);
        }
    }, [
        parameterPanelMode,
        scoutDisplayParams.scanningDirection,
        resolvedTomographicScanDisplayParams.scanningDirection,
        resolvedHelicalScanDisplayParams.scanningDirection,
    ]);

    useEffect(() => {
        setExpandedSeqId(resolvedActiveSequenceId);
    }, [resolvedActiveSequenceId]);

    const toggleCheck = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setCheckedSeqIds(prev => {
            const next = new Set(prev);

            // Check if it's a group
            const group = groups.find(g => g.id === id);
            if (group) {
                const childIds = group.sequences.map(s => s.id);
                const allSelected = childIds.every(cid => next.has(cid));

                if (allSelected) {
                    childIds.forEach(cid => next.delete(cid));
                } else {
                    childIds.forEach(cid => next.add(cid));
                }
            } else {
                // It's a sequence
                if (next.has(id)) next.delete(id);
                else next.add(id);
            }
            return Array.from(next);
        });
    };

    const handleDeleteClick = () => {
        if (checkedSeqIds.length === 0) return;
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = () => {
        setGroups(prev => prev
            .map(g => ({ ...g, sequences: g.sequences.filter(s => !checkedSeqIds.includes(s.id)) }))
            .filter(g => g.sequences.length > 0)
        );
        setCheckedSeqIds([]);
        setShowDeleteConfirm(false);
    };
    const hasStartedSeriesExecution = scanSession?.series.some(
        (series) => series.execution_status !== "pending"
    ) ?? false;
    const canReturnToScoutPositioning =
        !readOnlyMode &&
        allowBackNavigation &&
        scanSessionLoadState === "ready" &&
        (scanSession?.series.some((series) => series.series_type === "topogram") ?? false) &&
        !(scanSession?.series.some(
            (series) => series.series_type !== "topogram" && series.execution_status !== "pending"
        ) ?? false);
    const canNavigateBackToProtocol =
        !readOnlyMode &&
        allowBackNavigation &&
        scanSessionLoadState === "ready" &&
        !canReturnToScoutPositioning &&
        !hasStartedSeriesExecution;
    const canNavigateBack = canNavigateBackToProtocol || canReturnToScoutPositioning;
    const previousStepTitle = scanSessionLoadState === "error"
        ? t("scanFlow.backStateUnavailable")
        : !canNavigateBack && scanSessionLoadState !== "loading"
            ? t("scanFlow.backBlockedAfterAcquisition")
            : undefined;
    const handlePreviousStep = useCallback(() => {
        if (canNavigateBackToProtocol) {
            navigate("/protocol-select");
            return;
        }
        if (canReturnToScoutPositioning) navigate("/scout-scan");
    }, [canNavigateBackToProtocol, canReturnToScoutPositioning, navigate]);

    return (
        <div className={`flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative text-[#37474F] font-sans select-none ${readOnlyMode ? "scan-confirm-read-only" : ""}`}>
            {readOnlyMode && (
                <style>{`.scan-confirm-read-only select { pointer-events: none; } .scan-confirm-read-only .cursor-pointer { cursor: default !important; }`}</style>
            )}

            {/* 1. Header (System Info) */}
            <AppHeader
                patientName={selectedPatient?.name ?? null}
                patientId={selectedPatient?.patientId ?? null}
                laserActive={laserActive}
                onLaserToggle={() => setLaserActive((prev) => !prev)}
            />

            {/* 2. Main Content Area */}
            <main className="flex-1 flex overflow-hidden p-[2px] gap-1">
                {/* Left Sidebar Card */}
                <aside className="w-[240px] bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden shrink-0">
                    {/* Sidebar Toolbar - Precise match to screenshot */}
                    <div className="h-[48px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-3 shrink-0">
                        <div className="flex items-center gap-2">
                            <button className="p-1.5 text-[#546E7A] hover:bg-[#EEF2F9] rounded transition-all"><FilePlus size={18} /></button>
                            <button
                                onClick={handleDeleteClick}
                                className={`p-1.5 rounded transition-all relative ${checkedSeqIds.length > 0
                                    ? 'text-[#D32F2F] hover:bg-[#FFEBEE]'
                                    : 'text-[#90A4AE] opacity-40 cursor-not-allowed'
                                    }`}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <button
                            onClick={() => setIsTreeCollapsed(!isTreeCollapsed)}
                            className="p-1.5 text-[#4D94FF] hover:bg-[#EEF2F9] rounded transition-all"
                        >
                            {isTreeCollapsed ? <ChevronDown size={20} /> : <ChevronsUp size={20} />}
                        </button>
                    </div>

                    {/* Protocol Tree Summary - Fixed Hierarchy */}
                    <div className={`overflow-y-auto p-2 flex flex-col gap-0 transition-all duration-300 ${isTreeCollapsed ? 'h-[48px] opacity-40 grayscale overflow-hidden' : 'h-[240px]'}`}>
                        {groups.map(group => (
                            <div key={group.id} className="flex flex-col">
                                <div
                                    onClick={(e) => toggleCheck(group.id, e as React.MouseEvent)}
                                    className="flex items-center gap-2 px-2 py-1.5 text-[#37474F] cursor-pointer hover:bg-[#EEF2F9] rounded-md transition-all"
                                >
                                    <ChevronDown size={14} className="opacity-40" />
                                    <div
                                        onClick={(e) => toggleCheck(group.id, e as React.MouseEvent)}
                                        className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${group.sequences.every(s => checkedSeqIds.includes(s.id))
                                            ? 'bg-[#4D94FF] border-[#4D94FF]'
                                            : 'bg-white border-[#B0C4DE]'
                                            }`}
                                    >
                                        {group.sequences.every(s => checkedSeqIds.includes(s.id)) && <Check size={9} className="text-white stroke-[3]" />}
                                    </div>
                                    <span className={`text-[13px] font-bold truncate transition-all ${group.sequences.every(s => checkedSeqIds.includes(s.id)) ? 'text-[#4D94FF]' : 'text-[#37474F]'
                                        }`}>{group.name}</span>
                                </div>
                                <div className="flex flex-col">
                                    {group.sequences.map(seq => {
                                        const isExpanded = expandedSeqId === seq.id;
                                        const isActive = seq.id === resolvedActiveSequenceId;

                                        return (
                                            <div key={seq.id} className="mb-1">
                                                <div
                                                    onClick={() => setExpandedSeqId(isExpanded ? null : seq.id)}
                                                    className={`flex items-center gap-2 px-3 rounded-lg mb-1 transition-all relative cursor-pointer border ${seq.name === 'Scout' || seq.name === 'Helical Scan' ? 'h-[28px]' : 'py-2.5'} ${isActive
                                                        ? 'bg-[#4D94FF] border-[#4D94FF] text-white shadow-md'
                                                        : (checkedSeqIds.includes(seq.id) ? 'bg-[#E3F2FD] border-[#4D94FF]/30 text-[#4D94FF]' : 'bg-transparent border-transparent text-[#546E7A] hover:bg-[#EEF2F9]')
                                                        }`}
                                                >
                                                    {isExpanded ? <ChevronDown size={14} className={checkedSeqIds.includes(seq.id) ? 'text-[#4D94FF]/60' : isActive ? "text-white/70" : "text-gray-400"} /> : <ChevronRight size={14} className={checkedSeqIds.includes(seq.id) ? 'text-[#4D94FF]/60' : isActive ? "text-white/70" : "text-gray-400"} />}

                                                    {/* Checkbox */}
                                                    <div
                                                        onClick={(e) => toggleCheck(seq.id, e)}
                                                        className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checkedSeqIds.includes(seq.id)
                                                            ? (isActive ? 'bg-white border-white/30' : 'bg-[#4D94FF] border-[#4D94FF]')
                                                            : (isActive ? 'bg-white/20 border-white/30' : 'bg-white border-[#B0C4DE]')
                                                            }`}
                                                    >
                                                        {checkedSeqIds.includes(seq.id) && <Check size={9} className={`${isActive ? 'text-[#4D94FF]' : 'text-white'} stroke-[3]`} />}
                                                    </div>

                                                    <span className="text-[13px] font-bold">{seq.name}</span>
                                                </div>

                                                {/* Toggleable Workflow Steps */}
                                                {isExpanded && seq.steps && seq.steps.length > 0 && (
                                                    <div className="flex flex-col ml-12 mt-2 gap-4 relative pb-4">
                                                        {/* Connector Line */}
                                                        <div className="absolute left-[7px] top-2 bottom-6 w-[1px] bg-[#B0C4DE]"></div>

                                                        {seq.steps.map((step, idx) => {
                                                            const isActiveSequence = seq.id === resolvedActiveSequenceId;
                                                            const resolvedStepIndex = inferSequenceType(seq) === "scout"
                                                                ? activeScoutStepIndex
                                                                : (activeSequenceStepIndex ?? 0);
                                                            const isStepCompleted = isActiveSequence && idx < resolvedStepIndex;
                                                            const isStepInProgress = isActiveSequence && idx === resolvedStepIndex;

                                                            return (
                                                                <div key={idx} className="flex items-center gap-3 z-10">
                                                                    {isStepCompleted ? (
                                                                        <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                                                                            <CheckCircle size={16} className="text-[#66BB6A]" />
                                                                        </div>
                                                                    ) : isStepInProgress ? (
                                                                        <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-[#4D94FF] translate-x-[1px] shadow-[0_0_8px_rgba(77,148,255,0.3)]"></div>
                                                                    ) : (
                                                                        <div className="w-3.5 h-3.5 rounded-full bg-white border border-[#B0C4DE] translate-x-[1px]"></div>
                                                                    )}
                                                                    <span className={`text-[12px] font-bold ${isStepInProgress ? 'text-[#37474F]' : 'text-[#37474F]/60'}`}>
                                                                        {step}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* New Parameter Confirmation Area */}
                    <div className="flex-1 border-t border-[#EEF2F9] bg-[#F8FAFC] flex flex-col overflow-hidden">
                        <div className="hidden">
                            <div className="grid grid-cols-2 gap-2">
                                <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                    <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.positioning.scanDirection")}</span>
                                    <div className="relative w-full">
                                        <select
                                            value={scanDirection}
                                            onChange={(event) => setScanDirection(event.target.value as "HEAD_TO_FOOT" | "FOOT_TO_HEAD")}
                                            disabled={readOnlyMode}
                                            className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                        >
                                            <option value="HEAD_TO_FOOT">{t("scanFlow.positioning.headToFoot")}</option>
                                            <option value="FOOT_TO_HEAD">{t("scanFlow.positioning.footToHead")}</option>
                                        </select>
                                        <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                    </div>
                                </label>
                                <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                    <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.patientPosition")}</span>
                                    <div className="relative w-full">
                                        <select
                                            value={patientPosition}
                                            onChange={(event) => handlePatientPositionChange(event.target.value)}
                                            disabled={readOnlyMode}
                                            className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                        >
                                            <option value="HFS">HFS</option>
                                            <option value="FFS">FFS</option>
                                            <option value="HFP">HFP</option>
                                            <option value="FFP">FFP</option>
                                            <option value="HFDR">HFDR</option>
                                            <option value="FFDR">FFDR</option>
                                            <option value="HFDL">HFDL</option>
                                            <option value="FFDL">FFDL</option>
                                        </select>
                                        <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                    </div>
                                </label>
                            </div>
                        </div>
                        {/* 机架扫描方向 */}
                        <div className="hidden">
                            <div className="flex w-full h-[36px] bg-white border border-[#B0C4DE] rounded-sm overflow-hidden p-[2px]">
                                <button
                                    onClick={() => setScanDirection("HEAD_TO_FOOT")}
                                    className={`flex-1 flex items-center justify-center text-[12px] font-bold rounded-sm transition-all ${scanDirection === "HEAD_TO_FOOT" ? 'bg-[#4D94FF] text-white shadow-inner' : 'text-[#90A4AE] hover:bg-gray-50'}`}
                                >
                                    {t("scanFlow.positioning.headToFoot")}
                                </button>
                                <button
                                    onClick={() => setScanDirection("FOOT_TO_HEAD")}
                                    className={`flex-1 flex items-center justify-center text-[12px] font-bold rounded-sm transition-all ${scanDirection === "FOOT_TO_HEAD" ? 'bg-[#4D94FF] text-white shadow-inner' : 'text-[#90A4AE] hover:bg-gray-50'}`}
                                >
                                    {t("scanFlow.positioning.footToHead")}
                                </button>
                            </div>
                        </div>

                        {extraParamSection && (
                            <div className="px-2 pt-1.5 shrink-0">
                                <div className="flex w-full rounded-md border border-[#B0C4DE] bg-white overflow-hidden p-[2px]">
                                    <button
                                        type="button"
                                        onClick={() => setActiveParamTab("main")}
                                        className={`flex-1 h-[24px] text-[11px] font-bold rounded-sm transition-all ${
                                            activeParamTab === "main"
                                                ? "bg-[#4D94FF] text-white shadow-inner"
                                                : "text-[#90A4AE] hover:bg-gray-50"
                                        }`}
                                    >
                                        {t("scanFlow.scanParameters")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveParamTab("extra")}
                                        className={`flex-1 h-[24px] text-[11px] font-bold rounded-sm transition-all ${
                                            activeParamTab === "extra"
                                                ? "bg-[#4D94FF] text-white shadow-inner"
                                                : "text-[#90A4AE] hover:bg-gray-50"
                                        }`}
                                    >
                                        {resolvedExtraParamSectionTitle}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Reorganized Parameter Grid - 2 Column Layout */}
                        <div className={`flex-1 p-2 pt-2 flex flex-col gap-2 overflow-y-auto ${extraParamSection && activeParamTab !== "main" ? "hidden" : ""}`}>
                            {parameterPanelMode === "tomographicScan" ? (
                                <div className="grid grid-cols-2 gap-2">
                                     {onAutoMaEnabledChange && (
                                        <div
                                            className={`col-span-2 p-1.5 px-2.5 bg-white border rounded-md shadow-sm flex items-center justify-between transition-colors ${
                                                autoMaEnabled ? "border-[#4D94FF]/60" : "border-[#B0C4DE]/40"
                                            }`}
                                        >
                                            <span className="text-[10px] font-black text-[#37474F] uppercase tracking-tighter">{t("scanFlow.smartDoseModulation")}</span>
                                            <button
                                                type="button"
                                                onClick={() => onAutoMaEnabledChange(!autoMaEnabled)}
                                                className={`relative inline-flex h-[18px] w-[32px] items-center rounded-full transition-colors ${
                                                    autoMaEnabled ? "bg-[#2563EB]" : "bg-[#CBD5E1]"
                                                }`}
                                            >
                                                <span
                                                    className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                                                        autoMaEnabled ? "translate-x-[16px]" : "translate-x-[2px]"
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    )}
                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.positioning.scanDirection")}</span>
                                        <div className="relative w-full">
                                            <select
                                                value={scanDirection}
                                                onChange={(event) => setScanDirection(event.target.value as "HEAD_TO_FOOT" | "FOOT_TO_HEAD")}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="HEAD_TO_FOOT">{t("scanFlow.positioning.headToFoot")}</option>
                                                <option value="FOOT_TO_HEAD">{t("scanFlow.positioning.footToHead")}</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.patientPosition")}</span>
                                        <div className="relative w-full">
                                            <select
                                                value={patientPosition}
                                                onChange={(event) => handlePatientPositionChange(event.target.value)}
                                                disabled={readOnlyMode}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="HFS">HFS</option>
                                                <option value="FFS">FFS</option>
                                                <option value="HFP">HFP</option>
                                                <option value="FFP">FFP</option>
                                                <option value="HFDR">HFDR</option>
                                                <option value="FFDR">FFDR</option>
                                                <option value="HFDL">HFDL</option>
                                                <option value="FFDL">FFDL</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.scanLength")}</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedTomographicScanDisplayParams.scanLength}</span>
                                    </div>

                                     <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.rotationTime")}</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedTomographicScanDisplayParams.rotationTime}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div
                                        aria-disabled={isTomographicMaLocked}
                                        title={isTomographicMaLocked ? t("scanFlow.lockedMaTitle") : undefined}
                                        className={`p-1.5 bg-white border rounded-md flex flex-col items-center justify-center shadow-sm group transition-colors ${
                                            isTomographicMaLocked
                                                ? "border-[#CBD5E1]/60 opacity-60 cursor-not-allowed"
                                                : readOnlyMode
                                                    ? "border-[#B0C4DE]/40 cursor-default"
                                                    : "border-[#B0C4DE]/40 hover:border-[#4D94FF] cursor-pointer"
                                        }`}
                                    >
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">mA</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedTomographicScanDisplayParams.mA}</span>
                                            {!isTomographicMaLocked && (
                                                <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                            )}
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">KV</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedTomographicScanDisplayParams.kV}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>



                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.cycleCount")}</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedTomographicScanDisplayParams.cycleCount}</span>
                                    </div>
                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">FOV</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedTomographicScanDisplayParams.scoutFov}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    {renderScoutAngleSelectCard(t("scanFlow.flatScanAngle"))}



                                    <div className="col-span-2 mt-1 rounded-md border border-[#FDE68A]/80 bg-[#FFFBEB] px-3 py-2 flex items-center justify-around">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-black text-[#B45309] uppercase tracking-tighter">CTDIvol (mGy)</span>
                                            <span className="text-[15px] font-black text-[#B45309] mt-[2px]">{resolvedTomographicScanDisplayParams.doseCtdiVol}</span>
                                        </div>
                                        <div className="w-px h-6 bg-[#FDE68A]" />
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-black text-[#B45309] uppercase tracking-tighter">DLP (mGy·cm)</span>
                                            <span className="text-[15px] font-black text-[#B45309] mt-[2px]">{resolvedTomographicScanDisplayParams.doseDlp}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : parameterPanelMode === "helicalScan" ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {onAutoMaEnabledChange && (
                                        <div
                                            className={`col-span-2 p-1.5 px-2.5 bg-white border rounded-md shadow-sm flex items-center justify-between transition-colors ${
                                                autoMaEnabled ? "border-[#4D94FF]/60" : "border-[#B0C4DE]/40"
                                            }`}
                                        >
                                            <span className="text-[10px] font-black text-[#37474F] uppercase tracking-tighter">{t("scanFlow.smartDoseModulation")}</span>
                                            <button
                                                type="button"
                                                onClick={() => onAutoMaEnabledChange(!autoMaEnabled)}
                                                className={`relative inline-flex h-[18px] w-[32px] items-center rounded-full transition-colors ${
                                                    autoMaEnabled ? "bg-[#2563EB]" : "bg-[#CBD5E1]"
                                                }`}
                                            >
                                                <span
                                                    className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                                                        autoMaEnabled ? "translate-x-[16px]" : "translate-x-[2px]"
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    )}
                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.positioning.scanDirection")}</span>
                                        <div className="relative w-full">
                                            <select
                                                value={scanDirection}
                                                onChange={(event) => setScanDirection(event.target.value as "HEAD_TO_FOOT" | "FOOT_TO_HEAD")}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="HEAD_TO_FOOT">{t("scanFlow.positioning.headToFoot")}</option>
                                                <option value="FOOT_TO_HEAD">{t("scanFlow.positioning.footToHead")}</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.patientPosition")}</span>
                                        <div className="relative w-full">
                                            <select
                                                value={patientPosition}
                                                onChange={(event) => handlePatientPositionChange(event.target.value)}
                                                disabled={readOnlyMode}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="HFS">HFS</option>
                                                <option value="FFS">FFS</option>
                                                <option value="HFP">HFP</option>
                                                <option value="FFP">FFP</option>
                                                <option value="HFDR">HFDR</option>
                                                <option value="FFDR">FFDR</option>
                                                <option value="HFDL">HFDL</option>
                                                <option value="FFDL">FFDL</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.scanLength")}</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedHelicalScanDisplayParams.scanLength}</span>
                                    </div>

                                    <div
                                        aria-disabled={isHelicalMaLocked}
                                        title={isHelicalMaLocked ? t("scanFlow.lockedMaTitle") : undefined}
                                        className={`p-1.5 bg-white border rounded-md flex flex-col items-center justify-center shadow-sm group transition-colors ${
                                            isHelicalMaLocked
                                                ? "border-[#CBD5E1]/60 opacity-60 cursor-not-allowed"
                                                : readOnlyMode
                                                    ? "border-[#B0C4DE]/40 cursor-default"
                                                    : "border-[#B0C4DE]/40 hover:border-[#4D94FF] cursor-pointer"
                                        }`}
                                    >
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">mA</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedHelicalScanDisplayParams.mA}</span>
                                            {!isHelicalMaLocked && (
                                                <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                            )}
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">KV</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedHelicalScanDisplayParams.kV}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.rotationTime")}</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedHelicalScanDisplayParams.rotationTime}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">Pitch</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedHelicalScanDisplayParams.pitch}</span>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">FOV</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedHelicalScanDisplayParams.scoutFov}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    {renderScoutAngleSelectCard(t("scanFlow.flatScanAngle"))}

                                    <div className="col-span-2 mt-1 rounded-md border border-[#FDE68A]/80 bg-[#FFFBEB] px-3 py-2 flex items-center justify-around">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-black text-[#B45309] uppercase tracking-tighter">CTDIvol (mGy)</span>
                                            <span className="text-[15px] font-black text-[#B45309] mt-[2px]">{resolvedHelicalScanDisplayParams.doseCtdiVol}</span>
                                        </div>
                                        <div className="w-px h-6 bg-[#FDE68A]" />
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-black text-[#B45309] uppercase tracking-tighter">DLP (mGy·cm)</span>
                                            <span className="text-[15px] font-black text-[#B45309] mt-[2px]">{resolvedHelicalScanDisplayParams.doseDlp}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.positioning.scanDirection")}</span>
                                        <div className="relative w-full">
                                            <select
                                                value={scanDirection}
                                                onChange={(event) => setScanDirection(event.target.value as "HEAD_TO_FOOT" | "FOOT_TO_HEAD")}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="HEAD_TO_FOOT">{t("scanFlow.positioning.headToFoot")}</option>
                                                <option value="FOOT_TO_HEAD">{t("scanFlow.positioning.footToHead")}</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.patientPosition")}</span>
                                        <div className="relative w-full">
                                            <select
                                                value={patientPosition}
                                                onChange={(event) => handlePatientPositionChange(event.target.value)}
                                                disabled={readOnlyMode}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="HFS">HFS</option>
                                                <option value="FFS">FFS</option>
                                                <option value="HFP">HFP</option>
                                                <option value="FFP">FFP</option>
                                                <option value="HFDR">HFDR</option>
                                                <option value="FFDR">FFDR</option>
                                                <option value="HFDL">HFDL</option>
                                                <option value="FFDL">FFDL</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    {(["scanLength", "ma", "kv"] as const).map((field) => {
                                        const isDual = isHeadDualScoutFlow;
                                        const labelMap = { scanLength: t("scanFlow.scanLength"), ma: "mA", kv: "KV" };
                                        const dualValueMap = {
                                            scanLength: dualScoutScanLength,
                                            ma: dualScoutMa,
                                            kv: dualScoutKv,
                                        };
                                        const dualSetterMap = {
                                            scanLength: setDualScoutScanLength,
                                            ma: setDualScoutMa,
                                            kv: setDualScoutKv,
                                        };
                                        const fallbackMap = {
                                            scanLength: scoutDisplayParams.scanLength,
                                            ma: scoutDisplayParams.mA,
                                            kv: scoutDisplayParams.kV,
                                        };
                                        const persistKeyMap = {
                                            scanLength: "scan_length" as const,
                                            ma: "ma" as const,
                                            kv: "kv" as const,
                                        };
                                        const dualValue = dualValueMap[field];
                                        const setDualValue = dualSetterMap[field];
                                        const isEditing = isDual && editingDualField === field;
                                        const editable = isDual && !readOnlyMode;
                                        return (
                                            <div
                                                key={field}
                                                onClick={() => editable && setEditingDualField(field)}
                                                className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm ${editable ? "group hover:border-[#4D94FF] cursor-pointer" : ""} ${isEditing ? "border-[#4D94FF] bg-[#EAF3FF]" : ""}`}
                                            >
                                                <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{labelMap[field]}</span>
                                                <div className="flex items-center gap-1 mt-[1px]">
                                                    {isDual ? (
                                                        isEditing ? (
                                                            <input
                                                                autoFocus
                                                                type="number"
                                                                min={field === "ma" ? 1 : undefined}
                                                                max={field === "ma" ? getMaLimit(dualScoutKv ?? dualScoutTopogramIds?.kv ?? 120, dualScoutTopogramIds?.focusSize) : undefined}
                                                                value={dualValue ?? ""}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={(e) => {
                                                                    const v = Number(e.target.value);
                                                                    if (!Number.isFinite(v)) return;
                                                                    if (field === "ma") {
                                                                        setDualScoutMa(clampMa(v, dualScoutKv ?? dualScoutTopogramIds?.kv ?? 120, dualScoutTopogramIds?.focusSize));
                                                                    } else if (field === "kv") {
                                                                        setDualScoutKv(v);
                                                                        setDualScoutMa((current) => current === null ? current : clampMa(current, v, dualScoutTopogramIds?.focusSize));
                                                                    } else {
                                                                        setDualValue(v);
                                                                    }
                                                                }}
                                                                onBlur={() => {
                                                                    setEditingDualField(null);
                                                                    if (dualValue == null) return;
                                                                    const patch = field === "kv"
                                                                        ? { kv: dualValue, ma: clampMa(dualScoutMa ?? dualScoutTopogramIds?.ma ?? 1, dualValue, dualScoutTopogramIds?.focusSize) }
                                                                        : { [persistKeyMap[field]]: dualValue };
                                                                    persistDualScoutPatch(patch, "shared");
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter" || e.key === "Escape") (e.currentTarget as HTMLInputElement).blur();
                                                                }}
                                                                className="w-[44px] text-[13px] font-black text-[#37474F] bg-transparent outline-none text-center"
                                                            />
                                                        ) : (
                                                            <>
                                                                <span className="text-[13px] font-black text-[#37474F]">{dualValue ?? "--"}</span>
                                                                <ChevronDown size={9} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
                                                            </>
                                                        )
                                                    ) : (
                                                        <>
                                                            <span className={`text-[13px] font-black ${field === "scanLength" ? "text-[#B0BEC5]" : "text-[#37474F]"}`}>{fallbackMap[field]}</span>
                                                            {field !== "scanLength" && <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {isHeadDualScoutFlow ? (
                                        <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                            <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.flatScanAngle")}</span>
                                            <div className="flex items-center gap-1 mt-[1px]">
                                                {(["ap", "lat"] as const).map((side, idx) => {
                                                    const value = side === "ap" ? dualScoutApAngle : dualScoutLatAngle;
                                                    const setValue = side === "ap" ? setDualScoutApAngle : setDualScoutLatAngle;
                                                    const angleValue = toTubeAngleOption(value, side === "ap" ? 0 : 90);
                                                    return (
                                                        <div key={side} className="flex items-center">
                                                            {idx > 0 && <span className="text-[#B0BEC5] mx-1 text-[11px]">/</span>}
                                                            <label
                                                                className={`flex items-center gap-0.5 px-1 py-[1px] rounded border border-transparent ${readOnlyMode ? "cursor-default" : "cursor-pointer hover:border-[#4D94FF]"}`}
                                                            >
                                                                <span className="text-[8px] font-bold text-[#90A4AE] uppercase">{side === "ap" ? "AP" : "LAT"}</span>
                                                                <div className="relative flex items-center">
                                                                    <select
                                                                        value={String(angleValue)}
                                                                        disabled={readOnlyMode}
                                                                        onChange={(event) => {
                                                                            const nextAngle = toTubeAngleOption(event.target.value, angleValue);
                                                                            setValue(nextAngle);
                                                                            persistDualScoutPatch({ tube_angle: nextAngle }, side);
                                                                        }}
                                                                        className="h-[18px] w-[40px] appearance-none bg-transparent pr-2 text-center text-[12px] font-black text-[#37474F] outline-none disabled:cursor-default"
                                                                    >
                                                                        {TUBE_ANGLE_OPTIONS.map((angle) => (
                                                                            <option key={angle} value={String(angle)}>{`${angle}\u00b0`}</option>
                                                                        ))}
                                                                    </select>
                                                                    <ChevronDown size={8} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                                                </div>
                                                            </label>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        renderScoutAngleSelectCard(t("scanFlow.flatScanAngle"))
                                    )}

                                    <div className="p-1.5 bg-[#FFFBEB] border border-[#FDE68A]/80 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#B45309] uppercase tracking-tighter">CTDIvol</span>
                                        <span className="text-[13px] font-black text-[#B45309] mt-[1px]">
                                            {scoutDoseDisplayParams.doseCtdiVol}
                                        </span>
                                    </div>

                                    <div className="p-1.5 bg-[#FFFBEB] border border-[#FDE68A]/80 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#B45309] uppercase tracking-tighter">DLP</span>
                                        <span className="text-[13px] font-black text-[#B45309] mt-[1px]">
                                            {scoutDoseDisplayParams.doseDlp}
                                        </span>
                                    </div>

                                    <div className="hidden">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <StretchHorizontal size={14} className="text-[#4D94FF]" />
                                            <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{t("scanFlow.patientPosition")}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[14px] font-black text-[#37474F]">{scoutDisplayParams.position}</span>
                                            <ChevronDown size={12} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {extraParamSection && activeParamTab === "extra" && (
                            <div className="flex-1 p-2 pt-2 flex flex-col gap-2 overflow-y-auto">
                                {extraParamSection}
                            </div>
                        )}

                        {/* Details Button */}
                        <div className="p-2 flex justify-center shrink-0">
                            <button onClick={handleOpenDetails} disabled={readOnlyMode} className={`h-[32px] w-full rounded-md text-[10px] font-bold flex items-center justify-center gap-1 border shadow-sm transition-all ${readOnlyMode ? "bg-[#F1F5F9] border-[#CBD5E1] text-[#94A3B8] cursor-not-allowed" : "bg-white border-[#B0C4DE] text-[#4D94FF] hover:bg-blue-50 active:scale-95"}`}>
                                <Info size={14} /> {t("scanFlow.parameterDetails")}
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Right Viewport Card */}
                <section className={rightViewportClassName ?? "flex-1 bg-[#1A222B] rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden relative"}>
                    {rightViewportContent ?? (
                        <div className="flex-1 flex items-center justify-center overflow-hidden">
                            <div className="w-full h-full opacity-10 bg-gradient-to-br from-blue-900/40 to-transparent flex items-center justify-center text-[#546E7A] uppercase font-thin text-[52px] tracking-[16px]">
                                Viewport
                            </div>
                        </div>
                    )}
                </section>
            </main>

            {/* 3. Footer (Nav Buttons) */}
            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1">
                    <button
                        onClick={handlePreviousStep}
                        disabled={!canNavigateBack}
                        title={previousStepTitle}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md border-2 shadow-sm transition-all uppercase text-[13px] ${!canNavigateBack ? "bg-[#F8FAFC] text-[#94A3B8] border-[#CBD5E1] cursor-not-allowed" : "bg-white text-[#4D94FF] border-[#4D94FF] hover:bg-solid active:scale-95"}`}
                    >
                        <ChevronLeft size={20} /> {t("common.previousStep")}
                    </button>
                </div>
                <div className="flex-1 flex justify-center">
                    <button
                        onClick={() => {
                            setAbortError("");
                            setShowAbortConfirm(true);
                        }}
                        disabled={readOnlyMode}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md border-2 transition-all uppercase text-[13px] shadow-sm ${readOnlyMode ? "bg-[#F8FAFC] text-[#94A3B8] border-[#CBD5E1] cursor-not-allowed" : "bg-white text-[#F57C00] border-[#F57C00] hover:bg-orange-50 active:scale-95"}`}>
                        <AlertTriangle size={20} /> {t("scanFlow.abortExam")}
                    </button>
                </div>
                <div className="flex-1 flex justify-end">
                    <button
                        onClick={() => {
                            if (onExecuteScan) {
                                if (patientConfirmBeforeExecute) {
                                    setShowPatientConfirm(true);
                                    return;
                                }
                                onExecuteScan();
                                return;
                            }
                            if (nextRoute === "/scout-execute") {
                                navigate(nextRoute, { state: { showCombinedPatientConfirm: true, returnRoute: "/scan-confirm" } });
                                return;
                            }
                            setShowPatientConfirm(true);
                        }}
                        disabled={(readOnlyMode && !onExecuteScan) || executeDisabled}
                        className={`flex items-center justify-center rounded-md font-bold uppercase transition-all ${executeButtonCompact ? "h-[46px] w-[236px] gap-1.5 px-4 text-center text-[11px] leading-[1.15]" : "h-[52px] gap-2 px-10 text-[13px]"} ${(readOnlyMode && !onExecuteScan) || executeDisabled ? "bg-[#CBD5E1] text-white cursor-not-allowed shadow-none" : "bg-[#4D94FF] text-white shadow-lg hover:bg-blue-600 active:scale-95"}`}
                    >
                        <span className={executeButtonCompact ? "min-w-0 whitespace-normal" : undefined}>{resolvedExecuteButtonLabel}</span>
                        <ChevronRight size={executeButtonCompact ? 16 : 20} className="shrink-0" />
                    </button>
                </div>
            </footer>

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#B0C4DE] w-[340px] overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8E1] border-b border-[#FFE082]">
                            <div className="w-9 h-9 rounded-full bg-[#F57C00]/10 flex items-center justify-center shrink-0">
                                <AlertTriangle size={16} className="text-[#F57C00]" />
                            </div>
                            <div>
                                <div className="text-[14px] font-black text-[#37474F]">{t("scanFlow.confirmDeleteSequence")}</div>
                                <div className="text-[11px] text-[#78909C] mt-0.5">{t("scanFlow.selectedCannotUndo", { count: checkedSeqIds.length })}</div>
                            </div>
                        </div>
                        <div className="px-5 pt-3 pb-1">
                            <ul className="flex flex-col gap-1.5">
                                {checkedSeqIds.map(id => {
                                    const seq = groups.flatMap(g => g.sequences).find(s => s.id === id);
                                    return seq ? (
                                        <li key={id} className="flex items-center gap-2 text-[12px] text-[#37474F] font-bold">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#D32F2F] shrink-0" />
                                            {seq.name}
                                        </li>
                                    ) : null;
                                })}
                            </ul>
                        </div>
                        <div className="flex gap-2 px-5 py-4">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="flex-1 h-[40px] bg-[#D32F2F] text-white font-bold rounded-lg text-[13px] hover:bg-red-700 shadow-md transition-all active:scale-95"
                            >
                                {t("scanFlow.confirmDelete")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Abort Confirmation Dialog */}
            {showAbortConfirm && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#FFE082] w-[360px] overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8E1] border-b border-[#FFE082]">
                            <div className="w-10 h-10 rounded-full bg-[#F57C00]/15 flex items-center justify-center shrink-0">
                                <AlertTriangle size={20} className="text-[#F57C00]" />
                            </div>
                            <div>
                                <div className="text-[15px] font-black text-[#37474F]">{t("scanFlow.abortExam")}</div>
                                <div className="text-[12px] text-[#78909C] mt-0.5">{t("scanFlow.abortQuestion")}</div>
                            </div>
                        </div>
                        <div className="px-5 py-3">
                            <p className="text-[13px] text-[#546E7A] leading-relaxed">
                                {t("scanFlow.abortBodyStart")}<span className="font-bold text-[#37474F]">{t("scanFlow.abortBodyStrong")}</span>{t("scanFlow.abortBodyEnd")}
                            </p>
                            {abortError && <p className="mt-2 text-[11px] font-bold text-red-600">{abortError}</p>}
                        </div>
                        <div className="flex gap-2 px-5 pb-5">
                            <button
                                onClick={() => setShowAbortConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                {t("scanFlow.continueExam")}
                            </button>
                            <button
                                onClick={async () => {
                                    const sessionId = loadSelectedScanSessionId();
                                    if (!sessionId || isAborting) return;
                                    setIsAborting(true);
                                    setAbortError("");
                                    try {
                                        const actionId = abortActionIdRef.current ?? createActionId();
                                        abortActionIdRef.current = actionId;
                                        const result = await applyScanWorkflowAction(sessionId, {
                                            action_id: actionId,
                                            action: "terminate_exam",
                                            reason: "User terminated the simulated exam from scan confirmation",
                                        });
                                        if (result.scan_session.status !== "cancelled") {
                                            throw new Error("检查会话未成功终止。");
                                        }
                                        clearSelectedScanSessionId();
                                        navigate('/patients');
                                    } catch (error) {
                                        setAbortError(error instanceof Error ? error.message : "终止检查失败，请重试。");
                                    } finally {
                                        setIsAborting(false);
                                    }
                                }}
                                disabled={isAborting}
                                className="flex-1 h-[40px] bg-[#F57C00] text-white font-bold rounded-lg text-[13px] hover:bg-orange-600 shadow-md transition-all active:scale-95"
                            >
                                {isAborting ? t("scanFlow.finalization.saving") : t("scanFlow.confirmAbort")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PatientConfirmationModal
                isOpen={showPatientConfirm}
                onClose={() => setShowPatientConfirm(false)}
                onConfirm={() => {
                    setShowPatientConfirm(false);
                    if (onExecuteScan) {
                        onExecuteScan();
                        return;
                    }
                    navigate(nextRoute);
                }}
                patientData={selectedPatient ? {
                    name: selectedPatient.name,
                    age: selectedPatient.age,
                    gender: selectedPatient.gender,
                    idNumber: "--",
                    patientId: selectedPatient.patientId,
                    checkType: currentScanData.sequence,
                    scanSequence: currentScanData.sequence,
                } : undefined}
                scanData={currentScanData}
            />
        </div>
    );
};

/**
 * PatientConfirmationModal - 适配 1024x768 的精简版患者确认弹窗
 */
interface PatientData {
    name: string;
    age: number | string;
    gender: string;
    idNumber: string;
    patientId: string;
    checkType: string;
    scanSequence?: string;
}

interface ScanData {
    ctdi: string;
    dlp: string;
    protocol: string;
    sequence?: string;
}

interface PatientConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    patientData?: PatientData;
    scanData?: ScanData;
    physicalGuide?: PatientConfirmationPhysicalGuide;
}

// 辅助组件：信息项
const InfoItem = ({ label, value, icon: Icon }: { label: string; value: string | number; icon?: React.ElementType }) => (
    <div className="flex flex-col gap-1 p-4 bg-[#F8FAFC] rounded-2xl border border-[#F1F5F9] transition-all">
        <div className="flex items-center gap-2 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
            {Icon && <Icon size={12} />}
            {label}
        </div>
        <div className="text-[18px] font-bold text-[#334155] truncate">
            {value || "---"}
        </div>
    </div>
);

const localizeGenderValue = (
    gender: string,
    t: (key: TranslationKey) => string,
) => {
    const normalized = gender.trim().toLowerCase();
    if (normalized === "男" || normalized === "m" || normalized === "male") {
        return t("patientList.gender.male");
    }
    if (normalized === "女" || normalized === "f" || normalized === "female") {
        return t("patientList.gender.female");
    }
    if (normalized === "其他" || normalized === "o" || normalized === "other") {
        return t("patientList.gender.other");
    }
    return gender;
};

const localizeProtocolValue = (
    protocol: string,
    t: (key: TranslationKey) => string,
) => {
    const normalized = protocol.trim().toLowerCase();
    if (normalized === "定位像" || normalized === "scout" || normalized === "localizer") {
        return t("scanFlow.scout");
    }
    if (normalized === "螺旋扫描" || normalized === "helical" || normalized === "helical scan") {
        return t("scanFlow.postScout.helical");
    }
    if (normalized === "断层扫描" || normalized === "轴位扫描" || normalized === "axial" || normalized === "axial scan") {
        return t("scanFlow.postScout.axial");
    }
    if (normalized === "4d扫描" || normalized === "4d scan" || normalized === "4d") {
        return t("scanFlow.fourD.mode");
    }
    return protocol;
};

type PatientConfirmationPhysicalStepState = "pending" | "active" | "done";

type PatientConfirmationPhysicalStep = {
    id: string;
    label: string;
    detail: string;
    state: PatientConfirmationPhysicalStepState;
};

type PatientConfirmationPhysicalGuide = {
    title: string;
    description: string;
    guideTitle: string;
    triggerLabel: string;
    emergencyLabel: string;
    simulatedLabel: string;
    steps: PatientConfirmationPhysicalStep[];
    onHoldStart: () => void;
    onHoldEnd: () => void;
    buttonActive?: boolean;
    disabled?: boolean;
};

const CombinedPhysicalGuideCard = ({ guide, guideActive }: { guide: PatientConfirmationPhysicalGuide; guideActive: boolean }) => {
    const { t } = useI18n();
    const interactionDisabled = Boolean(guide.disabled) || !guideActive;
    const lampOn = !interactionDisabled && guide.steps.some((step) => step.state === "active");

    return (
        <div className="flex h-full min-h-[380px] flex-col rounded-2xl border border-[#D6E0EA] bg-white p-5 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.65)]">
            <div>
                <div className="text-[14px] font-black text-slate-700">{guide.title}</div>
                <div className="mt-1.5 text-[10px] font-semibold leading-relaxed text-slate-500">{guide.description}</div>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 items-center gap-4 rounded-2xl bg-slate-50 px-4 py-4">
                <PhysicalControlPanelSvg
                    active={guideActive && guide.buttonActive}
                    className="w-[68px] shrink-0"
                    disabled={interactionDisabled}
                    lampOn={lampOn}
                    onPressEnd={guide.onHoldEnd}
                    onPressStart={guide.onHoldStart}
                    panelLabel={guide.title}
                    triggerLabel={guide.triggerLabel}
                />

                <div className="flex h-full min-w-0 flex-1 flex-col py-2">
                    <div className="mb-3 flex items-center gap-2 px-1">
                        <PhysicalButtonStatusDot active={guideActive && guide.buttonActive} disabled={interactionDisabled} size="small" />
                        <span className="text-[11px] font-black text-slate-600">
                            {guideActive ? guide.triggerLabel : t("scanFlow.readyToStart")}
                        </span>
                    </div>
                    <div className="relative flex flex-1 flex-col justify-evenly overflow-hidden rounded-xl border border-slate-200/80 bg-white/75 px-3 py-3">
                        <div className="pointer-events-none absolute bottom-[26%] left-[28px] top-[26%] w-[2px] bg-slate-200" />
                        <div className="pointer-events-none absolute left-[21px] top-1/2 z-10 flex h-[15px] w-[15px] -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
                            <ChevronDown size={10} strokeWidth={2.5} />
                        </div>
                        {guide.steps.map((step, index) => {
                            const visibleState = guideActive ? step.state : "pending";
                            return (
                                <div key={step.id} className={`relative z-10 flex min-h-[82px] items-center gap-3 rounded-lg px-1 py-2 transition-colors duration-200 ${visibleState === "active" ? "bg-emerald-50/80" : "bg-transparent"}`}>
                                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-black transition-all ${visibleState === "done" ? "border-slate-600 bg-slate-600 text-white" : visibleState === "active" ? "border-emerald-600 bg-emerald-600 text-white ring-4 ring-emerald-100" : "border-slate-200 bg-white text-slate-500"}`}>
                                        {visibleState === "done" ? <CheckCircle size={15} /> : index + 1}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className={`text-[11px] font-black leading-tight ${visibleState === "active" ? "text-emerald-800" : "text-slate-700"}`}>{step.label}</div>
                                        <div className={`mt-1.5 text-[9px] font-semibold leading-relaxed ${visibleState === "active" ? "text-emerald-700/75" : "text-slate-400"}`}>{step.detail}</div>
                                    </div>
                                    {visibleState === "active" && (
                                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const PatientConfirmationModalContent: React.FC<PatientConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    patientData = {
        name: "--",
        age: "--",
        gender: "--",
        idNumber: "--",
        patientId: "--",
        checkType: "--",
    },
    scanData = { ctdi: "--", dlp: "--", protocol: "--", sequence: "--" },
    physicalGuide,
}) => {
    const { t } = useI18n();
    const [guideStarted, setGuideStarted] = useState(false);
    const hasPhysicalGuide = Boolean(physicalGuide);
    const localizedGender = localizeGenderValue(patientData.gender, t);
    const localizedProtocol = hasPhysicalGuide ? scanData.protocol : localizeProtocolValue(scanData.protocol, t);
    const localizedScanSequence = localizeProtocolValue(scanData.sequence ?? patientData.scanSequence ?? patientData.checkType, t);

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[999] flex items-center justify-center bg-[#0F172A]/40 backdrop-blur-sm animate-in fade-in duration-300">
            {/* 弹窗主容器 - 尺寸经过优化以适配 1024x768 */}
            <div className={`bg-white ${hasPhysicalGuide ? "w-[920px] rounded-[32px] p-8 gap-5" : "w-[880px] rounded-[40px] p-10 gap-8"} shadow-[0_30px_60px_-12px_rgba(0,0,0,0.25)] flex flex-col border border-white relative overflow-hidden`}>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-8 right-8 w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all z-20 group"
                >
                    <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>

                {/* 背景渐变装饰 */}
                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-blue-50/40 to-transparent pointer-events-none" />

                {/* 头部标题区 */}
                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-11 h-11 bg-[#4D94FF] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                        <UserCheckIcon size={22} />
                    </div>
                    <div>
                        <h2 className="text-[22px] font-black text-[#1E293B]">{t("scanFlow.patientConfirm.title")}</h2>
                        <p className="text-[11px] text-[#94A3B8] font-bold uppercase tracking-[0.2em]">{t("scanFlow.patientConfirm.subtitle")}</p>
                    </div>
                </div>

                {hasPhysicalGuide && physicalGuide ? (
                    <div className="grid grid-cols-[1fr_360px] gap-8 relative z-10">
                        <div className="flex flex-col gap-4">
                            <h3 className="text-[12px] font-bold text-[#94A3B8] tracking-widest px-1">{t("scanFlow.patientConfirm.patientInfo")}</h3>
                            <div className="grid grid-cols-4 gap-4">
                                <div className="col-span-2">
                                    <InfoItem label={t("scanFlow.patientConfirm.name")} value={patientData.name} icon={UserCircle} />
                                </div>
                                <InfoItem label={t("scanFlow.patientConfirm.age")} value={patientData.age} />
                                <InfoItem label={t("scanFlow.patientConfirm.gender")} value={localizedGender} />

                                <div className="col-span-2">
                                    <InfoItem label={t("scanFlow.currentProtocol")} value={localizedProtocol} icon={Stethoscope} />
                                </div>
                                <div className="col-span-2">
                                    <InfoItem label={t("scanFlow.patientConfirm.scanSequence")} value={localizedScanSequence} icon={CheckCircle} />
                                </div>

                                <div className="col-span-2">
                                    <InfoItem label={t("scanFlow.patientConfirm.patientId")} value={patientData.patientId} icon={Info} />
                                </div>
                                <div className="col-span-2">
                                    <InfoItem label={t("scanFlow.patientConfirm.idNumber")} value={patientData.idNumber} icon={Fingerprint} />
                                </div>
                            </div>

                            <div className="rounded-2xl border border-[#FEF3C7] bg-[#FFFBEB] p-4 shadow-sm">
                                <div className="mb-3 text-[12px] font-bold tracking-widest text-[#B45309]/70">{t("scanFlow.patientConfirm.referenceDose")}</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="rounded-xl bg-white/60 px-4 py-3 text-center">
                                        <div className="text-[10px] font-bold uppercase text-[#B45309]/70">CTDIvol (mGy)</div>
                                        <div className="mt-1 text-[26px] font-black leading-none text-[#B45309]">{scanData.ctdi}</div>
                                    </div>
                                    <div className="rounded-xl bg-white/60 px-4 py-3 text-center">
                                        <div className="text-[10px] font-bold uppercase text-[#B45309]/70">DLP (mGy·cm)</div>
                                        <div className="mt-1 text-[26px] font-black leading-none text-[#B45309]">{scanData.dlp}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-col">
                            <CombinedPhysicalGuideCard guide={physicalGuide} guideActive={guideStarted} />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-12 gap-8 relative z-10">
                        {/* 左侧：精简后的患者档案 (占据 7/12 列) */}
                        <div className="col-span-7 flex flex-col gap-4">
                            <h3 className="text-[12px] font-bold text-[#94A3B8] tracking-widest px-1">{t("scanFlow.patientConfirm.patientInfo")}</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <InfoItem label={t("scanFlow.patientConfirm.name")} value={patientData.name} icon={UserCircle} />
                                <div className="grid grid-cols-2 gap-4">
                                    <InfoItem label={t("scanFlow.patientConfirm.age")} value={patientData.age} />
                                    <InfoItem label={t("scanFlow.patientConfirm.gender")} value={localizedGender} />
                                </div>
                                <InfoItem label={t("scanFlow.patientConfirm.scanSequence")} value={localizedScanSequence} icon={Stethoscope} />
                                <InfoItem label={t("scanFlow.patientConfirm.patientId")} value={patientData.patientId} icon={Info} />
                                <div className="col-span-2">
                                    <InfoItem label={t("scanFlow.patientConfirm.idNumber")} value={patientData.idNumber} icon={Fingerprint} />
                                </div>
                            </div>
                        </div>

                        {/* 右侧：剂量与序列 (占据 5/12 列) */}
                        <div className="col-span-5 flex flex-col gap-6">
                            <div className="flex flex-col gap-4">
                                <h3 className="text-[12px] font-bold text-[#94A3B8] tracking-widest px-1">{t("scanFlow.patientConfirm.parameters")}</h3>

                                {/* 剂量卡片 */}
                                <div className="bg-[#FFFBEB] rounded-[28px] p-5 border border-[#FEF3C7] flex items-center justify-around shadow-sm">
                                    <div className="text-center">
                                        <div className="text-[10px] font-bold text-[#B45309] mb-1 opacity-70 uppercase">CTDIvol (mGy)</div>
                                        <div className="text-[32px] font-black text-[#B45309] leading-none">{scanData.ctdi}</div>
                                    </div>
                                    <div className="w-px h-8 bg-[#FEF3C7]" />
                                    <div className="text-center">
                                        <div className="text-[10px] font-bold text-[#B45309] mb-1 opacity-70 uppercase">DLP (mGy·cm)</div>
                                        <div className="text-[32px] font-black text-[#B45309] leading-none">{scanData.dlp}</div>
                                    </div>
                                </div>

                                {/* 协议卡片 */}
                                <div className="bg-[#EFF6FF] rounded-[28px] p-5 border border-[#DBEAFE] flex flex-col items-center justify-center min-h-[120px]">
                                    <div className="text-[10px] font-bold text-[#3B82F6] mb-1 uppercase">{t("scanFlow.currentProtocol")}</div>
                                    <div className="text-[28px] font-black text-[#2563EB] text-center leading-tight">
                                        {localizedProtocol}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 底部按钮栏 */}
                <div className={`flex items-center justify-between ${hasPhysicalGuide ? "mt-0 pt-5" : "mt-2 pt-8"} border-t border-slate-100 relative z-10`}>
                    <p className="text-[14px] italic text-[#64748B] font-medium">
                        {hasPhysicalGuide ? t("scanFlow.patientConfirm.combinedHint") : t("scanFlow.patientConfirm.hint")}
                    </p>

                    <div className="flex items-center gap-5">
                        {(!hasPhysicalGuide || guideStarted) && (
                            <div className="flex items-center gap-3 bg-[#F0FDF4] px-4 py-2.5 rounded-xl border border-[#DCFCE7]">
                                <div className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22C55E]"></span>
                                </div>
                                <span className="text-[14px] font-bold text-[#166534]">{hasPhysicalGuide && physicalGuide ? physicalGuide.guideTitle : t("scanFlow.patientConfirm.ready")}</span>
                            </div>
                        )}

                        {hasPhysicalGuide && !guideStarted ? (
                            <button
                                type="button"
                                onClick={() => setGuideStarted(true)}
                                className="inline-flex h-[52px] items-center px-9 bg-[#4D94FF] text-white font-black rounded-xl shadow-[0_12px_24px_-8px_rgba(77,148,255,0.5)] hover:bg-[#3B82F6] active:translate-y-[1px] transition-all text-[16px]"
                            >
                                {t("scanFlow.readyToStart")}
                            </button>
                        ) : !hasPhysicalGuide ? (
                            <button
                                onClick={onConfirm}
                                className="h-[60px] px-12 bg-[#4D94FF] text-white font-black rounded-2xl shadow-[0_15px_30px_-8px_rgba(77,148,255,0.4)] hover:bg-[#3B82F6] hover:translate-y-[-1px] active:translate-y-[1px] transition-all text-[18px]"
                            >
                                {t("scanFlow.readyToStart")}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const PatientConfirmationModal: React.FC<PatientConfirmationModalProps> = (props) => {
    if (!props.isOpen) return null;
    return <PatientConfirmationModalContent {...props} />;
};

// 内部图标小组件
const UserCheckIcon = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <polyline points="16 11 18 13 22 9" />
    </svg>
);

export default ScanConfirmScreen;
