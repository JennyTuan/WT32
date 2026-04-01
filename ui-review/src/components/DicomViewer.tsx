import CornerstoneStackViewport from './CornerstoneStackViewport';

interface DicomViewerProps {
    dicomUrl?: string;
    imageUrls?: string[];
    currentImageIndex?: number;
    onImageIndexChange?: (index: number) => void;
    activeTool?: string;
    windowCenter?: number;
    windowWidth?: number;
}

export default function DicomViewer({
    dicomUrl,
    imageUrls,
    currentImageIndex = 0,
    onImageIndexChange,
    activeTool = 'pan',
    windowCenter = 40,
    windowWidth = 400,
}: DicomViewerProps) {
    return (
        <CornerstoneStackViewport
            dicomUrl={dicomUrl}
            imageUrls={imageUrls}
            currentImageIndex={currentImageIndex}
            onImageIndexChange={onImageIndexChange}
            activeTool={activeTool}
            windowCenter={windowCenter}
            windowWidth={windowWidth}
            className="w-full h-full relative overflow-hidden select-none"
        />
    );
}
