import { useState, useMemo, useEffect, useCallback } from "react";
import type { MouseEvent, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import {
    User,
    Settings,
    Sun,
    Plus,
    Copy,
    Trash2,
    ChevronUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ArrowLeftRight,
    RefreshCw,
    Check,
    Target,
    CircleDot,
    Info,
    Activity,
    Flame,
    Network,
    Siren,
    AlertTriangle,
} from "lucide-react";
import { loadSelectedPatient, formatPatientCardSubtitle } from "../lib/patientSession";
import { saveSelectedScanWorkflowPlans } from "../lib/scanWorkflowSession";
import {
    createScanSessionForSelectedPatient,
    deleteSelectedScanSessionSeries,
    duplicateSelectedScanSessionSeries,
    fetchScanSessionById,
    fetchSelectedScanSession,
    saveSelectedScanSessionId,
    updateSelectedScanSessionAxialParam,
    updateSelectedScanSessionHelicalParam,
    updateSelectedScanSessionReconSeries,
    updateScanSessionById,
    updateSelectedScanSessionTopogramParam,
} from "../lib/scanSession";
import type { ApiScanSessionDetail } from "../lib/scanSession";

type RawProtocol = {
    id: string;
    name: string;
    region: string;
    patientType: "adult" | "child";
    scanLocationLabel: string;
    supportedPositions: string[];
    supportedModes: string[];
};

type RawRecon = {
    id: string;
    name: string;
    params: Record<string, string | number | boolean>;
};

type RawSequence = {
    id: string;
    name: string;
    sequenceType: string;
    mode: string;
    scanParams: Record<string, string | number | boolean>;
    reconstructionParams: RawRecon[];
};

type RawProtocolCase = {
    protocol: RawProtocol;
    sequences: RawSequence[];
};

type ApiTopogramParam = {
    kv: number;
    ma: number;
    scan_length: number;
    tube_angle: number;
    fov: number;
    ctdi_vol?: number | null;
    dlp?: number | null;
};

type ApiHelicalParam = {
    kv: number;
    ma: number;
    slice_thickness: number;
    pitch: number;
    rotation_time: number;
    scan_length: number;
    fov: number;
    ctdi_vol?: number | null;
    dlp?: number | null;
    auto_ma?: boolean;
};

type ApiAxialParam = {
    kv: number;
    ma: number;
    slice_thickness: number;
    slice_interval: number;
    rotation_time: number;
    scan_length: number;
    fov: number;
    ctdi_vol?: number | null;
    dlp?: number | null;
    step_count?: number | null;
};

type ApiReconSeries = {
    id: number;
    recon_name: string;
    kernel: string;
    matrix: number;
    window_width: number;
    window_level: number;
    slice_thickness: number;
    increment?: number | null;
};

type ApiFourDConfig = {
    breathing_mode: string;
    phase_count: number;
    acquisition_time: number;
    trigger_threshold?: number | null;
};

type ApiSeriesDetail = {
    id: number;
    series_type: "topogram" | "helical" | "axial" | "4d";
    series_label: string;
    topogram_param?: ApiTopogramParam | null;
    helical_param?: ApiHelicalParam | null;
    axial_param?: ApiAxialParam | null;
    recon_series: ApiReconSeries[];
    fourd_config?: ApiFourDConfig | null;
};

type ApiProtocolDetail = {
    id: number;
    name: string;
    body_part: string;
    age_group: "adult" | "child" | "infant";
    patient_weight: string;
    patient_position: "HFS" | "FFS" | "HFP" | "FFP";
    table_direction: "in" | "out";
    scan_mode: "plain" | "contrast" | "4d";
    description?: string | null;
    series: ApiSeriesDetail[];
};

type ApiProtocolSummary = {
    id: number;
    name: string;
    body_part: string;
    age_group: "adult" | "child" | "infant";
    patient_weight: string;
    patient_position: "HFS" | "FFS" | "HFP" | "FFP";
    table_direction: "in" | "out";
    scan_mode: "plain" | "contrast" | "4d";
    description?: string | null;
    series_count: number;
    supported_modes: ApiSeriesDetail["series_type"][];
};

type UiParam = {
    label: string;
    value: string;
    highlight?: boolean;
    options?: string[];
};

type UiReconPlan = {
    sourceReconId?: number;
    name: string;
    params: UiParam[];
};

type UiSequence = {
    id: string;
    sourceSeriesId?: number;
    name: string;
    mode: string;
    seriesType?: string;
    status: string;
    type: string;
    icon: ReactElement;
    scanParams: UiParam[];
    reconPlans: UiReconPlan[];
};

type UiPlan = {
    id: string;
    title: string;
    patientPosition: string;
    sourceSessionId?: number;
    sequences: UiSequence[];
};

const bodyRegions = ["头部", "颈部", "胸腔", "脊柱", "腹部", "四肢"] as const;
type BodyRegion = typeof bodyRegions[number];

const normalizeRegion = (value: string | undefined): BodyRegion | "" => {
    if (!value) return "";
    const region = value.trim().toLowerCase();
    if (region.includes("头") || region === "head") return "头部";
    if (region.includes("颈") || region === "neck") return "颈部";
    if (region.includes("胸") || region === "chest") return "胸腔";
    if (region.includes("脊") || region === "spine") return "脊柱";
    if (region.includes("腹") || region === "abdomen") return "腹部";
    if (region.includes("肢") || region === "extremity") return "四肢";
    return "";
};

const normalizeModeTags = (modes: string[] | undefined): string[] => {
    if (!modes) return [];
    return modes.map((mode) => mode.trim());
};

const mapAgeGroupToPatientType = (ageGroup: ApiProtocolDetail["age_group"] | ApiProtocolSummary["age_group"]): "adult" | "child" =>
    ageGroup === "adult" ? "adult" : "child";

const getModeLabel = (seriesType: ApiSeriesDetail["series_type"]): string => {
    switch (seriesType) {
        case "topogram":
            return "Topogram";
        case "helical":
            return "Helical";
        case "axial":
            return "Axial";
        case "4d":
            return "4D";
        default:
            return seriesType;
    }
};

const mapApiSeriesToRawSequence = (
    protocol: ApiProtocolDetail,
    series: ApiSeriesDetail
): RawSequence => {
    const baseScanParams: Record<string, string | number | boolean> = {
        scanningDirection: protocol.table_direction.toUpperCase(),
    };

    if (series.topogram_param) {
        Object.assign(baseScanParams, {
            scanLength: series.topogram_param.scan_length,
            mA: series.topogram_param.ma,
            kV: series.topogram_param.kv,
            angle: series.topogram_param.tube_angle,
            scoutFOV: series.topogram_param.fov,
        });
    }

    if (series.helical_param) {
        Object.assign(baseScanParams, {
            scanLength: series.helical_param.scan_length,
            mA: series.helical_param.ma,
            kV: series.helical_param.kv,
            rotationTime: series.helical_param.rotation_time,
            scoutFOV: series.helical_param.fov,
            pitch: series.helical_param.pitch,
        });
    }

    if (series.axial_param) {
        Object.assign(baseScanParams, {
            scanLength: series.axial_param.scan_length,
            mA: series.axial_param.ma,
            kV: series.axial_param.kv,
            rotationTime: series.axial_param.rotation_time,
            scoutFOV: series.axial_param.fov,
            scanIncrement: series.axial_param.slice_interval,
            cycleCount: series.axial_param.step_count ?? undefined,
        });
    }

    if (series.fourd_config) {
        Object.assign(baseScanParams, {
            acquisitionTime: series.fourd_config.acquisition_time,
            phaseCount: series.fourd_config.phase_count,
            triggerThreshold: series.fourd_config.trigger_threshold ?? undefined,
        });
    }

    return {
        id: String(series.id),
        name: series.series_label,
        sequenceType: series.series_type === "topogram" ? "localizer" : "scan",
        mode: getModeLabel(series.series_type),
        scanParams: baseScanParams,
        reconstructionParams: (series.recon_series || []).map((recon) => ({
            id: String(recon.id),
            name: recon.recon_name,
            params: {
                sliceThickness: recon.slice_thickness,
                kernel: recon.kernel,
                windowCenter: recon.window_level,
                windowWidth: recon.window_width,
                matrix: recon.matrix,
                ...(recon.increment !== null && recon.increment !== undefined ? { interval: recon.increment } : {}),
            },
        })),
    };
};

const mapApiProtocolToRawCase = (protocol: ApiProtocolDetail): RawProtocolCase => ({
    protocol: {
        id: String(protocol.id),
        name: protocol.name,
        region: protocol.body_part,
        patientType: mapAgeGroupToPatientType(protocol.age_group),
        scanLocationLabel: protocol.body_part,
        supportedPositions: [protocol.patient_position],
        supportedModes: protocol.series.map((series) => getModeLabel(series.series_type)),
    },
    sequences: protocol.series.map((series) => mapApiSeriesToRawSequence(protocol, series)),
});

const mapScanSessionToRawCase = (scanSession: ApiScanSessionDetail): RawProtocolCase => ({
    protocol: {
        id: String(scanSession.protocol_id),
        name: scanSession.name,
        region: scanSession.body_part,
        patientType: mapAgeGroupToPatientType(scanSession.age_group),
        scanLocationLabel: scanSession.body_part,
        supportedPositions: [scanSession.patient_position],
        supportedModes: scanSession.series.map((series) => getModeLabel(series.series_type)),
    },
    sequences: scanSession.series.map((series) =>
        mapApiSeriesToRawSequence(
            {
                id: scanSession.protocol_id,
                name: scanSession.name,
                body_part: scanSession.body_part,
                age_group: scanSession.age_group,
                patient_weight: scanSession.patient_weight,
                patient_position: scanSession.patient_position as ApiProtocolDetail["patient_position"],
                table_direction: scanSession.table_direction as ApiProtocolDetail["table_direction"],
                scan_mode: scanSession.scan_mode,
                description: scanSession.description,
                series: [],
            },
            {
                id: series.id,
                series_type: series.series_type,
                series_label: series.series_label,
                topogram_param: series.topogram_param ?? null,
                helical_param: series.helical_param ?? null,
                axial_param: series.axial_param ?? null,
                recon_series: series.recon_series,
                fourd_config: series.fourd_config ?? null,
            }
        )
    ),
});

export const protocolCaseData: RawProtocolCase[] = [
    {
        protocol: {
            id: "origin-1",
            name: "脑部轴位",
            region: "头部",
            patientType: "adult",
            scanLocationLabel: "脑部",
            supportedPositions: ["HFS"],
            supportedModes: ["定位像", "螺旋扫描"],
        },
        sequences: [
            {
                id: "q-scout",
                name: "定位像",
                sequenceType: "localizer",
                mode: "定位像",
                scanParams: {
                    scanLength: 450,
                    scanningDirection: "OUT",
                    mA: 50,
                    kV: 120,
                    angle: 0,
                    scoutFOV: 500,
                },
                reconstructionParams: [],
            },
            {
                id: "q-2",
                name: "Acquisition 1",
                sequenceType: "scan",
                mode: "螺旋扫描",
                scanParams: {
                    scanLength: 165,
                    scanningDirection: "OUT",
                    mA: 215,
                    kV: 120,
                    angle: 0,
                    rotationTime: 1,
                    collimation: "320.6",
                    scoutFOV: 500,
                    dom: 0,
                    pitch: 0.5,
                },
                reconstructionParams: [
                    {
                        id: "seq-1",
                        name: "软组织",
                        params: {
                            sliceThickness: 5,
                            interval: 5,
                            kernel: "Brain2",
                            windowCenter: 40,
                            windowWidth: 100,
                            fov: 250,
                            matrix: 512,
                            centerX: 0,
                            centerY: 0,
                            metalReduction: false,
                        },
                    },
                    {
                        id: "seq-2",
                        name: "骨骼",
                        params: {
                            sliceThickness: 5,
                            interval: 5,
                            kernel: "Bone2",
                            windowCenter: 600,
                            windowWidth: 3500,
                            fov: 250,
                            matrix: 512,
                            centerX: 0,
                            centerY: 0,
                            metalReduction: false,
                        },
                    },
                ],
            },
        ],
    },
    {
        protocol: {
            id: "origin-2",
            name: "脑部轴位2D",
            region: "头部",
            patientType: "adult",
            scanLocationLabel: "脑部",
            supportedPositions: ["HFS"],
            supportedModes: ["定位像", "断层扫描"],
        },
        sequences: [
            {
                id: "q-scout",
                name: "定位像",
                sequenceType: "localizer",
                mode: "定位像",
                scanParams: {
                    scanLength: 450,
                    scanningDirection: "OUT",
                    mA: 50,
                    kV: 120,
                    angle: 0,
                    scoutFOV: 500,
                },
                reconstructionParams: [],
            },
            {
                id: "q-2",
                name: "Acquisition 1",
                sequenceType: "scan",
                mode: "断层扫描",
                scanParams: {
                    scanLength: 173,
                    scanningDirection: "OUT",
                    mA: 200,
                    kV: 120,
                    angle: 0,
                    rotationTime: 2,
                    collimation: "320.6",
                    scoutFOV: 500,
                    dom: 0,
                    scanIncrement: 19.2,
                    cycleCount: 9,
                },
                reconstructionParams: [
                    {
                        id: "seq-1",
                        name: "软组织",
                        params: {
                            sliceThickness: 2.4,
                            interval: 2.4,
                            kernel: "Brain2",
                            windowCenter: 600,
                            windowWidth: 100,
                            fov: 250,
                            matrix: 512,
                            centerX: 0,
                            centerY: 0,
                            metalReduction: false,
                        },
                    },
                    {
                        id: "seq-2",
                        name: "骨骼",
                        params: {
                            sliceThickness: 2.4,
                            interval: 2.4,
                            kernel: "Bone2",
                            windowCenter: 600,
                            windowWidth: 3500,
                            fov: 250,
                            matrix: 512,
                            centerX: 0,
                            centerY: 0,
                            metalReduction: false,
                        },
                    },
                ],
            },
        ],
    },
];

const scanParamOrder = ["mA", "kV", "scanLength", "scanningDirection", "angle", "rotationTime", "collimation", "scoutFOV", "dom", "pitch", "scanIncrement", "cycleCount"];
const scanParamLabelMap: Record<string, string> = {
    mA: "MA",
    kV: "KV",
    scanLength: "LEN",
    scanningDirection: "DIR",
    angle: "ANG",
    rotationTime: "ROT",
    collimation: "COL",
    scoutFOV: "FOV",
    dom: "DOM",
    pitch: "PITCH",
    scanIncrement: "INC",
    cycleCount: "CYC",
};

const reconParamOrder = ["sliceThickness", "interval", "kernel", "windowCenter", "windowWidth", "fov", "matrix", "centerX", "centerY", "metalReduction"];
const reconParamLabelMap: Record<string, string> = {
    sliceThickness: "THICK",
    interval: "INT",
    kernel: "KER",
    windowCenter: "WC",
    windowWidth: "WW",
    fov: "FOV",
    matrix: "MAT",
    centerX: "CX",
    centerY: "CY",
    metalReduction: "MAR",
};

const formatValue = (key: string, value: string | number | boolean | undefined): string => {
    if (value === undefined || value === null) return "-";
    if (typeof value === "boolean") return value ? "ON" : "OFF";
    switch (key) {
        case "scanLength":
        case "scoutFOV":
        case "fov":
        case "sliceThickness":
        case "interval":
        case "windowCenter":
        case "windowWidth":
        case "scanIncrement":
            return `${value}mm`;
        case "angle":
            return `${value}°`;
        case "rotationTime":
            return `${value}s`;
        default:
            return String(value);
    }
};

const toUiPlan = (entry: RawProtocolCase, options?: { sourceSessionId?: number }): UiPlan => ({
    id: entry.protocol.id,
    title: entry.protocol.name,
    patientPosition: entry.protocol.supportedPositions[0] ?? "HFS",
    sourceSessionId: options?.sourceSessionId,
    sequences: entry.sequences.map((seq: RawSequence, index: number) => ({
        id: `${entry.protocol.id}-${seq.id}`,
        sourceSeriesId: Number.isFinite(Number(seq.id)) ? Number(seq.id) : undefined,
        name: seq.name,
        mode: seq.mode,
        seriesType: seq.sequenceType,
        status: index === 0 ? "DONE" : "ACTIVE",
        type: seq.sequenceType,
        icon: seq.sequenceType === "localizer" ? <Target size={14} /> : <RefreshCw size={14} />,
        scanParams: scanParamOrder
            .filter((k) => seq.scanParams && seq.scanParams[k] !== undefined)
            .map((k) => ({
                label: scanParamLabelMap[k] || k.toUpperCase(),
                value: formatValue(k, seq.scanParams[k]),
                options: k === "mA" ? ["50", "100", "150", "200", "215"] : k === "kV" ? ["80", "100", "120", "140"] : undefined,
            })),
        reconPlans: (seq.reconstructionParams || []).map((rp: RawRecon) => ({
            sourceReconId: Number.isFinite(Number(rp.id)) ? Number(rp.id) : undefined,
            name: rp.name,
            params: reconParamOrder
                .filter((k) => rp.params && rp.params[k] !== undefined)
                .map((k) => ({
                    label: reconParamLabelMap[k] || k.toUpperCase(),
                    value: formatValue(k, rp.params[k]),
                })),
        })),
    })),
});

type ProtocolSetupScreenProps = {
    onOpenProtocolDetail?: () => void;
};

const API_BASE_URL = (
    (import.meta.env.VITE_API_BASE_URL as string | undefined)
    ?? (import.meta.env.DEV ? "http://127.0.0.1:8001" : "")
).replace(/\/$/, "");

const buildApiUrl = (path: string) => {
    if (!API_BASE_URL) return path;
    return `${API_BASE_URL}${path}`;
};

const isSupportedPosition = (value: string): value is "HFS" | "FFS" | "HFP" | "FFP" | "HFDR" | "FFDR" | "HFDL" | "FFDL" =>
    ["HFS", "FFS", "HFP", "FFP", "HFDR", "FFDR", "HFDL", "FFDL"].includes(value);

const fetchProtocolCatalogWithFallback = async () => {
    const candidates = API_BASE_URL
        ? [buildApiUrl("/api/protocols/catalog"), "/api/protocols/catalog"]
        : ["/api/protocols/catalog", "http://127.0.0.1:8001/api/protocols/catalog", "http://127.0.0.1:8000/api/protocols/catalog"];

    let lastError: Error | null = null;

    for (const url of candidates) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                lastError = new Error(`Request failed with status ${response.status}`);
                continue;
            }
            return (await response.json()) as ApiProtocolSummary[];
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Unknown request error");
        }
    }

    throw lastError ?? new Error("Failed to load protocol catalog");
};

const fetchProtocolDetailWithFallback = async (protocolId: number) => {
    const candidates = API_BASE_URL
        ? [buildApiUrl(`/api/protocols/${protocolId}`), `/api/protocols/${protocolId}`]
        : [`/api/protocols/${protocolId}`, `http://127.0.0.1:8001/api/protocols/${protocolId}`, `http://127.0.0.1:8000/api/protocols/${protocolId}`];

    let lastError: Error | null = null;

    for (const url of candidates) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                lastError = new Error(`Request failed with status ${response.status}`);
                continue;
            }
            return (await response.json()) as ApiProtocolDetail;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Unknown request error");
        }
    }

    throw lastError ?? new Error(`Failed to load protocol ${protocolId}`);
};

const ProtocolSetupScreen = ({ onOpenProtocolDetail }: ProtocolSetupScreenProps) => {
    const navigate = useNavigate();
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);
    const [protocolSummaries, setProtocolSummaries] = useState<ApiProtocolSummary[]>([]);
    const [protocolDetailsById, setProtocolDetailsById] = useState<Record<number, ApiProtocolDetail>>({});
    const [isLoadingProtocols, setIsLoadingProtocols] = useState(true);
    const [protocolsError, setProtocolsError] = useState("");
    const [activeTab, setActiveTab] = useState<"scan" | "recon">("scan");
    const [libraryTab, setLibraryTab] = useState<"spiral" | "axial">("spiral");
    const [selectedBodyRegion, setSelectedBodyRegion] = useState<BodyRegion>(bodyRegions[0]);
    const [selectedProtocolIds, setSelectedProtocolIds] = useState<number[]>([]);
    const [positionGroupIndex, setPositionGroupIndex] = useState<0 | 1>(0);
    const [planListOpen, setPlanListOpen] = useState(true);
    const [collapsedPlanIds, setCollapsedPlanIds] = useState<string[]>([]);
    const [patientType, setPatientType] = useState<"adult" | "child">("adult");

    // 选中序列 ID 和重建方案索引
    const [selectedSeqId, setSelectedSeqId] = useState("");
    const [selectedReconIndex, setSelectedReconIndex] = useState(0);

    // 多选删除相关
    const [checkedPlanIds, setCheckedPlanIds] = useState<string[]>([]);
    const [checkedSeqIds, setCheckedSeqIds] = useState<string[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isCreatingSession, setIsCreatingSession] = useState(false);
    const [sessionActionError, setSessionActionError] = useState("");
    const [scanSessionsByProtocolId, setScanSessionsByProtocolId] = useState<Record<number, ApiScanSessionDetail>>({});

    useEffect(() => {
        let cancelled = false;

        const loadProtocols = async () => {
            setIsLoadingProtocols(true);
            setProtocolsError("");

            try {
                const data = await fetchProtocolCatalogWithFallback();
                if (cancelled) return;

                setProtocolSummaries(data);
            } catch {
                if (cancelled) return;
                setProtocolSummaries([]);
                setProtocolsError("Failed to load protocols. Please check the backend service and try again.");
            } finally {
                if (!cancelled) {
                    setIsLoadingProtocols(false);
                }
            }
        };

        void loadProtocols();

        return () => {
            cancelled = true;
        };
    }, []);

    const protocolSummaryMap = useMemo(
        () => Object.fromEntries(protocolSummaries.map((protocol) => [protocol.id, protocol])),
        [protocolSummaries]
    );

    const ensureProtocolDetailLoaded = useCallback(async (protocolId: number) => {
        const existing = protocolDetailsById[protocolId];
        if (existing) return existing;

        const detail = await fetchProtocolDetailWithFallback(protocolId);
        setProtocolDetailsById((prev) => {
            if (prev[protocolId]) return prev;
            return {
                ...prev,
                [protocolId]: detail,
            };
        });
        return detail;
    }, [protocolDetailsById]);

    const libraryData = useMemo(
        () => protocolSummaries
            .filter((protocol) => {
                const normalizedPatientType = mapAgeGroupToPatientType(protocol.age_group);
                const supportedModes = normalizeModeTags(protocol.supported_modes);
                const hasSpiral = supportedModes.some((mode) => mode === "helical");
                const hasAxial = supportedModes.some((mode) => mode === "axial");

                const normalizedRegion = normalizeRegion(protocol.body_part);
                const regionMatch = normalizedRegion === selectedBodyRegion || protocol.body_part === selectedBodyRegion;

                return normalizedPatientType === patientType
                    && (libraryTab === "spiral" ? hasSpiral : hasAxial)
                    && regionMatch;
            })
            .sort((left, right) => {
                const leftRegion = normalizeRegion(left.body_part) || left.body_part;
                const rightRegion = normalizeRegion(right.body_part) || right.body_part;
                const leftRank = leftRegion === selectedBodyRegion ? -1 : bodyRegions.indexOf(leftRegion as BodyRegion);
                const rightRank = rightRegion === selectedBodyRegion ? -1 : bodyRegions.indexOf(rightRegion as BodyRegion);

                if (leftRank !== rightRank) {
                    return leftRank - rightRank;
                }

                return left.name.localeCompare(right.name, "zh-CN");
            })
            .map((protocol) => ({
                id: protocol.id,
                name: protocol.name,
                region: normalizeRegion(protocol.body_part) || protocol.body_part,
                protocol: protocolDetailsById[protocol.id] ?? null,
            })),
        [protocolDetailsById, protocolSummaries, libraryTab, selectedBodyRegion, patientType]
    );

    const groupedLibraryData = useMemo(() => {
        const groups = new Map<string, typeof libraryData>();

        libraryData.forEach((item) => {
            const existingItems = groups.get(item.region) || [];
            groups.set(item.region, [...existingItems, item]);
        });

        return Array.from(groups.entries()).map(([region, items]) => ({
            region,
            items,
        }));
    }, [libraryData]);

    const buildPlansFromIds = useCallback(
        (ids: number[]): UiPlan[] =>
            ids
                .map((id) => {
                    const scanSession = scanSessionsByProtocolId[id];
                    const protocolDetail = protocolDetailsById[id];
                    return scanSession
                        ? toUiPlan(mapScanSessionToRawCase(scanSession), { sourceSessionId: scanSession.id })
                        : protocolDetail
                            ? toUiPlan(mapApiProtocolToRawCase(protocolDetail))
                            : null;
                })
                .filter((plan): plan is UiPlan => plan !== null),
        [protocolDetailsById, scanSessionsByProtocolId]
    );

    const applySessionToScreen = useCallback((scanSession: ApiScanSessionDetail) => {
        setScanSessionsByProtocolId((prev) => ({
            ...prev,
            [scanSession.protocol_id]: scanSession,
        }));

        setPatientType(mapAgeGroupToPatientType(scanSession.age_group));

        const region = normalizeRegion(scanSession.body_part);
        if (region) {
            setSelectedBodyRegion(region);
        }

        if (protocolSummaryMap[scanSession.protocol_id]) {
            setSelectedProtocolIds((prev) =>
                prev.includes(scanSession.protocol_id) ? prev : [...prev, scanSession.protocol_id]
            );
        }
    }, [protocolSummaryMap]);

    useEffect(() => {
        if (protocolSummaries.length === 0) return;

        let cancelled = false;

        const syncSelectedSessionState = async () => {
            try {
                const scanSession = await fetchSelectedScanSession();
                if (!scanSession || cancelled) return;
                applySessionToScreen(scanSession);
            } catch (error) {
                console.error(error);
            }
        };

        void syncSelectedSessionState();

        const handleFocus = () => {
            void syncSelectedSessionState();
        };

        window.addEventListener("focus", handleFocus);
        return () => {
            cancelled = true;
            window.removeEventListener("focus", handleFocus);
        };
    }, [protocolSummaries.length, applySessionToScreen]);

    const [scanPlans, setScanPlans] = useState<UiPlan[]>(() => buildPlansFromIds(selectedProtocolIds));

    useEffect(() => {
        if (protocolSummaries.length === 0) {
            const timer = setTimeout(() => {
                setScanPlans([]);
                setSelectedProtocolIds([]);
                setSelectedSeqId("");
            }, 0);
            return () => clearTimeout(timer);
        }

        const nextSelectedIds = selectedProtocolIds.filter((id) => Boolean(protocolSummaryMap[id]));
        const nextPlans = buildPlansFromIds(nextSelectedIds);
        const nextSelectedSeqId = nextPlans.flatMap((plan) => plan.sequences)[0]?.id || "";

        if (
            nextSelectedIds.length !== selectedProtocolIds.length ||
            nextSelectedIds.some((id, index) => id !== selectedProtocolIds[index])
        ) {
            const timer = setTimeout(() => {
                setSelectedProtocolIds(nextSelectedIds);
                setScanPlans(nextPlans);
                setSelectedSeqId((current) =>
                    nextPlans.some((plan: UiPlan) => plan.sequences.some((sequence: UiSequence) => sequence.id === current)) ? current : nextSelectedSeqId
                );
            }, 0);
            return () => clearTimeout(timer);
        } else {
            setScanPlans(nextPlans);
            setSelectedSeqId((current) =>
                nextPlans.some((plan: UiPlan) => plan.sequences.some((sequence: UiSequence) => sequence.id === current)) ? current : nextSelectedSeqId
            );
        }
    }, [protocolSummaryMap, protocolSummaries.length, selectedProtocolIds, buildPlansFromIds]);

    const openScanSession = useCallback(async (protocolId: number, route: "/protocol-detail" | "/scout-scan") => {
        const protocolSummary = protocolSummaryMap[protocolId];
        if (!protocolSummary) return;

        setSessionActionError("");
        setIsCreatingSession(true);

        try {
            const protocolDetail = protocolDetailsById[protocolId] ?? await ensureProtocolDetailLoaded(protocolId);
            localStorage.setItem("selectedProtocol", JSON.stringify(protocolDetail));
            const existingSession = scanSessionsByProtocolId[protocolId];
            const scanSession = existingSession
                ?? await createScanSessionForSelectedPatient(protocolId, protocolSummary.name);
            saveSelectedScanSessionId(scanSession.id);
            applySessionToScreen(scanSession);

            if (onOpenProtocolDetail && route === "/protocol-detail") {
                onOpenProtocolDetail();
                return;
            }

            navigate(route);
        } catch (error) {
            console.error(error);
            setSessionActionError("无法创建本次扫描会话，请检查患者和后端服务。");
        } finally {
            setIsCreatingSession(false);
        }
    }, [applySessionToScreen, ensureProtocolDetailLoaded, navigate, onOpenProtocolDetail, protocolDetailsById, protocolSummaryMap, scanSessionsByProtocolId]);

    const handleProtocolSelect = async (protocolId: number) => {
        if (!protocolSummaryMap[protocolId]) return;

        const isSelected = selectedProtocolIds.includes(protocolId);
        if (!isSelected) {
            try {
                await ensureProtocolDetailLoaded(protocolId);
            } catch (error) {
                console.error(error);
                setSessionActionError("协议详情加载失败，请检查后端服务。");
                return;
            }
        }

        const nextIds = isSelected
            ? selectedProtocolIds.filter((id) => id !== protocolId)
            : [...selectedProtocolIds, protocolId];
        setSelectedProtocolIds(nextIds);
        setCollapsedPlanIds([]);
        setCheckedPlanIds([]);
        setCheckedSeqIds([]);
        setSelectedReconIndex(0);
        setPlanListOpen(true);

        const nextPlans = buildPlansFromIds(nextIds);
        setScanPlans(nextPlans);
        setSelectedSeqId(nextPlans.flatMap((p) => p.sequences)[0]?.id || "");
    };

    const handleLibraryTabChange = (tab: "spiral" | "axial") => {
        setLibraryTab(tab);
        setCheckedPlanIds([]);
        setCheckedSeqIds([]);
    };

    const toggleCheckSeq = (seqId: string, e: MouseEvent) => {
        e.stopPropagation();
        setCheckedSeqIds(prev =>
            prev.includes(seqId) ? prev.filter(id => id !== seqId) : [...prev, seqId]
        );
    };

    const toggleCheckPlan = (planId: string) => {
        setCheckedPlanIds((prev) =>
            prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId]
        );
    };

    const handleDeleteClick = () => {
        if (checkedSeqIds.length === 0 && checkedPlanIds.length === 0) return;
        setShowDeleteConfirm(true);
    };

    const handleCopyClick = () => {
        if (checkedSeqIds.length === 0 && checkedPlanIds.length === 0) return;

        const duplicateIds = new Set<number>();
        scanPlans.forEach((plan) => {
            if (!plan.sourceSessionId) return;
            if (checkedPlanIds.includes(plan.id)) {
                plan.sequences.forEach((sequence) => {
                    if (sequence.sourceSeriesId) duplicateIds.add(sequence.sourceSeriesId);
                });
            }
        });
        scanPlans.flatMap((plan) => plan.sequences).forEach((sequence) => {
            if (checkedSeqIds.includes(sequence.id) && sequence.sourceSeriesId) {
                duplicateIds.add(sequence.sourceSeriesId);
            }
        });

        if (duplicateIds.size === 0) return;

        void (async () => {
            try {
                for (const id of duplicateIds) {
                    const updated = await duplicateSelectedScanSessionSeries(id);
                    applySessionToScreen(updated);
                }
                setCheckedPlanIds([]);
                setCheckedSeqIds([]);
                setSelectedReconIndex(0);
                setPlanListOpen(true);
            } catch (error) {
                console.error(error);
            }
        })();
    };

    const togglePlanCollapse = (planId: string) => {
        setCollapsedPlanIds((prev) =>
            prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId]
        );
    };

    const handleConfirmDelete = () => {
        const deleteIds = new Set<number>();
        scanPlans.forEach((plan) => {
            if (!plan.sourceSessionId) return;
            if (checkedPlanIds.includes(plan.id)) {
                plan.sequences.forEach((sequence) => {
                    if (sequence.sourceSeriesId) deleteIds.add(sequence.sourceSeriesId);
                });
            }
        });
        scanPlans.flatMap((plan) => plan.sequences).forEach((sequence) => {
            if (checkedSeqIds.includes(sequence.id) && sequence.sourceSeriesId) {
                deleteIds.add(sequence.sourceSeriesId);
            }
        });

        if (deleteIds.size === 0) {
            setShowDeleteConfirm(false);
            return;
        }

        void (async () => {
            try {
                let updatedSession: ApiScanSessionDetail | null = null;
                for (const id of deleteIds) {
                    updatedSession = await deleteSelectedScanSessionSeries(id);
                }
                if (updatedSession) {
                    applySessionToScreen(updatedSession);
                } else {
                    await refreshCurrentSession();
                }
                setCheckedPlanIds([]);
                setCheckedSeqIds([]);
                setShowDeleteConfirm(false);
                setSelectedReconIndex(0);
            } catch (error) {
                console.error(error);
            }
        })();
    };

    // 获取当前选中序列对象
    const allSequences = scanPlans.flatMap((p) => p.sequences);
    const activeSeq = allSequences.find((s) => s.id === selectedSeqId) || allSequences[0] || {
        type: "",
        mode: "",
        scanParams: [],
        reconPlans: [],
    };
    const activePlan = scanPlans.find((plan) => plan.sequences.some((sequence) => sequence.id === activeSeq.id)) ?? scanPlans[0];
    const activePlanId = activePlan?.id;
    const activeProtocolId = activePlanId ? Number(activePlanId) : selectedProtocolIds[0];
    const activeScanSession = activeProtocolId ? scanSessionsByProtocolId[activeProtocolId] ?? null : null;
    const activePositioning = isSupportedPosition(activePlan?.patientPosition ?? "") ? activePlan.patientPosition : "HFS";
    const activeSessionSeries = activeScanSession?.series.find((series) => series.id === activeSeq.sourceSeriesId) ?? null;
    const activeSessionRecon = activeSessionSeries?.recon_series.find(
        (recon) => recon.id === activeSeq.reconPlans?.[selectedReconIndex]?.sourceReconId
    ) ?? null;

    const refreshCurrentSession = async (sessionId?: number) => {
        const targetSessionId = sessionId ?? activeScanSession?.id;
        if (!targetSessionId) return;
        const scanSession = await fetchScanSessionById(targetSessionId);
        if (scanSession) {
            applySessionToScreen(scanSession);
        }
    };

    const parseEditableNumber = (value: string) => {
        const parsed = Number(value.replace(/[^\d.-]/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
    };

    const handleScanParamChange = async (label: string, rawValue: string) => {
        if (!activeSessionSeries || !activeScanSession) return;

        setScanPlans((plans) =>
            plans.map((plan) => ({
                ...plan,
                sequences: plan.sequences.map((sequence) =>
                    sequence.id === activeSeq.id
                        ? {
                            ...sequence,
                            scanParams: sequence.scanParams.map((param) =>
                                param.label === label ? { ...param, value: rawValue } : param
                            ),
                        }
                        : sequence
                ),
            }))
        );

        try {
            if (label === "DIR") {
                const updatedSession = await updateScanSessionById(activeScanSession.id, { table_direction: rawValue.toLowerCase() });
                applySessionToScreen(updatedSession);
                return;
            }

            if (activeSessionSeries.topogram_param) {
                const patch: Record<string, number> = {};
                if (label === "MA") patch.ma = parseEditableNumber(rawValue) ?? activeSessionSeries.topogram_param.ma;
                if (label === "KV") patch.kv = parseEditableNumber(rawValue) ?? activeSessionSeries.topogram_param.kv;
                if (label === "LEN") patch.scan_length = parseEditableNumber(rawValue) ?? activeSessionSeries.topogram_param.scan_length;
                if (label === "ANG") patch.tube_angle = parseEditableNumber(rawValue) ?? activeSessionSeries.topogram_param.tube_angle;
                if (label === "FOV") patch.fov = parseEditableNumber(rawValue) ?? activeSessionSeries.topogram_param.fov;
                if (Object.keys(patch).length > 0) {
                    await updateSelectedScanSessionTopogramParam(activeSessionSeries.topogram_param.id, patch);
                    await refreshCurrentSession(activeScanSession.id);
                }
                return;
            }

            if (activeSessionSeries.helical_param) {
                const patch: Record<string, number> = {};
                if (label === "MA") patch.ma = parseEditableNumber(rawValue) ?? activeSessionSeries.helical_param.ma;
                if (label === "KV") patch.kv = parseEditableNumber(rawValue) ?? activeSessionSeries.helical_param.kv;
                if (label === "LEN") patch.scan_length = parseEditableNumber(rawValue) ?? activeSessionSeries.helical_param.scan_length;
                if (label === "FOV") patch.fov = parseEditableNumber(rawValue) ?? activeSessionSeries.helical_param.fov;
                if (Object.keys(patch).length > 0) {
                    await updateSelectedScanSessionHelicalParam(activeSessionSeries.helical_param.id, patch);
                    await refreshCurrentSession(activeScanSession.id);
                }
                return;
            }

            if (activeSessionSeries.axial_param) {
                const patch: Record<string, number> = {};
                if (label === "MA") patch.ma = parseEditableNumber(rawValue) ?? activeSessionSeries.axial_param.ma;
                if (label === "KV") patch.kv = parseEditableNumber(rawValue) ?? activeSessionSeries.axial_param.kv;
                if (label === "LEN") patch.scan_length = parseEditableNumber(rawValue) ?? activeSessionSeries.axial_param.scan_length;
                if (label === "FOV") patch.fov = parseEditableNumber(rawValue) ?? activeSessionSeries.axial_param.fov;
                if (Object.keys(patch).length > 0) {
                    await updateSelectedScanSessionAxialParam(activeSessionSeries.axial_param.id, patch);
                    await refreshCurrentSession(activeScanSession.id);
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleReconParamChange = async (label: string, rawValue: string) => {
        if (!activeSessionRecon) return;

        setScanPlans((plans) =>
            plans.map((plan) => ({
                ...plan,
                sequences: plan.sequences.map((sequence) =>
                    sequence.id === activeSeq.id
                        ? {
                            ...sequence,
                            reconPlans: sequence.reconPlans.map((reconPlan, index) =>
                                index === selectedReconIndex
                                    ? {
                                        ...reconPlan,
                                        params: reconPlan.params.map((param) =>
                                            param.label === label ? { ...param, value: rawValue } : param
                                        ),
                                    }
                                    : reconPlan
                            ),
                        }
                        : sequence
                ),
            }))
        );

        try {
            const patch: Record<string, string | number> = {};
            if (label === "THICK") patch.slice_thickness = parseEditableNumber(rawValue) ?? activeSessionRecon.slice_thickness;
            if (label === "INT") patch.increment = parseEditableNumber(rawValue) ?? activeSessionRecon.increment ?? activeSessionRecon.slice_thickness;
            if (label === "KER") patch.kernel = rawValue;
            if (label === "WC") patch.window_level = parseEditableNumber(rawValue) ?? activeSessionRecon.window_level;
            if (label === "WW") patch.window_width = parseEditableNumber(rawValue) ?? activeSessionRecon.window_width;
            if (label === "MAT") patch.matrix = parseEditableNumber(rawValue) ?? activeSessionRecon.matrix;
            if (label === "FOV") {
                return;
            }

            if (Object.keys(patch).length > 0) {
                await updateSelectedScanSessionReconSeries(activeSessionRecon.id, patch);
                await refreshCurrentSession(activeScanSession?.id);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const visibleSequenceCount = scanPlans.reduce((count, plan) => {
        if (collapsedPlanIds.includes(plan.id)) return count;
        return count + plan.sequences.length;
    }, 0);

    const planHeaderHeight = 60;
    const planTitleRowHeight = 32;
    const seqRowHeight = 36;
    const desiredPlanPanelHeight = planListOpen
        ? planHeaderHeight + scanPlans.length * planTitleRowHeight + visibleSequenceCount * seqRowHeight
        : planHeaderHeight;
    const planPanelHeight = Math.min(Math.max(desiredPlanPanelHeight, planHeaderHeight), 420);
    const handleOpenProtocolDetail = async () => {
        if (!activeProtocolId) return;
        await openScanSession(activeProtocolId, "/protocol-detail");
    };

    const handleStartScanFlow = async () => {
        if (!activeProtocolId) return;
        saveSelectedScanWorkflowPlans(
            scanPlans.map((plan) => ({
                id: plan.id,
                title: plan.title,
                sourceSessionId: plan.sourceSessionId,
                sequences: plan.sequences.map((sequence) => ({
                    id: sequence.id,
                    name: sequence.name,
                    type:
                        sequence.seriesType === "localizer"
                            ? "scout"
                            : sequence.mode === "Helical"
                                ? "helical"
                                : sequence.mode === "Axial"
                                    ? "axial"
                                    : sequence.mode === "4D"
                                        ? "4d"
                                        : "other",
                })),
            }))
        );
        await openScanSession(activeProtocolId, "/scout-scan");
    };

    useEffect(() => {
        setPositionGroupIndex(["HFS", "FFS", "HFP", "FFP"].includes(activePositioning) ? 0 : 1);
    }, [activePositioning]);

    const handlePositioningChange = async (pos: "HFS" | "FFS" | "HFP" | "FFP" | "HFDR" | "FFDR" | "HFDL" | "FFDL") => {
        if (!activeScanSession || !activePlanId) return;

        setScanPlans((plans) =>
            plans.map((plan) =>
                plan.id === activePlanId
                    ? { ...plan, patientPosition: pos }
                    : plan
            )
        );
        setPositionGroupIndex(["HFS", "FFS", "HFP", "FFP"].includes(pos) ? 0 : 1);

        try {
            const updatedSession = await updateScanSessionById(activeScanSession.id, { patient_position: pos });
            applySessionToScreen(updatedSession);
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl text-[#37474F] font-sans select-none">
            {/* Header */}
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold tracking-tight">{selectedPatient?.name ?? "未选择患者"}</span>
                            <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5 opacity-80">
                                {formatPatientCardSubtitle(selectedPatient)}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                        <div className="text-[9px] font-bold italic">⊥ 0</div>
                        <div className="text-[9px] font-bold">∠ 0</div>
                        <div className="flex items-center gap-1 text-[11px] font-bold">
                            <Flame size={14} />
                            <span>0%</span>
                        </div>
                    </div>
                </div>

                <div className="text-center">
                    <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">13:52</div>
                    <div className="text-[12px] text-[#546E7A] font-medium mt-1 uppercase opacity-80">
                        2月26日 周四
                    </div>
                </div>

                <div className="flex items-center gap-5 pr-2">
                    <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70">
                        <Siren size={30} strokeWidth={1.8} />
                    </div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Network size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">
                            5
                        </span>
                    </div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Sun size={24} />
                    </div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Settings size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">
                            10
                        </span>
                    </div>
                </div>
            </header>

            {/* Main */}
            <main className="flex-1 overflow-hidden p-2 flex gap-[12px] bg-[#EEF2F9]">
                {/* Left */}
                <aside className="w-[310px] flex flex-col bg-white border border-[#B0C4DE] rounded-md shadow-sm overflow-hidden">
                    <div
                        className="shrink-0 flex flex-col min-h-0 overflow-hidden"
                        style={{ height: `${planPanelHeight}px` }}
                    >
                        <div className="px-3 h-[60px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex justify-between items-center shrink-0">
                            <button
                                className="flex items-center gap-2 flex-1 min-w-0"
                                onClick={() => setPlanListOpen((v) => !v)}
                            >
                                <Activity size={14} className="text-[#4D94FF] shrink-0" />
                                <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">
                                    扫描计划
                                </span>
                                {planListOpen
                                    ? <ChevronUp size={14} className="text-[#90A4AE] ml-1" />
                                    : <ChevronDown size={14} className="text-[#90A4AE] ml-1" />
                                }
                            </button>
                            <div className="flex items-center gap-1">
                                {/* 新增序列 */}
                                <button
                                    title="新增序列"
                                    className="w-[44px] h-[44px] flex items-center justify-center rounded-md text-[#4D94FF] hover:bg-[#E3F2FD] active:bg-[#BBDEFB] transition-colors"
                                >
                                    <Plus size={20} />
                                </button>
                                {/* 复制序列 */}
                                <button
                                    title="复制序列"
                                    onClick={handleCopyClick}
                                    className={`relative w-[44px] h-[44px] flex items-center justify-center rounded-md transition-colors ${checkedSeqIds.length > 0 || checkedPlanIds.length > 0
                                        ? 'text-[#4D94FF] hover:bg-[#E3F2FD] active:bg-[#BBDEFB]'
                                        : 'text-[#B0C4DE] cursor-not-allowed'
                                        }`}
                                >
                                    <Copy size={18} />
                                </button>
                                {/* 删除序列 */}
                                <button
                                    title="删除已选序列"
                                    onClick={handleDeleteClick}
                                    className={`w-[44px] h-[44px] flex items-center justify-center rounded-md transition-colors ${checkedSeqIds.length > 0 || checkedPlanIds.length > 0
                                        ? 'text-[#D32F2F] hover:bg-[#FFEBEE] active:bg-[#FFCDD2]'
                                        : 'text-[#B0C4DE] cursor-not-allowed'
                                        }`}
                                >
                                    <Trash2 size={18} />
                                    {(checkedSeqIds.length > 0 || checkedPlanIds.length > 0) && (
                                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#D32F2F] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                            {checkedSeqIds.length + checkedPlanIds.length}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {planListOpen && (
                            <div className="flex-1 overflow-y-auto bg-white">
                                {scanPlans.map((plan) => (
                                    <div key={plan.id} className="border-b border-gray-100/50">
                                        {/* 计划标题行 */}
                                        <div className="h-[32px] px-4 flex items-center gap-2 bg-[#F8FAFC] border-b border-[#EEF2F9]">
                                            <button
                                                type="button"
                                                onClick={() => togglePlanCollapse(plan.id)}
                                                title={collapsedPlanIds.includes(plan.id) ? "展开该协议内扫描序列" : "收起该协议内扫描序列"}
                                                className="inline-flex w-6 h-6 items-center justify-center rounded-sm hover:bg-[#E3F2FD] transition-colors"
                                            >
                                                <CircleDot
                                                    size={12}
                                                    className={collapsedPlanIds.includes(plan.id) ? "text-[#94A3B8]" : "text-[#4D94FF]"}
                                                />
                                            </button>
                                            <input
                                                type="checkbox"
                                                checked={checkedPlanIds.includes(plan.id)}
                                                onChange={() => toggleCheckPlan(plan.id)}
                                                className="w-3.5 h-3.5 rounded-sm accent-[#4D94FF]"
                                            />
                                            <span className="text-[10px] font-black tracking-tight text-[#546E7A]">
                                                {plan.title}
                                            </span>
                                        </div>

                                        {!collapsedPlanIds.includes(plan.id) && plan.sequences.map((seq) => (
                                            <div
                                                key={seq.id}
                                                onClick={() => {
                                                    setSelectedSeqId(seq.id);
                                                    setSelectedReconIndex(0);
                                                }}
                                                className={`h-[36px] flex items-center px-8 gap-3 cursor-pointer relative ${checkedSeqIds.includes(seq.id)
                                                    ? 'bg-[#F3F8FF]'
                                                    : selectedSeqId === seq.id
                                                        ? 'bg-[#E3F2FD] border-l-4 border-[#4D94FF]'
                                                        : 'hover:bg-gray-50'
                                                    }`}
                                            >
                                                <div className="absolute left-5 top-0 bottom-0 w-[1px] bg-gray-100"></div>
                                                <div className="absolute left-5 top-1/2 w-2 h-[1px] bg-gray-100"></div>

                                                {/* Checkbox */}
                                                <div
                                                    onClick={(e) => toggleCheckSeq(seq.id, e)}
                                                    className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checkedSeqIds.includes(seq.id)
                                                        ? 'bg-[#4D94FF] border-[#4D94FF]'
                                                        : 'bg-white border-[#B0C4DE] hover:border-[#4D94FF]'
                                                        }`}
                                                >
                                                    {checkedSeqIds.includes(seq.id) && <Check size={10} className="text-white stroke-[3]" />}
                                                </div>

                                                <span
                                                    className={`text-[12px] font-bold ${checkedSeqIds.includes(seq.id)
                                                        ? 'text-[#546E7A]'
                                                        : selectedSeqId === seq.id
                                                            ? 'text-[#1E88E5]'
                                                            : 'text-[#546E7A]'
                                                        }`}
                                                >
                                                    {seq.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Params */}
                    <div className="flex-1 min-h-[170px] bg-[#F8FAFC] border-t border-[#EEF2F9] p-3 flex flex-col">
                        <div className="shrink-0 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-3 bg-[#4D94FF] rounded-full"></div>
                                    <span className="text-[10px] font-black uppercase tracking-tight text-[#37474F]">
                                        参数详情 ({activeSeq.mode || activeSeq.type?.toUpperCase() || "-"})
                                    </span>
                                </div>
                                <div className="flex bg-white rounded-md border border-[#B0C4DE]/50 p-0.5 h-[28px]">
                                    <button
                                        onClick={() => setActiveTab("scan")}
                                        className={`px-4 text-[10px] font-bold rounded-md transition-all ${activeTab === "scan" ? "bg-[#4D94FF] text-white shadow-sm" : "text-[#4D94FF]"
                                            }`}
                                    >
                                        扫描
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("recon")}
                                        className={`px-4 text-[10px] font-bold rounded-md transition-all ${activeTab === "recon" ? "bg-[#4D94FF] text-white shadow-sm" : "text-[#4D94FF]"
                                            }`}
                                    >
                                        重建
                                    </button>
                                </div>
                            </div>

                            {/* 重建方案切换栏（仅在重建 Tab 且有多个方案时显示） */}
                            {activeTab === "recon" && activeSeq.reconPlans && (
                                <div className="flex gap-1">
                                    {activeSeq.reconPlans.map((plan, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setSelectedReconIndex(idx)}
                                            className={`h-[24px] px-3 rounded text-[10px] font-black transition-all border ${selectedReconIndex === idx
                                                ? "bg-[#4D94FF] text-white border-[#4D94FF] shadow-sm"
                                                : "bg-white text-[#90A4AE] border-[#B0C4DE]/30 hover:border-[#4D94FF] hover:text-[#4D94FF]"
                                                }`}
                                        >
                                            {plan.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-h-0 mt-3 overflow-y-auto pr-1">
                            <div className="grid grid-cols-2 gap-2">
                                {activeTab === "scan"
                                    ? activeSeq.scanParams?.map((p, i) => (
                                        <ParamBox
                                            key={i}
                                            label={p.label}
                                            value={p.value}
                                            highlight={p.highlight}
                                            options={
                                                p.label === "DIR"
                                                    ? ["IN", "OUT"]
                                                    : p.options
                                            }
                                            onChange={
                                                ["MA", "KV", "LEN", "DIR", "ANG", "FOV"].includes(p.label)
                                                    ? (value) => void handleScanParamChange(p.label, value)
                                                    : undefined
                                            }
                                        />
                                    ))
                                    : activeSeq.reconPlans?.[selectedReconIndex]?.params?.map((p, i) => (
                                        <ParamBox
                                            key={i}
                                            label={p.label}
                                            value={p.value}
                                            onChange={
                                                ["THICK", "INT", "KER", "WC", "WW", "MAT"].includes(p.label)
                                                    ? (value) => void handleReconParamChange(p.label, value)
                                                    : undefined
                                            }
                                        />
                                    ))}
                            </div>
                        </div>

                        <button
                            onClick={handleOpenProtocolDetail}
                            disabled={isCreatingSession}
                            className={`shrink-0 mt-3 h-[32px] w-full border rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all shadow-sm ${isCreatingSession ? "bg-[#F8FAFC] border-[#E2E8F0] text-[#B0BEC5] cursor-not-allowed" : "bg-white border-[#B0C4DE] text-[#4D94FF] hover:bg-blue-50"}`}
                        >
                            <Info size={14} /> 参数详情
                        </button>
                    </div>
                </aside >

                {/* Center */}
                <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col relative overflow-hidden" >
                    <div className="h-[44px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#37474F]">
                            解剖区域确认
                        </span>
                        <div className="flex bg-[#EEF2F9] rounded-md p-1 border border-[#B0C4DE]/30">
                            <button
                                onClick={() => setPatientType("adult")}
                                className={`px-4 py-1 text-[10px] font-black rounded-sm transition-all ${patientType === "adult" ? "bg-[#4D94FF] text-white shadow-sm" : "text-[#546E7A] hover:bg-white/50"}`}
                            >
                                成人
                            </button>
                            <button
                                onClick={() => setPatientType("child")}
                                className={`px-4 py-1 text-[10px] font-black rounded-sm transition-all ${patientType === "child" ? "bg-[#4D94FF] text-white shadow-sm" : "text-[#546E7A] hover:bg-white/50"}`}
                            >
                                儿童
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 bg-white p-3 flex flex-col min-h-0">
                        <div className="flex-1 relative">
                            <div className="relative h-full flex items-center justify-center py-6">
                                {/* Human Body SVG Container */}
                                <div className="relative h-full aspect-[2/3] max-h-[500px]">
                                    <svg viewBox="0 0 200 600" className="w-full h-full drop-shadow-2xl overflow-visible">
                                        <defs>
                                            <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#E2E8F0" />
                                                <stop offset="50%" stopColor="#F8FAFC" />
                                                <stop offset="100%" stopColor="#E2E8F0" />
                                            </linearGradient>
                                            <linearGradient id="activeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#4D94FF" />
                                                <stop offset="50%" stopColor="#80B3FF" />
                                                <stop offset="100%" stopColor="#4D94FF" />
                                            </linearGradient>
                                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                                <feGaussianBlur stdDeviation="3" result="blur" />
                                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                            </filter>
                                        </defs>

                                        {/* Spine / Core Energy Line */}
                                        <path d="M100 80 L100 560" stroke="#94A3B8" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                                        <path d="M100 120 L100 420" stroke="#4D94FF" strokeWidth="4" strokeLinecap="round" opacity={selectedBodyRegion === '脊柱' ? "0.8" : "0.1"} filter="url(#glow)" className="transition-opacity duration-500" />

                                        {/* Figure Paths */}
                                        <g className="transition-all duration-300">
                                            {/* Limbs (四肢) - Simplified organic paths */}
                                            <g onClick={() => setSelectedBodyRegion("四肢")} className="cursor-pointer group">
                                                {/* Right Arm */}
                                                <path d="M135 140 Q160 220 155 320" fill="none" stroke={selectedBodyRegion === '四肢' ? "#4D94FF" : "#CBD5E1"} strokeWidth="18" strokeLinecap="round" opacity={selectedBodyRegion === '四肢' ? "0.3" : "0.2"} className="group-hover:opacity-40 transition-all" />
                                                {/* Left Arm */}
                                                <path d="M65 140 Q40 220 45 320" fill="none" stroke={selectedBodyRegion === '四肢' ? "#4D94FF" : "#CBD5E1"} strokeWidth="18" strokeLinecap="round" opacity={selectedBodyRegion === '四肢' ? "0.3" : "0.2"} className="group-hover:opacity-40 transition-all" />
                                                {/* Legs */}
                                                <path d="M85 355 Q85 450 80 580" fill="none" stroke={selectedBodyRegion === '四肢' ? "#4D94FF" : "#CBD5E1"} strokeWidth="22" strokeLinecap="round" opacity={selectedBodyRegion === '四肢' ? "0.3" : "0.2"} className="group-hover:opacity-40 transition-all" />
                                                <path d="M115 355 Q115 450 120 580" fill="none" stroke={selectedBodyRegion === '四肢' ? "#4D94FF" : "#CBD5E1"} strokeWidth="22" strokeLinecap="round" opacity={selectedBodyRegion === '四肢' ? "0.3" : "0.2"} className="group-hover:opacity-40 transition-all" />
                                            </g>

                                            {/* Chest (胸腔) */}
                                            <path
                                                d="M70 125 C 65 125, 60 140, 60 170 C 60 220, 140 220, 140 170 C 140 140, 135 125, 130 125 Z"
                                                onClick={() => setSelectedBodyRegion("胸腔")}
                                                className={`cursor-pointer transition-all duration-300 ${selectedBodyRegion === '胸腔' ? 'fill-[#4D94FF]/10 stroke-[#4D94FF] stroke-2' : 'fill-white/70 stroke-[#CBD5E1] hover:stroke-[#94A3B8]'}`}
                                            />

                                            {/* Abdomen (腹部) */}
                                            <path
                                                d="M70 230 Q65 240 65 280 Q65 340 100 350 Q135 340 135 280 Q135 240 130 230 Z"
                                                onClick={() => setSelectedBodyRegion("腹部")}
                                                className={`cursor-pointer transition-all duration-300 ${selectedBodyRegion === '腹部' ? 'fill-[#4D94FF]/10 stroke-[#4D94FF] stroke-2' : 'fill-white/70 stroke-[#CBD5E1] hover:stroke-[#94A3B8]'}`}
                                            />

                                            {/* Neck (颈部) */}
                                            <path
                                                d="M88 102 Q100 120 112 102 L110 115 Q100 122 90 115 Z"
                                                onClick={() => setSelectedBodyRegion("颈部")}
                                                className={`cursor-pointer transition-all duration-300 ${selectedBodyRegion === '颈部' ? 'fill-[#4D94FF] stroke-[#4D94FF]' : 'fill-[#E2E8F0] stroke-none hover:fill-[#CBD5E1]'}`}
                                            />

                                            {/* Head (头部) */}
                                            <path
                                                d="M72 65 C72 35 128 35 128 65 C128 95 100 105 100 105 C100 105 72 95 72 65 Z"
                                                onClick={() => setSelectedBodyRegion("头部")}
                                                className={`cursor-pointer transition-all duration-300 ${selectedBodyRegion === '头部' ? 'fill-[#4D94FF]/20 stroke-[#4D94FF] stroke-2' : 'fill-white/70 stroke-[#CBD5E1] hover:stroke-[#94A3B8]'}`}
                                            />
                                        </g>
                                    </svg>

                                    {/* Interactive Labels - Left Side with Tech Connectors */}
                                    <div className="absolute left-[-80px] top-[110px] flex items-center group cursor-pointer" onClick={() => setSelectedBodyRegion("颈部")}>
                                        <div className={`px-2.5 py-1.5 rounded-lg border backdrop-blur-md transition-all shadow-sm ${selectedBodyRegion === '颈部' ? 'bg-[#4D94FF] border-[#4D94FF] text-white' : 'bg-white/80 border-[#CBD5E1] text-[#64748B] hover:border-[#4D94FF] hover:text-[#4D94FF]'}`}>
                                            <span className="text-[11px] font-black tracking-wider">颈部</span>
                                        </div>
                                        <svg className="w-[30px] h-[20px] ml-1 overflow-visible">
                                            <path d="M0 10 L20 10" stroke={selectedBodyRegion === '颈部' ? "#4D94FF" : "#CBD5E1"} fill="none" strokeWidth="1.5" />
                                            <circle cx="20" cy="10" r="2.5" fill={selectedBodyRegion === '颈部' ? "#4D94FF" : "#CBD5E1"} />
                                        </svg>
                                    </div>

                                    <div className="absolute left-[-80px] top-[180px] flex items-center group cursor-pointer" onClick={() => setSelectedBodyRegion("胸腔")}>
                                        <div className={`px-2.5 py-1.5 rounded-lg border backdrop-blur-md transition-all shadow-sm ${selectedBodyRegion === '胸腔' ? 'bg-[#4D94FF] border-[#4D94FF] text-white' : 'bg-white/80 border-[#CBD5E1] text-[#64748B] hover:border-[#4D94FF] hover:text-[#4D94FF]'}`}>
                                            <span className="text-[11px] font-black tracking-wider">胸腔</span>
                                        </div>
                                        <svg className="w-[45px] h-[20px] ml-1 overflow-visible">
                                            <path d="M0 10 L35 10" stroke={selectedBodyRegion === '胸腔' ? "#4D94FF" : "#CBD5E1"} fill="none" strokeWidth="1.5" />
                                            <circle cx="35" cy="10" r="2.5" fill={selectedBodyRegion === '胸腔' ? "#4D94FF" : "#CBD5E1"} />
                                        </svg>
                                    </div>

                                    <div className="absolute left-[-80px] top-[300px] flex items-center group cursor-pointer" onClick={() => setSelectedBodyRegion("腹部")}>
                                        <div className={`px-2.5 py-1.5 rounded-lg border backdrop-blur-md transition-all shadow-sm ${selectedBodyRegion === '腹部' ? 'bg-[#4D94FF] border-[#4D94FF] text-white' : 'bg-white/80 border-[#CBD5E1] text-[#64748B] hover:border-[#4D94FF] hover:text-[#4D94FF]'}`}>
                                            <span className="text-[11px] font-black tracking-wider">腹部</span>
                                        </div>
                                        <svg className="w-[40px] h-[20px] ml-1 overflow-visible">
                                            <path d="M0 10 L30 10" stroke={selectedBodyRegion === '腹部' ? "#4D94FF" : "#CBD5E1"} fill="none" strokeWidth="1.5" />
                                            <circle cx="30" cy="10" r="2.5" fill={selectedBodyRegion === '腹部' ? "#4D94FF" : "#CBD5E1"} />
                                        </svg>
                                    </div>

                                    {/* Interactive Labels - Right Side */}
                                    <div className="absolute right-[-80px] top-[60px] flex items-center group cursor-pointer" onClick={() => setSelectedBodyRegion("头部")}>
                                        <svg className="w-[35px] h-[20px] mr-1 overflow-visible">
                                            <path d="M35 10 L15 10" stroke={selectedBodyRegion === '头部' ? "#4D94FF" : "#CBD5E1"} fill="none" strokeWidth="1.5" />
                                            <circle cx="15" cy="10" r="2.5" fill={selectedBodyRegion === '头部' ? "#4D94FF" : "#CBD5E1"} />
                                        </svg>
                                        <div className={`px-2.5 py-1.5 rounded-lg border backdrop-blur-md transition-all shadow-sm ${selectedBodyRegion === '头部' ? 'bg-[#4D94FF] border-[#4D94FF] text-white' : 'bg-white/80 border-[#CBD5E1] text-[#64748B] hover:border-[#4D94FF] hover:text-[#4D94FF]'}`}>
                                            <span className="text-[11px] font-black tracking-wider">头部</span>
                                        </div>
                                    </div>

                                    <div className="absolute right-[-80px] top-[240px] flex items-center group cursor-pointer" onClick={() => setSelectedBodyRegion("脊柱")}>
                                        <svg className="w-[45px] h-[20px] mr-1 overflow-visible">
                                            <path d="M45 10 L25 10" stroke={selectedBodyRegion === '脊柱' ? "#4D94FF" : "#CBD5E1"} fill="none" strokeWidth="1.5" />
                                            <circle cx="25" cy="10" r="2.5" fill={selectedBodyRegion === '脊柱' ? "#4D94FF" : "#CBD5E1"} />
                                        </svg>
                                        <div className={`px-2.5 py-1.5 rounded-lg border backdrop-blur-md transition-all shadow-sm ${selectedBodyRegion === '脊柱' ? 'bg-[#4D94FF] border-[#4D94FF] text-white' : 'bg-white/80 border-[#CBD5E1] text-[#64748B] hover:border-[#4D94FF] hover:text-[#4D94FF]'}`}>
                                            <span className="text-[11px] font-black tracking-wider">脊柱</span>
                                        </div>
                                    </div>

                                    <div className="absolute right-[-80px] top-[500px] flex items-center group cursor-pointer" onClick={() => setSelectedBodyRegion("四肢")}>
                                        <svg className="w-[40px] h-[20px] mr-1 overflow-visible">
                                            <path d="M40 10 L20 10" stroke={selectedBodyRegion === '四肢' ? "#4D94FF" : "#CBD5E1"} fill="none" strokeWidth="1.5" />
                                            <circle cx="20" cy="10" r="2.5" fill={selectedBodyRegion === '四肢' ? "#4D94FF" : "#CBD5E1"} />
                                        </svg>
                                        <div className={`px-2.5 py-1.5 rounded-lg border backdrop-blur-md transition-all shadow-sm ${selectedBodyRegion === '四肢' ? 'bg-[#4D94FF] border-[#4D94FF] text-white' : 'bg-white/80 border-[#CBD5E1] text-[#64748B] hover:border-[#4D94FF] hover:text-[#4D94FF]'}`}>
                                            <span className="text-[11px] font-black tracking-wider">四肢</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section >

                {/* Right */}
                < aside className="w-[360px] flex flex-col" >
                    <div className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col overflow-hidden">
                        {/* 协议库 tabs */}
                        <div className="flex h-[48px] bg-[#F8FAFC] border-b border-[#EEF2F9] p-1.5 gap-1.5 shrink-0">
                            <button
                                onClick={() => handleLibraryTabChange("spiral")}
                                className={`flex-1 text-[12px] font-black rounded-md transition-all ${libraryTab === "spiral"
                                    ? "bg-[#4D94FF] text-white shadow-md"
                                    : "bg-white text-[#4D94FF] hover:bg-gray-50"
                                    }`}
                            >
                                螺旋协议
                            </button>
                            <button
                                onClick={() => handleLibraryTabChange("axial")}
                                className={`flex-1 text-[12px] font-black rounded-md transition-all ${libraryTab === "axial"
                                    ? "bg-[#4D94FF] text-white shadow-md"
                                    : "bg-white text-[#4D94FF] hover:bg-gray-50"
                                    }`}
                            >
                                断层协议
                            </button>
                        </div>

                        {/* 协议列表 */}
                        <div className="flex-1 overflow-y-auto">
                            {isLoadingProtocols ? (
                                <div className="h-full flex items-center justify-center px-8 text-center bg-[#FCFDFE]">
                                    <div className="flex flex-col items-center gap-3">
                                        <RefreshCw size={20} className="text-[#4D94FF] animate-spin" />
                                        <div className="text-[12px] font-black text-[#546E7A]">Loading protocols...</div>
                                    </div>
                                </div>
                            ) : protocolsError ? (
                                <div className="h-full flex items-center justify-center px-8 text-center bg-[#FCFDFE]">
                                    <div>
                                        <div className="text-[12px] font-black text-[#D32F2F]">
                                            Failed to load protocols
                                        </div>
                                        <div className="mt-2 text-[10px] leading-5 text-[#90A4AE]">
                                            {protocolsError}
                                        </div>
                                    </div>
                                </div>
                            ) : libraryData.length === 0 ? (
                                <div className="h-full flex items-center justify-center px-8 text-center bg-[#FCFDFE]">
                                    <div>
                                        <div className="text-[12px] font-black text-[#546E7A]">
                                            No protocols match the current filters
                                        </div>
                                        <div className="mt-2 text-[10px] leading-5 text-[#90A4AE]">
                                            Try switching the patient type, body region, or scan mode.
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[#4D94FF] text-white sticky top-0 h-[32px] text-[11px] uppercase font-bold tracking-wider">
                                        <tr>
                                            <th className="w-[50px] text-center border-r border-white/10">Select</th>
                                            <th className="px-4 border-r border-white/10">Protocol Name</th>
                                            <th className="w-[80px] text-center px-2">Region</th>
                                        </tr>
                                    </thead>
                                    {groupedLibraryData.map((group) => (
                                        <tbody key={group.region} className="divide-y divide-gray-50">
                                            <tr className="h-[28px] bg-[#F8FAFC]">
                                                <td colSpan={3} className="px-4 text-[10px] font-black uppercase tracking-wider text-[#546E7A]">
                                                    {group.region}
                                                </td>
                                            </tr>
                                            {group.items.map((item) => (
                                                <tr
                                                    key={item.id}
                                                    onClick={() => handleProtocolSelect(item.id)}
                                                    className={`h-[40px] cursor-pointer transition-colors ${selectedProtocolIds.includes(item.id) ? "bg-[#E3F2FD]" : "hover:bg-[#F9FBFC]"
                                                        }`}
                                                >
                                                    <td className="text-center">
                                                        <div
                                                            className={`w-5 h-5 rounded-md border-2 mx-auto flex items-center justify-center transition-all ${selectedProtocolIds.includes(item.id)
                                                                ? "bg-[#4D94FF] border-[#4D94FF]"
                                                                : "bg-white border-[#B0C4DE]/50"
                                                                }`}
                                                        >
                                                            {selectedProtocolIds.includes(item.id) && (
                                                                <Check size={14} className="text-white stroke-[4px]" />
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 text-[12px] font-bold text-[#546E7A]">{item.name}</td>
                                                    <td className="text-[10px] text-center text-[#90A4AE] font-mono">{item.region}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    ))}
                                </table>
                            )}
                        </div>

                        {/* 摆位关联设置 */}
                        <div className="shrink-0 border-t-2 border-[#EEF2F9] bg-[#F8FAFC] px-4 pt-3 pb-4 flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-3 bg-[#4D94FF] rounded-full"></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-[#37474F]">
                                    摆位关联设置
                                </span>
                                <button
                                    onClick={() => setPositionGroupIndex((prev) => (prev === 0 ? 1 : 0))}
                                    title="切换摆位组"
                                    className="ml-auto w-[24px] h-[24px] rounded border border-[#B0C4DE] bg-white text-[#4D94FF] flex items-center justify-center hover:bg-blue-50 transition-colors"
                                >
                                    <ArrowLeftRight size={12} />
                                </button>
                            </div>
                            <div className="grid grid-cols-4 gap-3 h-[52px]">
                                {(positionGroupIndex === 0
                                    ? (["HFS", "FFS", "HFP", "FFP"] as const)
                                    : (["HFDR", "FFDR", "HFDL", "FFDL"] as const)
                                ).map((pos) => (
                                    <button
                                        key={pos}
                                        onClick={() => void handlePositioningChange(pos)}
                                        className={`h-full rounded-md border-2 font-black text-[13px] shadow-sm transition-all flex items-center justify-center ${activePositioning === pos
                                            ? "bg-white border-[#4D94FF] text-[#4D94FF] ring-2 ring-[#4D94FF]/10"
                                            : "bg-white border-[#B0C4DE]/40 text-[#B0C4DE] hover:border-[#B0C4DE]"
                                            }`}
                                    >
                                        {pos}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </aside >
            </main >

            {/* Footer */}
            < footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8" >
                <div className="flex-1">
                    {sessionActionError && (
                        <div className="mb-2 text-[12px] font-bold text-[#D32F2F]">{sessionActionError}</div>
                    )}
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-blue-50 transition-all uppercase text-[13px] shadow-sm active:scale-95"
                    >
                        <ChevronLeft size={20} /> 上一步
                    </button>
                </div>
                <div className="flex-1 flex justify-end">
                    <button
                        onClick={handleStartScanFlow}
                        disabled={isCreatingSession}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md uppercase text-[13px] transition-all ${isCreatingSession ? "bg-[#CBD5E1] text-white cursor-not-allowed shadow-none" : "bg-[#4D94FF] text-white shadow-lg hover:bg-blue-600 active:scale-95"}`}
                    >
                        {isCreatingSession ? "创建中..." : "下一步"} <ChevronRight size={20} />
                    </button>
                </div>
            </footer >

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#B0C4DE] w-[360px] overflow-hidden">
                        {/* Dialog Header */}
                        <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8E1] border-b border-[#FFE082]">
                            <div className="w-9 h-9 rounded-full bg-[#F57C00]/10 flex items-center justify-center shrink-0">
                                <AlertTriangle size={18} className="text-[#F57C00]" />
                            </div>
                            <div>
                                <div className="text-[14px] font-black text-[#37474F]">确认删除序列</div>
                                <div className="text-[11px] text-[#78909C] mt-0.5">此操作不可恢复</div>
                            </div>
                        </div>
                        {/* Dialog Body */}
                        <div className="px-5 py-4">
                            {checkedPlanIds.length > 0 && (
                                <>
                                    <p className="text-[13px] text-[#546E7A] leading-relaxed">
                                        即将移除以下 <span className="font-black text-[#D32F2F]">{checkedPlanIds.length}</span> 个协议：
                                    </p>
                                    <ul className="mt-2 flex flex-col gap-1.5">
                                        {scanPlans.filter((p) => checkedPlanIds.includes(p.id)).map((plan) => (
                                            <li key={plan.id} className="flex items-center gap-2 text-[12px] text-[#37474F] font-bold">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#D32F2F] shrink-0" />
                                                {plan.title}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}

                            {checkedSeqIds.length > 0 && (
                                <>
                                    <p className="text-[13px] text-[#546E7A] leading-relaxed mt-3">
                                        即将删除以下 <span className="font-black text-[#D32F2F]">{checkedSeqIds.length}</span> 个序列：
                                    </p>
                                    <ul className="mt-2 flex flex-col gap-1.5">
                                        {checkedSeqIds.map(id => {
                                            const seq = scanPlans.flatMap(p => p.sequences).find(s => s.id === id);
                                            return seq ? (
                                                <li key={id} className="flex items-center gap-2 text-[12px] text-[#37474F] font-bold">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#D32F2F] shrink-0" />
                                                    {seq.name}
                                                </li>
                                            ) : null;
                                        })}
                                    </ul>
                                </>
                            )}
                        </div>
                        {/* Dialog Footer */}
                        <div className="flex gap-2 px-5 pb-5">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="flex-1 h-[40px] bg-[#D32F2F] text-white font-bold rounded-lg text-[13px] hover:bg-red-700 shadow-md transition-all active:scale-95"
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

type ParamBoxProps = {
    label: string;
    value: string;
    highlight?: boolean;
    options?: string[];
    onChange?: (val: string) => void;
};

const ParamBox = ({ label, value, highlight = false, options, onChange }: ParamBoxProps) => (
    <div
        className={`p-2 rounded-md border flex flex-col items-center justify-center transition-all shadow-sm relative group ${highlight ? "bg-[#E3F2FD] border-[#4D94FF]" : "bg-white border-[#B0C4DE]/30"
            }`}
    >
        <span
            className={`text-[8px] font-black uppercase leading-none tracking-tighter ${highlight ? "text-[#4D94FF]" : "text-[#90A4AE]"
                }`}
        >
            {label}
        </span>
        {options ? (
            <div className="relative mt-1 flex items-center">
                <select
                    value={value}
                    onChange={(e) => onChange?.(e.target.value)}
                    className={`text-[14px] font-black font-mono bg-transparent appearance-none pr-3 cursor-pointer focus:outline-none ${highlight ? "text-[#1E88E5]" : "text-[#37474F]"
                        }`}
                >
                    {options.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
                <ChevronDown size={10} className="absolute right-0 pointer-events-none text-[#90A4AE] group-hover:text-[#4D94FF] transition-colors" />
            </div>
        ) : onChange ? (
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`mt-1 w-full bg-transparent text-center text-[14px] font-black font-mono focus:outline-none ${highlight ? "text-[#1E88E5]" : "text-[#37474F]"
                    }`}
            />
        ) : (
            <span
                className={`text-[14px] font-black font-mono mt-1 ${highlight ? "text-[#1E88E5]" : "text-[#37474F]"
                    }`}
            >
                {value}
            </span>
        )}
    </div>
);



export default ProtocolSetupScreen;
