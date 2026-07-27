import { fetchSelectedScanSession } from "../../lib/scanSession";
import type { LanguageCode } from "../../lib/systemSettingsApi";
import type { 
    ApiProtocolSummary, 
    ApiSeriesDetail, 
    ApiProtocolDetail 
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const buildApiUrl = (path: string) => {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
};

export { buildApiUrl } from "../../lib/apiClient";

export const fetchProtocolCatalogWithFallback = async () => {
    const candidates = API_BASE_URL
  ? [buildApiUrl("/api/protocols/catalog")]
  : ["/api/protocols/catalog"];

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

const draftSeriesName = (seriesType: ApiSeriesDetail["series_type"], index: number, language: LanguageCode = "zh-CN") => {
    if (language === "en-US") {
        if (seriesType === "topogram") return `Localizer ${index}`;
        if (seriesType === "axial") return `Axial Scan ${index}`;
        return `Helical Scan ${index}`;
    }
    if (seriesType === "topogram") return `定位像 ${index}`;
    if (seriesType === "axial") return `断层扫描 ${index}`;
    return `螺旋扫描 ${index}`;
};

export const createDraftSeries = (
    id: number,
    seriesType: ApiSeriesDetail["series_type"],
    index: number,
    language?: LanguageCode,
    domEnabledByDefault = true,
): ApiSeriesDetail => {
    const dom = domEnabledByDefault ? "1" : "0";

    if (seriesType === "topogram") {
        return {
            id,
            series_type: "topogram",
            series_label: draftSeriesName(seriesType, index, language),
            topogram_param: {
                kv: 120,
                ma: 50,
                scan_length: 80,
                tube_angle: 270,
                fov: 500,
                collimator: "32*0.6",
                scan_direction: "HEAD_TO_FOOT",
                dom,
            },
            helical_param: null,
            axial_param: null,
            recon_series: [],
        };
    }

    if (seriesType === "axial") {
        return {
            id,
            series_type: "axial",
            series_label: draftSeriesName(seriesType, index, language),
            topogram_param: null,
            helical_param: null,
            axial_param: {
                kv: 120,
                ma: 150,
                slice_thickness: 5,
                slice_interval: 5,
                rotation_time: 1,
                scan_length: 120,
                fov: 350,
                step_count: 24,
                collimator: "32*0.6",
                scan_direction: "HEAD_TO_FOOT",
                dom,
                auto_ma: domEnabledByDefault,
            },
            recon_series: [],
        };
    }

    return {
        id,
        series_type: "helical",
        series_label: draftSeriesName(seriesType, index, language),
        topogram_param: null,
        helical_param: {
            kv: 120,
            ma: 180,
            slice_thickness: 1,
            pitch: 1,
            rotation_time: 1,
            scan_length: 120,
            fov: 350,
            auto_ma: domEnabledByDefault,
            collimator: "32*0.6",
            scan_direction: "HEAD_TO_FOOT",
            dom,
        },
        axial_param: null,
        recon_series: [],
    };
};

export const mapScanSessionToProtocolDetail = (scanSession: Awaited<ReturnType<typeof fetchSelectedScanSession>>): ApiProtocolDetail | null => {
    if (!scanSession) return null;

    return {
        id: scanSession.id,
        name: scanSession.name,
        body_part: scanSession.body_part,
        age_group: scanSession.age_group,
        patient_weight: scanSession.patient_weight,
        patient_position: scanSession.patient_position as ApiProtocolDetail["patient_position"],
        table_direction: scanSession.table_direction as ApiProtocolDetail["table_direction"],
        acquisition_type: scanSession.acquisition_type,
        scan_mode: scanSession.scan_mode,
        is_4d: scanSession.acquisition_type === "four_d",
        is_enhance: scanSession.scan_mode === "contrast",
        description: scanSession.description,
        is_factory: false,
        series: scanSession.series.map((series) => ({
            id: series.id,
            series_type: series.series_type,
            series_label: series.series_label,
            topogram_param: series.topogram_param
                ? {
                    kv: series.topogram_param.kv,
                    ma: series.topogram_param.ma,
                    scan_length: series.topogram_param.scan_length,
                    tube_angle: series.topogram_param.tube_angle,
                    fov: series.topogram_param.fov,
                    collimator: series.topogram_param.collimator,
                    scan_direction: series.topogram_param.scan_direction,
                    dom: series.topogram_param.dom,
                    ctdi_vol: series.topogram_param.ctdi_vol,
                    dlp: series.topogram_param.dlp,
                }
                : null,
            helical_param: series.helical_param
                ? {
                    kv: series.helical_param.kv,
                    ma: series.helical_param.ma,
                    slice_thickness: series.helical_param.slice_thickness,
                    pitch: series.helical_param.pitch,
                    rotation_time: series.helical_param.rotation_time,
                    scan_length: series.helical_param.scan_length,
                    fov: series.helical_param.fov,
                    collimator: series.helical_param.collimator,
                    scan_direction: series.helical_param.scan_direction,
                    dom: series.helical_param.dom,
                    auto_ma: series.helical_param.auto_ma,
                    ctdi_vol: series.helical_param.ctdi_vol,
                    dlp: series.helical_param.dlp,
                }
                : null,
            axial_param: series.axial_param
                ? {
                    kv: series.axial_param.kv,
                    ma: series.axial_param.ma,
                    slice_thickness: series.axial_param.slice_thickness,
                    slice_interval: series.axial_param.slice_interval,
                    rotation_time: series.axial_param.rotation_time,
                    scan_length: series.axial_param.scan_length,
                    fov: series.axial_param.fov,
                    collimator: series.axial_param.collimator,
                    scan_direction: series.axial_param.scan_direction,
                    dom: series.axial_param.dom,
                    step_count: series.axial_param.step_count,
                    ctdi_vol: series.axial_param.ctdi_vol,
                    dlp: series.axial_param.dlp,
                }
                : null,
            recon_series: series.recon_series.map((recon) => ({
                id: recon.id,
                recon_name: recon.recon_name,
                kernel: recon.kernel,
                matrix: recon.matrix,
                window_width: recon.window_width,
                window_level: recon.window_level,
                slice_thickness: recon.slice_thickness,
                increment: recon.increment,
                    recon_fov: recon.recon_fov,
                    center_x: recon.center_x,
                    center_y: recon.center_y,
                    metal_artifact_suppression: recon.metal_artifact_suppression,
            })),
        })),
    };
};

export const parseNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
};
