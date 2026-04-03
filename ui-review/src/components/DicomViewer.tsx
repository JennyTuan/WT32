import { forwardRef, useImperativeHandle, useRef } from 'react';
import CornerstoneStackViewport, { type CornerstoneViewportHandle } from './CornerstoneStackViewport';

export type DicomViewerHandle = CornerstoneViewportHandle;

interface DicomViewerProps {
    dicomUrl?: string;
    imageUrls?: string[];
    currentImageIndex?: number;
    onImageIndexChange?: (index: number) => void;
    activeTool?: string;
    windowCenter?: number;
    windowWidth?: number;
    onWindowLevelChange?: (windowCenter: number, windowWidth: number) => void;
}

const DicomViewer = forwardRef<DicomViewerHandle, DicomViewerProps>(function DicomViewer(
    {
        dicomUrl,
        imageUrls,
        currentImageIndex = 0,
        onImageIndexChange,
        activeTool = 'pan',
        windowCenter = 40,
        windowWidth = 400,
        onWindowLevelChange,
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
            activeTool={activeTool}
            windowCenter={windowCenter}
            windowWidth={windowWidth}
            onWindowLevelChange={onWindowLevelChange}
            className="w-full h-full relative overflow-hidden select-none"
        />
    );
});

export default DicomViewer;
