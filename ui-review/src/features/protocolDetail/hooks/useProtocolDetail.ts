import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "../../../lib/i18nContext";
import type { 
    ApiProtocolDetail, 
    ApiProtocolSummary, 
    ApiSeriesDetail, 
    Selection, 
    BasicDraft, 
    SeriesDraft, 
    ReconDraft 
} from "../types";
import { 
    DETAIL_TARGET_STORAGE_KEY, 
    SERIES_TYPE_LABEL, 
    EDITABLE_SERIES_TYPES,
    getLocalizedAgeLabel,
    getLocalizedSeriesTypeLabel
} from "../constants";
import { 
    fetchProtocolCatalogWithFallback, 
    mapScanSessionToProtocolDetail, 
    buildApiUrl, 
    createDraftSeries,
    parseNumber
} from "../api";
import {
    fetchSelectedScanSession,
    loadSelectedScanSessionId,
    createAdHocScanSessionForSelectedPatient,
    createScanSessionSeries,
    createScanSessionReconSeries,
    deleteSelectedScanSessionSeries,
    deleteSelectedScanSessionReconSeries,
    updateSelectedScanSession,
    updateSelectedScanSessionSeries,
    updateSelectedScanSessionTopogramParam,
    updateSelectedScanSessionHelicalParam,
    updateSelectedScanSessionAxialParam,
    updateSelectedScanSessionReconSeries
} from "../../../lib/scanSession";

export function useProtocolDetail() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { language, t } = useI18n();
    
    // URL Params
    const isNewMode = searchParams.get("mode") === "new";
    const isViewMode = searchParams.get("mode") === "view";
    const source = searchParams.get("source");
    const isCatalogSource = source === "catalog";
    const protocolId = searchParams.get("id");

    // State
    const [protocol, setProtocol] = useState<ApiProtocolDetail | null>(null);
    const [catalogProtocols, setCatalogProtocols] = useState<ApiProtocolSummary[]>([]);
    const [selectedPos, setSelectedPos] = useState("HFS");
    const [selection, setSelection] = useState<Selection>({ type: "basic" });
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const tempSeriesIdRef = useRef(-1);
    // Snapshot of IDs from the last backend load (scan-flow mode). Used at save-time to compute
    // which series / recons were locally deleted so we can DELETE them on the backend.
    const originalSnapshotRef = useRef<{ seriesIds: Set<number>; reconIdsBySeriesId: Map<number, Set<number>> }>({
        seriesIds: new Set(),
        reconIdsBySeriesId: new Map(),
    });

    // Derived
    const isFactory = protocol?.is_factory === true;
    const isReadOnly = isViewMode || (isCatalogSource && isFactory);
    const series = useMemo(() => protocol?.series ?? [], [protocol?.series]);
    const ageLabel = protocol ? getLocalizedAgeLabel(protocol.age_group, language) : "-";

    const activeSeries = (selection.type === "series" || selection.type === "recon")
        ? series.find((item) => item.id === selection.seriesId) ?? null
        : null;
    const activeRecon = selection.type === "recon" && activeSeries
        ? activeSeries.recon_series.find((item) => item.id === selection.reconId) ?? null
        : null;

    // Form Drafts
    const [basicDraft, setBasicDraft] = useState<BasicDraft>({ 
        name: "", bodyPart: "", ageGroup: "adult", patientWeight: "", patientPosition: "HFS" 
    });
    const [seriesDraft, setSeriesDraft] = useState<SeriesDraft>({
        seriesLabel: "", kv: "", ma: "", scanLength: "", fov: "", tubeAngle: "",
        rotationTime: "", pitch: "", sliceThickness: "", sliceInterval: "",
        collimator: "", scanDirection: "OUT", dom: "0",
    });
    const [reconDraft, setReconDraft] = useState<ReconDraft>({
        reconName: "", kernel: "", sliceThickness: "", increment: "",
        matrix: "", windowLevel: "", windowWidth: "", reconFov: "250",
        centerX: "0", centerY: "0",
    });

    const bodyPartOptions = useMemo(() => {
        const options = Array.from(new Set(catalogProtocols.map((item) => item.body_part.trim()).filter(Boolean)));
        if (options.length > 0) return options;
        if (protocol?.body_part) return [protocol.body_part];
        return [];
    }, [catalogProtocols, protocol?.body_part]);

    const ageGroupOptions = useMemo<BasicDraft["ageGroup"][]>(() => {
        const options = Array.from(new Set(catalogProtocols.map((item) => item.age_group))) as BasicDraft["ageGroup"][];
        if (options.length > 0) return options;
        if (protocol?.age_group) return [protocol.age_group as BasicDraft["ageGroup"]];
        return ["adult"];
    }, [catalogProtocols, protocol?.age_group]);

    // Initial load: catalog
    useEffect(() => {
        let cancelled = false;
        const loadCatalog = async () => {
            try {
                const data = await fetchProtocolCatalogWithFallback();
                if (!cancelled) setCatalogProtocols(data);
            } catch (error) {
                console.error(error);
                if (!cancelled) setCatalogProtocols([]);
            }
        };
        loadCatalog();
        return () => { cancelled = true; };
    }, []);

    const captureOriginalSnapshot = (mapped: ApiProtocolDetail) => {
        const seriesIds = new Set<number>();
        const reconIdsBySeriesId = new Map<number, Set<number>>();
        for (const s of mapped.series) {
            seriesIds.add(s.id);
            reconIdsBySeriesId.set(s.id, new Set(s.recon_series.map((r) => r.id)));
        }
        originalSnapshotRef.current = { seriesIds, reconIdsBySeriesId };
    };

    const syncProtocolFromSession = async () => {
        const scanSession = await fetchSelectedScanSession();
        const mappedSession = mapScanSessionToProtocolDetail(scanSession);
        if (mappedSession) {
            setProtocol(mappedSession);
            setSelectedPos(mappedSession.patient_position || "HFS");
            captureOriginalSnapshot(mappedSession);
            return true;
        }
        return false;
    };

    // Initial load: protocol source
    useEffect(() => {
        if (isNewMode) {
            setProtocol({
                id: 0, name: t("protocolDetail.newProtocol"), body_part: bodyPartOptions[0] || "",
                age_group: "adult", patient_weight: "50-90kg", patient_position: "HFS",
                table_direction: "in", scan_mode: "plain",
                acquisition_type: "regular",
                is_4d: false, is_enhance: false,
                is_factory: false,
                series: [],
            });
            return;
        }

        let cancelled = false;
        const loadProtocolSource = async () => {
            try {
                if (isCatalogSource && protocolId) {
                    const res = await fetch(buildApiUrl(`/api/protocols/${protocolId}`));
                    if (res.ok) {
                        const data = await res.json();
                        if (!cancelled) {
                            setProtocol(data);
                            if (data.patient_position) setSelectedPos(data.patient_position);
                            return;
                        }
                    }
                }
                const synced = await syncProtocolFromSession();
                if (!cancelled && synced) return;
            } catch (error) { console.error(error); }

            const raw = localStorage.getItem("selectedProtocol");
            if (!raw || cancelled) return;
            try {
                const parsed = JSON.parse(raw) as ApiProtocolDetail;
                if (!cancelled) {
                    setProtocol(parsed);
                    if (parsed.patient_position) setSelectedPos(parsed.patient_position);
                }
            } catch { /* ignore */ }
        };
        loadProtocolSource();
        return () => { cancelled = true; };
    }, [isNewMode, isCatalogSource, protocolId, bodyPartOptions, t]);

    // Update basicDraft when protocol changes
    useEffect(() => {
        if (!protocol) return;
        setBasicDraft({
            name: protocol.name ?? "",
            bodyPart: protocol.body_part || bodyPartOptions[0] || "",
            ageGroup: (protocol.age_group ?? ageGroupOptions[0] ?? "adult") as BasicDraft["ageGroup"],
            patientWeight: protocol.patient_weight ?? "",
            patientPosition: protocol.patient_position ?? selectedPos,
        });
    }, [protocol?.id, bodyPartOptions, ageGroupOptions]);

    // Handle deep link selection
    useEffect(() => {
        if (!protocol || series.length === 0) return;
        const detailTarget = localStorage.getItem(DETAIL_TARGET_STORAGE_KEY);
        if (!detailTarget) return;
        const targetSeries = series.find((item) => item.series_type === detailTarget);
        if (targetSeries) setSelection({ type: "series", seriesId: targetSeries.id });
        localStorage.removeItem(DETAIL_TARGET_STORAGE_KEY);
    }, [protocol, series]);

    // Update seriesDraft when activeSeries changes
    useEffect(() => {
        if (!activeSeries || selection.type !== "series") return;
        setSeriesDraft({
            seriesLabel: activeSeries.series_label ?? "",
            kv: String(activeSeries.topogram_param?.kv ?? activeSeries.helical_param?.kv ?? activeSeries.axial_param?.kv ?? ""),
            ma: String(activeSeries.topogram_param?.ma ?? activeSeries.helical_param?.ma ?? activeSeries.axial_param?.ma ?? ""),
            scanLength: String(activeSeries.topogram_param?.scan_length ?? activeSeries.helical_param?.scan_length ?? activeSeries.axial_param?.scan_length ?? ""),
            fov: String(activeSeries.topogram_param?.fov ?? activeSeries.helical_param?.fov ?? activeSeries.axial_param?.fov ?? ""),
            tubeAngle: String(activeSeries.topogram_param?.tube_angle ?? ""),
            rotationTime: String(activeSeries.helical_param?.rotation_time ?? activeSeries.axial_param?.rotation_time ?? ""),
            pitch: String(activeSeries.helical_param?.pitch ?? ""),
            sliceThickness: String(activeSeries.helical_param?.slice_thickness ?? activeSeries.axial_param?.slice_thickness ?? ""),
            sliceInterval: String(activeSeries.axial_param?.slice_interval ?? ""),
            collimator: String(activeSeries.topogram_param?.collimator ?? activeSeries.helical_param?.collimator ?? activeSeries.axial_param?.collimator ?? ""),
            scanDirection: String(activeSeries.topogram_param?.scan_direction ?? activeSeries.helical_param?.scan_direction ?? activeSeries.axial_param?.scan_direction ?? "OUT"),
            dom: String(activeSeries.topogram_param?.dom ?? activeSeries.helical_param?.dom ?? activeSeries.axial_param?.dom ?? "0"),
        });
    }, [activeSeries, selection.type]);

    // Update reconDraft when activeRecon changes
    useEffect(() => {
        if (!activeRecon || selection.type !== "recon") return;
        setReconDraft({
            reconName: activeRecon.recon_name ?? "",
            kernel: activeRecon.kernel ?? "",
            sliceThickness: String(activeRecon.slice_thickness ?? ""),
            increment: String(activeRecon.increment ?? activeRecon.slice_thickness ?? ""),
            matrix: String(activeRecon.matrix ?? ""),
            windowLevel: String(activeRecon.window_level ?? ""),
            windowWidth: String(activeRecon.window_width ?? ""),
            reconFov: String(activeRecon.recon_fov ?? "250"),
            centerX: String(activeRecon.center_x ?? "0"),
            centerY: String(activeRecon.center_y ?? "0"),
        });
    }, [activeRecon, selection.type]);

    // Handlers — add/delete operate on local React state in both modes.
    // In scan flow, the structural diff is applied on Save (see handleSave); Cancel discards.
    const appendDraftSeries = (seriesType: ApiSeriesDetail["series_type"]) => {
        const nextId = tempSeriesIdRef.current;
        tempSeriesIdRef.current -= 1;
        setProtocol((current) => {
            if (!current) return current;
            const existingCount = current.series.filter((item) => item.series_type === seriesType).length;
            const createdSeries = createDraftSeries(nextId, seriesType, existingCount + 1, language);
            return { ...current, series: [...current.series, createdSeries] };
        });
        setSelection({ type: "series", seriesId: nextId });
    };

    const appendDraftRecon = (seriesId: number) => {
        const nextId = tempSeriesIdRef.current;
        tempSeriesIdRef.current -= 1;
        setProtocol((current) => {
            if (!current) return current;
            return {
                ...current,
                series: current.series.map((item) => {
                    if (item.id !== seriesId) return item;
                    const nextReconIndex = item.recon_series.length + 1;
                    return {
                        ...item,
                        recon_series: [
                            ...item.recon_series,
                            {
                                id: nextId, recon_name: t("protocolDetail.defaultReconName", { index: nextReconIndex }), kernel: "STANDARD",
                                matrix: 512, window_width: 400, window_level: 40,
                                slice_thickness: 1, increment: 1,
                            },
                        ],
                    };
                }),
            };
        });
        setSelection({ type: "recon", seriesId, reconId: nextId });
    };

    const handleDeleteActiveSeries = () => {
        if (!activeSeries) return;
        const remainingSeries = series.filter((seriesItem) => seriesItem.id !== activeSeries.id);
        setProtocol((current) => current ? { ...current, series: remainingSeries } : null);
        if (remainingSeries.length > 0) {
            setSelection({ type: "series", seriesId: remainingSeries[0].id });
        } else {
            setSelection({ type: "basic" });
        }
    };

    const handleDeleteActiveRecon = () => {
        if (!activeSeries || !activeRecon) return;
        setProtocol((current) => {
            if (!current) return current;
            return {
                ...current,
                series: current.series.map((seriesItem) => (
                    seriesItem.id !== activeSeries.id
                        ? seriesItem
                        : {
                            ...seriesItem,
                            recon_series: seriesItem.recon_series.filter((reconItem) => reconItem.id !== activeRecon.id),
                        }
                )),
            };
        });
        const remainingRecon = activeSeries.recon_series.filter((reconItem) => reconItem.id !== activeRecon.id);
        if (remainingRecon.length > 0) {
            setSelection({ type: "recon", seriesId: activeSeries.id, reconId: remainingRecon[0].id });
        } else {
            setSelection({ type: "series", seriesId: activeSeries.id });
        }
    };

    const handleSeriesModeChange = (modeLabel: string) => {
        if (!isNewMode || !activeSeries) return;
        const nextType = EDITABLE_SERIES_TYPES.find((type) => (
            getLocalizedSeriesTypeLabel(type, language) === modeLabel ||
            SERIES_TYPE_LABEL[type].zh === modeLabel ||
            SERIES_TYPE_LABEL[type].en === modeLabel
        ));
        if (!nextType || nextType === activeSeries.series_type) return;

        setProtocol((current) => {
            if (!current) return current;
            return {
                ...current,
                series: current.series.map((seriesItem) => {
                    if (seriesItem.id !== activeSeries.id) return seriesItem;
                    const renamedLabel =
                        nextType === "topogram"
                            ? seriesItem.series_label.replace(/螺旋扫描|断层扫描|Helical Scan|Axial Scan/g, language === "en-US" ? "Localizer" : "定位像")
                            : nextType === "helical"
                                ? seriesItem.series_label.replace(/定位像|断层扫描|Localizer|Axial Scan/g, language === "en-US" ? "Helical Scan" : "螺旋扫描")
                                : seriesItem.series_label.replace(/定位像|螺旋扫描|Localizer|Helical Scan/g, language === "en-US" ? "Axial Scan" : "断层扫描");

                    return {
                        ...seriesItem,
                        series_type: nextType, series_label: renamedLabel,
                        topogram_param: nextType === "topogram" ? (seriesItem.topogram_param ?? { kv: 120, ma: 50, scan_length: 80, tube_angle: 270, fov: 500 }) : null,
                        helical_param: nextType === "helical" ? (seriesItem.helical_param ?? { kv: 120, ma: 180, slice_thickness: 1, pitch: 1, rotation_time: 1, scan_length: 120, fov: 350, auto_ma: false }) : null,
                        axial_param: nextType === "axial" ? (seriesItem.axial_param ?? { kv: 120, ma: 150, slice_thickness: 5, slice_interval: 5, rotation_time: 1, scan_length: 120, fov: 350, step_count: 24 }) : null,
                    };
                }),
            };
        });
    };

    const saveToCatalog = async () => {
        if (!protocol) return;
        setIsSaving(true);
        setSaveMessage(null);

        try {
            const finalSeries = series.map((s, idx) => {
                const isSeriesActive = (selection.type === "series" || selection.type === "recon") && s.id === selection.seriesId;
                const activeRId = selection.type === "recon" ? selection.reconId : undefined;
                const sLabel = (isSeriesActive && selection.type === "series") ? seriesDraft.seriesLabel.trim() : s.series_label;
                
                return {
                    series_order: idx + 1,
                    series_type: s.series_type,
                    series_label: sLabel || s.series_label,
                    topogram_param: s.topogram_param ? {
                        kv: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.kv) ?? s.topogram_param.kv) : s.topogram_param.kv,
                        ma: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.ma) ?? s.topogram_param.ma) : s.topogram_param.ma,
                        scan_length: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.scanLength) ?? s.topogram_param.scan_length) : s.topogram_param.scan_length,
                        tube_angle: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.tubeAngle) ?? s.topogram_param.tube_angle) : s.topogram_param.tube_angle,
                        fov: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.fov) ?? s.topogram_param.fov) : s.topogram_param.fov,
                        collimator: (isSeriesActive && selection.type === "series") ? (seriesDraft.collimator || s.topogram_param.collimator) : s.topogram_param.collimator,
                        scan_direction: (isSeriesActive && selection.type === "series") ? (seriesDraft.scanDirection || s.topogram_param.scan_direction) : s.topogram_param.scan_direction,
                        dom: (isSeriesActive && selection.type === "series") ? (seriesDraft.dom || s.topogram_param.dom) : s.topogram_param.dom,
                    } : null,
                    helical_param: s.helical_param ? {
                        kv: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.kv) ?? s.helical_param.kv) : s.helical_param.kv,
                        ma: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.ma) ?? s.helical_param.ma) : s.helical_param.ma,
                        slice_thickness: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.sliceThickness) ?? s.helical_param.slice_thickness) : s.helical_param.slice_thickness,
                        pitch: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.pitch) ?? s.helical_param.pitch) : s.helical_param.pitch,
                        rotation_time: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.rotationTime) ?? s.helical_param.rotation_time) : s.helical_param.rotation_time,
                        scan_length: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.scanLength) ?? s.helical_param.scan_length) : s.helical_param.scan_length,
                        fov: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.fov) ?? s.helical_param.fov) : s.helical_param.fov,
                        auto_ma: s.helical_param.auto_ma,
                        collimator: (isSeriesActive && selection.type === "series") ? (seriesDraft.collimator || s.helical_param.collimator) : s.helical_param.collimator,
                        scan_direction: (isSeriesActive && selection.type === "series") ? (seriesDraft.scanDirection || s.helical_param.scan_direction) : s.helical_param.scan_direction,
                        dom: (isSeriesActive && selection.type === "series") ? (seriesDraft.dom || s.helical_param.dom) : s.helical_param.dom,
                    } : null,
                    axial_param: s.axial_param ? {
                        kv: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.kv) ?? s.axial_param.kv) : s.axial_param.kv,
                        ma: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.ma) ?? s.axial_param.ma) : s.axial_param.ma,
                        slice_thickness: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.sliceThickness) ?? s.axial_param.slice_thickness) : s.axial_param.slice_thickness,
                        slice_interval: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.sliceInterval) ?? s.axial_param.slice_interval) : s.axial_param.slice_interval,
                        rotation_time: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.rotationTime) ?? s.axial_param.rotation_time) : s.axial_param.rotation_time,
                        scan_length: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.scanLength) ?? s.axial_param.scan_length) : s.axial_param.scan_length,
                        fov: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.fov) ?? s.axial_param.fov) : s.axial_param.fov,
                        step_count: s.axial_param.step_count,
                        collimator: (isSeriesActive && selection.type === "series") ? (seriesDraft.collimator || s.axial_param.collimator) : s.axial_param.collimator,
                        scan_direction: (isSeriesActive && selection.type === "series") ? (seriesDraft.scanDirection || s.axial_param.scan_direction) : s.axial_param.scan_direction,
                        dom: (isSeriesActive && selection.type === "series") ? (seriesDraft.dom || s.axial_param.dom) : s.axial_param.dom,
                    } : null,
                    recon_series: s.recon_series.map(r => {
                        const isReconActive = isSeriesActive && selection.type === "recon" && r.id === activeRId;
                        return {
                            recon_name: isReconActive ? (reconDraft.reconName.trim() || r.recon_name) : r.recon_name,
                            recon_type: "soft",
                            kernel: isReconActive ? (reconDraft.kernel.trim() || r.kernel) : r.kernel,
                            matrix: isReconActive ? (parseNumber(reconDraft.matrix) ?? r.matrix) : r.matrix,
                            window_width: isReconActive ? (parseNumber(reconDraft.windowWidth) ?? r.window_width) : r.window_width,
                            window_level: isReconActive ? (parseNumber(reconDraft.windowLevel) ?? r.window_level) : r.window_level,
                            slice_thickness: isReconActive ? (parseNumber(reconDraft.sliceThickness) ?? r.slice_thickness) : r.slice_thickness,
                            increment: isReconActive ? (parseNumber(reconDraft.increment) ?? r.increment) : r.increment,
                            recon_fov: isReconActive ? (parseNumber(reconDraft.reconFov) ?? r.recon_fov ?? 250) : (r.recon_fov ?? 250),
                            center_x: isReconActive ? (parseNumber(reconDraft.centerX) ?? r.center_x ?? 0) : (r.center_x ?? 0),
                            center_y: isReconActive ? (parseNumber(reconDraft.centerY) ?? r.center_y ?? 0) : (r.center_y ?? 0),
                        };
                    })
                };
            });

            const payload = {
                name: basicDraft.name.trim() || protocol.name,
                body_part: basicDraft.bodyPart, age_group: basicDraft.ageGroup,
                patient_weight: basicDraft.patientWeight.trim(), patient_position: basicDraft.patientPosition,
                table_direction: protocol.table_direction || "in", scan_mode: protocol.scan_mode || "plain",
                acquisition_type: protocol.acquisition_type || "regular",
                description: protocol.description || "", series: finalSeries
            };

            const url = isNewMode ? buildApiUrl("/api/protocols/full") : buildApiUrl(`/api/protocols/${protocolId}/full`);
            const response = await fetch(url, {
                method: isNewMode ? "POST" : "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(t("protocolDetail.saveCatalogFailed"));
            setSaveMessage(t("protocolDetail.saveUpdated"));
            setTimeout(() => navigate(-1), 1000);
        } catch { setSaveMessage(t("protocolDetail.saveFailed")); } finally { setIsSaving(false); }
    };

    const handleSave = async () => {
        if (!protocol) return;
        if (isCatalogSource) { await saveToCatalog(); return; }

        setIsSaving(true);
        setSaveMessage(null);
        try {
            if (isNewMode) {
                // Ad hoc logic...
                const sourceProtocolId = catalogProtocols.find((item) => item.body_part === basicDraft.bodyPart && item.age_group === basicDraft.ageGroup)?.id ?? catalogProtocols[0]?.id;
                if (!sourceProtocolId) throw new Error("No protocol catalog available for ad hoc scan session");
                const sessionScanMode =
                    protocol.acquisition_type === "four_d"
                        ? "4d"
                        : protocol.scan_mode === "contrast"
                            ? "contrast"
                            : "plain";

                const savedSession = await createAdHocScanSessionForSelectedPatient({
                    source_protocol_id: sourceProtocolId,
                    session_name: basicDraft.name.trim() || protocol.name,
                    name: basicDraft.name.trim() || protocol.name,
                    body_part: basicDraft.bodyPart, age_group: basicDraft.ageGroup,
                    patient_weight: basicDraft.patientWeight.trim(), patient_position: basicDraft.patientPosition,
                    table_direction: protocol.table_direction || "in", scan_mode: sessionScanMode,
                    acquisition_type: protocol.acquisition_type || "regular",
                    description: protocol.description ?? null,
                });

                for (const [index, s] of series.entries()) {
                    await createScanSessionSeries(savedSession.id, {
                        series_order: index + 1, series_type: s.series_type, series_label: s.series_label,
                        topogram_param: s.topogram_param, helical_param: s.helical_param, axial_param: s.axial_param,
                        recon_series: s.recon_series,
                    });
                }
                navigate(-1); return;
            }

            // Apply structural diff (deletes + creates) staged in local state
            const scanSessionId = loadSelectedScanSessionId();
            if (scanSessionId) {
                const snapshot = originalSnapshotRef.current;
                const currentSeriesIds = new Set(series.map((s) => s.id));

                // 1. Delete series removed locally
                for (const origSeriesId of snapshot.seriesIds) {
                    if (!currentSeriesIds.has(origSeriesId)) {
                        await deleteSelectedScanSessionSeries(origSeriesId);
                    }
                }

                // 2. For each kept original series, delete its locally-removed recons
                for (const s of series) {
                    if (s.id < 0) continue;
                    const origRecons = snapshot.reconIdsBySeriesId.get(s.id) ?? new Set<number>();
                    const currentReconIds = new Set(s.recon_series.map((r) => r.id));
                    for (const origReconId of origRecons) {
                        if (!currentReconIds.has(origReconId)) {
                            await deleteSelectedScanSessionReconSeries(origReconId);
                        }
                    }
                }

                // 3. Create newly-added series (negative IDs)
                for (let i = 0; i < series.length; i++) {
                    const s = series[i];
                    if (s.id >= 0) continue;
                    await createScanSessionSeries(scanSessionId, {
                        series_order: i + 1,
                        series_type: s.series_type,
                        series_label: s.series_label,
                        topogram_param: s.topogram_param,
                        helical_param: s.helical_param,
                        axial_param: s.axial_param,
                        recon_series: s.recon_series.map((r) => ({
                            recon_name: r.recon_name,
                            recon_type: "soft",
                            kernel: r.kernel,
                            matrix: r.matrix,
                            window_width: r.window_width,
                            window_level: r.window_level,
                            slice_thickness: r.slice_thickness,
                            increment: r.increment ?? r.slice_thickness,
                        })),
                    });
                }

                // 4. For each kept original series, create newly-added recons (negative IDs)
                for (const s of series) {
                    if (s.id < 0) continue;
                    for (const r of s.recon_series) {
                        if (r.id >= 0) continue;
                        await createScanSessionReconSeries(s.id, {
                            recon_name: r.recon_name,
                            recon_type: "soft",
                            kernel: r.kernel,
                            matrix: r.matrix,
                            window_width: r.window_width,
                            window_level: r.window_level,
                            slice_thickness: r.slice_thickness,
                            increment: r.increment ?? r.slice_thickness,
                        });
                    }
                }
            }

            await updateSelectedScanSession({
                name: basicDraft.name.trim() || protocol.name, body_part: basicDraft.bodyPart,
                age_group: basicDraft.ageGroup, patient_weight: basicDraft.patientWeight.trim(),
                patient_position: basicDraft.patientPosition,
            });

            // Skip param update if the active item is a locally-created one (id < 0) —
            // its values were already persisted via the create call above.
            if (selection.type === "series" && activeSeries && activeSeries.id >= 0) {
                await updateSelectedScanSessionSeries(activeSeries.id, { series_label: seriesDraft.seriesLabel.trim() || activeSeries.series_label });
                if (activeSeries.series_type === "topogram" && activeSeries.topogram_param?.id) {
                    await updateSelectedScanSessionTopogramParam(activeSeries.topogram_param.id, {
                        kv: parseNumber(seriesDraft.kv) ?? activeSeries.topogram_param.kv,
                        ma: parseNumber(seriesDraft.ma) ?? activeSeries.topogram_param.ma,
                        scan_length: parseNumber(seriesDraft.scanLength) ?? activeSeries.topogram_param.scan_length,
                        fov: parseNumber(seriesDraft.fov) ?? activeSeries.topogram_param.fov,
                        tube_angle: parseNumber(seriesDraft.tubeAngle) ?? activeSeries.topogram_param.tube_angle,
                        collimator: seriesDraft.collimator || activeSeries.topogram_param.collimator || null,
                        scan_direction: seriesDraft.scanDirection || activeSeries.topogram_param.scan_direction || null,
                        dom: seriesDraft.dom || activeSeries.topogram_param.dom || null,
                    });
                }
                if (activeSeries.series_type === "helical" && activeSeries.helical_param?.id) {
                    await updateSelectedScanSessionHelicalParam(activeSeries.helical_param.id, {
                        kv: parseNumber(seriesDraft.kv) ?? activeSeries.helical_param.kv,
                        ma: parseNumber(seriesDraft.ma) ?? activeSeries.helical_param.ma,
                        scan_length: parseNumber(seriesDraft.scanLength) ?? activeSeries.helical_param.scan_length,
                        fov: parseNumber(seriesDraft.fov) ?? activeSeries.helical_param.fov,
                        rotation_time: parseNumber(seriesDraft.rotationTime) ?? activeSeries.helical_param.rotation_time,
                        pitch: parseNumber(seriesDraft.pitch) ?? activeSeries.helical_param.pitch,
                        slice_thickness: parseNumber(seriesDraft.sliceThickness) ?? activeSeries.helical_param.slice_thickness,
                        collimator: seriesDraft.collimator || activeSeries.helical_param.collimator || null,
                        scan_direction: seriesDraft.scanDirection || activeSeries.helical_param.scan_direction || null,
                        dom: seriesDraft.dom || activeSeries.helical_param.dom || null,
                    });
                }
                if (activeSeries.series_type === "axial" && activeSeries.axial_param?.id) {
                    await updateSelectedScanSessionAxialParam(activeSeries.axial_param.id, {
                        kv: parseNumber(seriesDraft.kv) ?? activeSeries.axial_param.kv,
                        ma: parseNumber(seriesDraft.ma) ?? activeSeries.axial_param.ma,
                        scan_length: parseNumber(seriesDraft.scanLength) ?? activeSeries.axial_param.scan_length,
                        fov: parseNumber(seriesDraft.fov) ?? activeSeries.axial_param.fov,
                        rotation_time: parseNumber(seriesDraft.rotationTime) ?? activeSeries.axial_param.rotation_time,
                        slice_interval: parseNumber(seriesDraft.sliceInterval) ?? activeSeries.axial_param.slice_interval,
                        slice_thickness: parseNumber(seriesDraft.sliceThickness) ?? activeSeries.axial_param.slice_thickness,
                        collimator: seriesDraft.collimator || activeSeries.axial_param.collimator || null,
                        scan_direction: seriesDraft.scanDirection || activeSeries.axial_param.scan_direction || null,
                        dom: seriesDraft.dom || activeSeries.axial_param.dom || null,
                    });
                }
            } else if (selection.type === "recon" && activeRecon && activeRecon.id >= 0) {
                await updateSelectedScanSessionReconSeries(activeRecon.id, {
                    recon_name: reconDraft.reconName.trim() || activeRecon.recon_name,
                    kernel: reconDraft.kernel.trim() || activeRecon.kernel,
                    slice_thickness: parseNumber(reconDraft.sliceThickness) ?? activeRecon.slice_thickness,
                    increment: parseNumber(reconDraft.increment) ?? activeRecon.increment ?? activeRecon.slice_thickness,
                    matrix: parseNumber(reconDraft.matrix) ?? activeRecon.matrix,
                    window_level: parseNumber(reconDraft.windowLevel) ?? activeRecon.window_level,
                    window_width: parseNumber(reconDraft.windowWidth) ?? activeRecon.window_width,
                    recon_fov: parseNumber(reconDraft.reconFov) ?? activeRecon.recon_fov ?? 250,
                    center_x: parseNumber(reconDraft.centerX) ?? activeRecon.center_x ?? 0,
                    center_y: parseNumber(reconDraft.centerY) ?? activeRecon.center_y ?? 0,
                });
            }
            await syncProtocolFromSession();
            navigate(-1);
        } catch { setSaveMessage(t("protocolDetail.saveFailedLater")); } finally { setIsSaving(false); }
    };

    return {
        protocol, selection, setSelection, isSaving, saveMessage,
        basicDraft, setBasicDraft, seriesDraft, setSeriesDraft, reconDraft, setReconDraft,
        isReadOnly, isNewMode, ageLabel, bodyPartOptions, ageGroupOptions, selectedPos, setSelectedPos,
        activeSeries, activeRecon,
        appendDraftSeries, appendDraftRecon, handleDeleteActiveSeries, handleDeleteActiveRecon,
        handleSeriesModeChange, handleSave, navigate
    };
}
