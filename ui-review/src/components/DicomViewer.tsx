import { forwardRef, useImperativeHandle, useRef } from 'react';
import CornerstoneStackViewport, { type CornerstoneViewportHandle } from './CornerstoneStackViewport';

export type DicomViewerHandle = CornerstoneViewportHandle;

interface DicomViewerProps {
    dicomUrl?: string;
    imageUrls?: string[];
    currentImageIndex?: number;
    onImageIndexChange?: (index: number) => void;
    onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
    activeTool?: string;
    windowCenter?: number;
    windowWidth?: number;
    onWindowLevelChange?: (windowCenter: number, windowWidth: number) => void;
    windowSyncKey?: number;
    invert?: boolean;
    interpolationMode?: "LINEAR" | "NEAREST" | "FAST_LINEAR";
    voiLutMode?: "LINEAR" | "LINEAR_EXACT" | "SIGMOID";
    smoothing?: number;
    sharpening?: number;
}

const DicomViewer = forwardRef<DicomViewerHandle, DicomViewerProps>(function DicomViewer(
    {
        dicomUrl,
        imageUrls,
        currentImageIndex = 0,
        onImageIndexChange,
        onStatusChange,
        activeTool = 'pan',
        windowCenter = 40,
        windowWidth = 400,
        onWindowLevelChange,
        windowSyncKey,
        invert,
        interpolationMode,
        voiLutMode,
        smoothing,
        sharpening,
    },
    ref
) {
    const csRef = useRef<CornerstoneViewportHandle>(null);

    useImperativeHandle(ref, () => ({
        zoomIn:  () => csRef.current?.zoomIn(),
        zoomOut: () => csRef.current?.zoomOut(),
        fit:     () => csRef.current?.fit(),
        reset:   () => csRef.current?.reset(),
        clearAnnotations: () => csRef.current?.clearAnnotations(),
    }));

    return (
        <CornerstoneStackViewport
            ref={csRef}
            dicomUrl={dicomUrl}
            imageUrls={imageUrls}
            currentImageIndex={currentImageIndex}
            onImageIndexChange={onImageIndexChange}
            onStatusChange={onStatusChange}
            activeTool={activeTool}
            windowCenter={windowCenter}
            windowWidth={windowWidth}
            onWindowLevelChange={onWindowLevelChange}
            windowSyncKey={windowSyncKey}
            invert={invert}
            interpolationMode={interpolationMode}
            voiLutMode={voiLutMode}
            smoothing={smoothing}
            sharpening={sharpening}
            className="w-full h-full relative overflow-hidden select-none"
        />
    );
});

export default DicomViewer;
