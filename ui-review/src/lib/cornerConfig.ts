import { buildApiUrl } from "./apiClient";

export type CornerItem = {
    key: string;
    label: string;
    visible: boolean;
};

export type CornerKey = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export type CornerConfigData = {
    corners: Record<CornerKey, CornerItem[]>;
};

/**
 * Fixed cornerstone.js / OHIF mainstream CT viewer overlay layout.
 * The set of fields per corner — and their order — is a UI invariant:
 * the user can only toggle visibility per-field, not add/remove/reorder.
 *
 * TL = patient identity
 * TR = study + institution
 * BL = acquisition parameters
 * BR = image state (Se/Im, zoom, window)
 */
export const CORNER_FIELD_CATALOG: Record<CornerKey, { key: string; label: string }[]> = {
    topLeft: [
        { key: "patient_name",    label: "姓名" },
        { key: "patient_id",      label: "ID" },
        { key: "patient_gender",  label: "性别" },
        { key: "patient_dob",     label: "出生日期" },
    ],
    topRight: [
        { key: "institution_name",  label: "机构" },
        { key: "study_description", label: "检查描述" },
        { key: "study_datetime",    label: "检查时间" },
        { key: "accession_number",  label: "登记号" },
    ],
    bottomLeft: [
        { key: "series_description", label: "序列描述" },
        { key: "slice_thickness",    label: "层厚" },
        { key: "slice_location",     label: "层位置" },
        { key: "kvp",                label: "kVp" },
        { key: "mas",                label: "mAs" },
    ],
    bottomRight: [
        { key: "image_index", label: "图像" },
        { key: "zoom",        label: "缩放" },
        { key: "window",      label: "窗宽/窗位" },
    ],
};

/**
 * Example values shown in the editor's hint row (raw, label-free).
 */
export const CORNER_FIELD_EXAMPLES: Record<string, string> = {
    patient_name:       "ZHANG SAN",
    patient_id:         "P20240101",
    patient_gender:     "M",
    patient_dob:        "1980-03-15",
    institution_name:   "示例医院",
    study_description:  "Chest CT",
    study_datetime:     "2026-05-27 09:28",
    accession_number:   "A20260527001",
    series_description: "Helical 5mm",
    slice_thickness:    "5.0 mm",
    slice_location:     "L 128.5 mm",
    kvp:                "120 kVp",
    mas:                "200 mAs",
    image_index:        "Se: 1  Im: 128/200",
    zoom:               "Zoom: 250%",
    window:             "W: 400  L: 40",
};

/**
 * What the field renders as in the actual viewport overlay.
 * Matches OHIF / cornerstone convention:
 *   - Patient identity is shown raw (no label prefix)
 *   - Inherently abbreviated values keep their short English prefix (Se: Im: W: L: Zoom: Acc# DOB:)
 *   - Units are baked into the value (kVp / mAs / mm)
 */
export const CORNER_FIELD_OVERLAY: Record<string, string> = {
    patient_name:       "ZHANG SAN",
    patient_id:         "ID: P20240101",
    patient_gender:     "Sex: M",
    patient_dob:        "DOB: 1980-03-15",
    institution_name:   "示例医院",
    study_description:  "Chest CT",
    study_datetime:     "2026-05-27 09:28",
    accession_number:   "Acc# A20260527001",
    series_description: "Helical 5mm",
    slice_thickness:    "Thk: 5.0 mm",
    slice_location:     "Loc: L 128.5 mm",
    kvp:                "120 kVp",
    mas:                "200 mAs",
    image_index:        "Se: 1  Im: 128/200",
    zoom:               "Zoom: 250%",
    window:             "W: 400  L: 40",
};

/**
 * Factory default — every field of every corner visible.
 */
export const CORNERSTONE_DEFAULT_CONFIG: CornerConfigData = {
    corners: {
        topLeft:     CORNER_FIELD_CATALOG.topLeft.map(f => ({ ...f, visible: true })),
        topRight:    CORNER_FIELD_CATALOG.topRight.map(f => ({ ...f, visible: true })),
        bottomLeft:  CORNER_FIELD_CATALOG.bottomLeft.map(f => ({ ...f, visible: true })),
        bottomRight: CORNER_FIELD_CATALOG.bottomRight.map(f => ({ ...f, visible: true })),
    },
};

/**
 * Coerce any loaded/stored config to the fixed schema:
 *   - drops keys not in the catalog (legacy fields like protocol_name, ma, scan_time)
 *   - restores missing keys with visible=true (so newly added catalog fields surface)
 *   - enforces catalog order (user cannot reorder)
 * Preserves the user's visibility choices for keys that still exist.
 */
export function normalizeCornerConfig(raw: unknown): CornerConfigData {
    const cornersIn = (raw as { corners?: Record<string, CornerItem[]> })?.corners ?? {};

    const buildCorner = (corner: CornerKey): CornerItem[] => {
        const stored = Array.isArray(cornersIn[corner]) ? cornersIn[corner] : [];
        const visibleByKey = new Map<string, boolean>();
        for (const item of stored) {
            if (item && typeof item.key === "string") {
                visibleByKey.set(item.key, item.visible !== false);
            }
        }
        return CORNER_FIELD_CATALOG[corner].map(f => ({
            ...f,
            visible: visibleByKey.has(f.key) ? !!visibleByKey.get(f.key) : true,
        }));
    };

    return {
        corners: {
            topLeft:     buildCorner("topLeft"),
            topRight:    buildCorner("topRight"),
            bottomLeft:  buildCorner("bottomLeft"),
            bottomRight: buildCorner("bottomRight"),
        },
    };
}

export type ApiCornerConfig = {
    id: number;
    template_name: string;
    is_active: boolean;
    config_json: string;
    created_at: string;
    updated_at?: string;
};

export const fetchCornerConfig = async (): Promise<ApiCornerConfig> => {
    const response = await fetch(buildApiUrl("/api/corners/"));
    if (!response.ok) {
        throw new Error(`Failed to fetch corner config: ${response.status}`);
    }
    return response.json();
};

export const saveCornerConfig = async (configJson: string, templateName: string = "Custom"): Promise<ApiCornerConfig> => {
    const response = await fetch(buildApiUrl("/api/corners/"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            template_name: templateName,
            config_json: configJson,
        }),
    });
    if (!response.ok) {
        throw new Error(`Failed to save corner config: ${response.status}`);
    }
    return response.json();
};

export const resetCornerConfig = async (): Promise<ApiCornerConfig> => {
    const response = await fetch(buildApiUrl("/api/corners/reset"), {
        method: "POST",
    });
    if (!response.ok) {
        throw new Error(`Failed to reset corner config: ${response.status}`);
    }
    return response.json();
};
