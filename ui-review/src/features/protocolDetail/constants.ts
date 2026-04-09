import type { ApiSeriesDetail } from "./types";

export const AGE_LABEL: Record<string, string> = { adult: "成人", child: "儿童", infant: "婴儿" };

export const SERIES_TYPE_LABEL: Record<string, { zh: string; en: string }> = {
    topogram: { zh: "定位像", en: "LOCALIZER" },
    helical:  { zh: "螺旋扫描", en: "HELICAL" },
    axial:    { zh: "轴位扫描", en: "AXIAL" },
    "4d":     { zh: "4D 扫描",  en: "4D" },
};

export const EDITABLE_SERIES_TYPES: ApiSeriesDetail["series_type"][] = ["topogram", "helical", "axial"];

export const EDITABLE_SERIES_TYPE_OPTIONS = EDITABLE_SERIES_TYPES.map(
    (type) => SERIES_TYPE_LABEL[type].zh
);

export const ALL_POSITIONS = [
    { id: "HFS",  label: "头先进-仰卧" },
    { id: "FFS",  label: "足先进-仰卧" },
    { id: "HFP",  label: "头先进-俯卧" },
    { id: "FFP",  label: "足先进-俯卧" },
    { id: "HFDR", label: "头先进-右侧卧" },
    { id: "FFDR", label: "足先进-右侧卧" },
    { id: "HFDL", label: "头先进-左侧卧" },
    { id: "FFDL", label: "足先进-左侧卧" },
];

export const DETAIL_TARGET_STORAGE_KEY = "scanConfirmDetailTarget";
