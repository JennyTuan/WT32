import { useEffect, useRef, useState } from "react";
import { fetchSelectedScanSession, updateSelectedScanSessionHelicalParam } from "../lib/scanSession";
import ScanConfirmScreen from "./ScanConfirmScreen";
import { TomographicScoutViewport } from "./SequenceScanConfirmScreen";

const HelicalScanConfirmScreen = () => {
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const [helicalParamId, setHelicalParamId] = useState<number | null>(null);
    const updateTimerRef = useRef<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadSessionDefaults = async () => {
            try {
                const scanSession = await fetchSelectedScanSession();
                const helicalParam = scanSession?.series.find((series) => series.series_type === "helical")?.helical_param;
                if (!helicalParam || cancelled) return;

                setHelicalParamId(helicalParam.id);
                setMeasurements({
                    scanLength: String(helicalParam.scan_length),
                    scoutFov: String(helicalParam.fov),
                });
            } catch (error) {
                console.error("Failed to load helical scan session defaults.", error);
            }
        };

        void loadSessionDefaults();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!helicalParamId) return;
        const scanLength = Number(measurements.scanLength);
        const scoutFov = Number(measurements.scoutFov);
        if (!Number.isFinite(scanLength) || !Number.isFinite(scoutFov)) return;

        if (updateTimerRef.current !== null) {
            window.clearTimeout(updateTimerRef.current);
        }

        updateTimerRef.current = window.setTimeout(() => {
            void updateSelectedScanSessionHelicalParam(helicalParamId, {
                scan_length: Number(scanLength.toFixed(1)),
                fov: Number(scoutFov.toFixed(1)),
            }).catch((error) => {
                console.error("Failed to persist helical crop measurements.", error);
            });
        }, 180);

        return () => {
            if (updateTimerRef.current !== null) {
                window.clearTimeout(updateTimerRef.current);
            }
        };
    }, [helicalParamId, measurements.scanLength, measurements.scoutFov]);

    useEffect(() => {
        const preventBackNavigation = () => {
            window.history.pushState(null, "", window.location.href);
        };

        preventBackNavigation();
        window.addEventListener("popstate", preventBackNavigation);

        return () => {
            window.removeEventListener("popstate", preventBackNavigation);
        };
    }, []);

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="helicalScan"
            helicalParamOverrides={measurements}
            rightViewportContent={<TomographicScoutViewport onMeasurementChange={setMeasurements} initialMeasurements={measurements} />}
            nextRoute="/helical-execute"
            allowBackNavigation={false}
        />
    );
};

export default HelicalScanConfirmScreen;
