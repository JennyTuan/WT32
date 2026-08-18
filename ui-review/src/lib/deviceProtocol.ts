import type { ApiScanSessionDetail, ApiScanSessionSeries } from "./scanSession";
import { DEFAULT_DFOV_MM } from "./fov";

type ScanParam = NonNullable<ApiScanSessionSeries["topogram_param"]>
    | NonNullable<ApiScanSessionSeries["helical_param"]>
    | NonNullable<ApiScanSessionSeries["axial_param"]>;

const seriesType = (series: ApiScanSessionSeries) => ({
    topogram: "Scan_Scout",
    helical: "Scan_Helical",
    axial: "Scan_Axial",
    "4d": "Scan_Axial",
}[series.series_type]);

const scanParam = (series: ApiScanSessionSeries): ScanParam | null =>
    series.topogram_param ?? series.helical_param ?? series.axial_param ?? null;

/** Convert the persisted scan-session snapshot into the supplied 0x0B plan shape. */
export const buildScanStartRequest = (session: ApiScanSessionDetail) => ({
    Command: "0x0B",
    PlanScanStartInfo: {
        PatientUID: String(session.patient_id),
        StudyInstanceUID: String(session.exam_id ?? session.id),
        BodyPartExamined: session.body_part,
        PatientPosition: session.patient_position,
        SeriesCollection: session.series.map((series) => {
            const params = scanParam(series);
            if (!params) throw new Error(`${series.series_label} lacks device scan parameters`);
            const planning = series.scan_planning;
            return {
                ScanSeriesUID: String(series.id),
                RawDataUID: `session-${session.id}-series-${series.id}`,
                Is4D: series.series_type === "4d",
                IsGate: session.acquisition_type === "gating",
                IsDom: params.dom === "1",
                IsBakGround: true,
                SeriesType: seriesType(series),
                ScanParams: {
                    ScanStart: planning?.range_min_position_mm ?? 0,
                    ScanEnd: planning?.range_max_position_mm ?? params.scan_length,
                    TableDirection: session.table_direction === "out" ? -1 : 1,
                    ScanInterval: "slice_interval" in params ? params.slice_interval : 0,
                    Pitch: "pitch" in params ? params.pitch : 1,
                    GantrySpeed: "rotation_time" in params ? params.rotation_time : 1,
                    GantryAngle: "tube_angle" in params ? params.tube_angle : 0,
                    NumOfScan: "step_count" in params ? (params.step_count ?? 0) : 0,
                    // 通讯协议约定的固定滤波器值；设备确认允许配置前不得由协议编辑页暴露。
                    BowtieType: "medium",
                    CollimatorType: params.collimator ?? "32*0.6",
                    mA: params.ma,
                    kV: params.kv,
                    FocusSize: params.focus_size === "large" ? 1 : 0,
                },
                ReconParamsCollection: series.recon_series.map((recon) => ({
                    ReconUID: String(recon.id),
                    KernelType: recon.kernel,
                    DFOV: recon.recon_fov ?? DEFAULT_DFOV_MM,
                    SliceThickness: recon.slice_thickness,
                    SliceInterval: recon.increment ?? recon.slice_thickness,
                    nImgRow: recon.matrix,
                    nImgColumn: recon.matrix,
                })),
            };
        }),
    },
});
