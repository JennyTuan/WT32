import type { ApiSeriesDetail } from "./types";
import type { LanguageCode } from "../../lib/systemSettingsApi";

export const AGE_LABEL: Record<string, string> = { adult: "成人", child: "儿童", infant: "婴儿" };
export const AGE_LABEL_EN: Record<string, string> = { adult: "Adult", child: "Child", infant: "Infant" };

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
    { id: "HFS",  label: "头先进-仰卧", labelEn: "Head first supine" },
    { id: "FFS",  label: "足先进-仰卧", labelEn: "Feet first supine" },
    { id: "HFP",  label: "头先进-俯卧", labelEn: "Head first prone" },
    { id: "FFP",  label: "足先进-俯卧", labelEn: "Feet first prone" },
    { id: "HFDR", label: "头先进-右侧卧", labelEn: "Head first right decubitus" },
    { id: "FFDR", label: "足先进-右侧卧", labelEn: "Feet first right decubitus" },
    { id: "HFDL", label: "头先进-左侧卧", labelEn: "Head first left decubitus" },
    { id: "FFDL", label: "足先进-左侧卧", labelEn: "Feet first left decubitus" },
];

export const getLocalizedAgeLabel = (age: string, language: LanguageCode) => (
    language === "en-US" ? AGE_LABEL_EN[age] : AGE_LABEL[age]
) ?? age;

export const getLocalizedSeriesTypeLabel = (type: string, language: LanguageCode) => {
    const label = SERIES_TYPE_LABEL[type];
    if (!label) return type.toUpperCase();
    return language === "en-US" ? label.en : label.zh;
};

export const getEditableSeriesTypeOptions = (language: LanguageCode) => (
    EDITABLE_SERIES_TYPES.map((type) => getLocalizedSeriesTypeLabel(type, language))
);

export const DETAIL_TARGET_STORAGE_KEY = "scanConfirmDetailTarget";
