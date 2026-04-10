export type ApiReconSeries = {
    id: number;
    recon_name: string;
    kernel: string;
    matrix: number;
    window_width: number;
    window_level: number;
    slice_thickness: number;
    increment?: number | null;
    recon_fov?: number | null;
    center_x?: number | null;
    center_y?: number | null;
};

export type ApiSeriesDetail = {
    id: number;
    series_type: "topogram" | "helical" | "axial" | "4d";
    series_label: string;
    topogram_param?: {
        id?: number;
        kv: number; ma: number; scan_length: number; tube_angle: number; fov: number;
        collimator?: string | null; scan_direction?: string | null; dom?: string | null;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    helical_param?: {
        id?: number;
        kv: number; ma: number; slice_thickness: number; pitch: number;
        rotation_time: number; scan_length: number; fov: number; auto_ma?: boolean;
        collimator?: string | null; scan_direction?: string | null; dom?: string | null;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    axial_param?: {
        id?: number;
        kv: number; ma: number; slice_thickness: number; slice_interval: number;
        rotation_time: number; scan_length: number; fov: number; step_count?: number | null;
        collimator?: string | null; scan_direction?: string | null; dom?: string | null;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    recon_series: ApiReconSeries[];
};

export type ApiProtocolDetail = {
    id: number;
    name: string;
    body_part: string;
    age_group: "adult" | "child" | "infant";
    patient_weight: string;
    patient_position: "HFS" | "FFS" | "HFP" | "FFP";
    table_direction: "in" | "out";
    scan_mode: "plain" | "contrast" | "4d";
    is_4d: boolean;
    is_enhance: boolean;
    description?: string | null;
    is_factory: boolean;
    series: ApiSeriesDetail[];
};

export type ApiProtocolSummary = {
    id: number;
    name: string;
    body_part: string;
    age_group: "adult" | "child" | "infant";
    patient_weight: string;
    patient_position: "HFS" | "FFS" | "HFP" | "FFP";
    table_direction: "in" | "out";
    scan_mode: "plain" | "contrast" | "4d";
    is_4d: boolean;
    is_enhance: boolean;
    description?: string | null;
    is_factory: boolean;
    series_count: number;
    supported_modes: ApiSeriesDetail["series_type"][];
};

export type Selection =
    | { type: "basic" }
    | { type: "dose" }
    | { type: "series"; seriesId: number }
    | { type: "recon"; seriesId: number; reconId: number };

export type BasicDraft = {
    name: string;
    bodyPart: string;
    ageGroup: "adult" | "child" | "infant";
    patientWeight: string;
    patientPosition: string;
};

export type SeriesDraft = {
    seriesLabel: string;
    kv: string;
    ma: string;
    scanLength: string;
    fov: string;
    tubeAngle: string;
    rotationTime: string;
    pitch: string;
    sliceThickness: string;
    sliceInterval: string;
    collimator: string;
    scanDirection: string;
    dom: string;
};

export type ReconDraft = {
    reconName: string;
    kernel: string;
    sliceThickness: string;
    increment: string;
    matrix: string;
    windowLevel: string;
    windowWidth: string;
    reconFov: string;
    centerX: string;
    centerY: string;
};
