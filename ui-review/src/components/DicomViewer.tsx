/**
 * DicomViewer.tsx
 *
 * A self-contained DICOM viewer using `dicom-parser` (already a project dependency)
 * and the native Canvas API. No additional packages required.
 *
 * Renders a single DICOM slice with:
 *   - Window/Level (WL/WC) mapping to 8-bit grayscale
 *   - Zoom & Pan state driven by parent tool selection
 */

import { useEffect, useRef, useState } from 'react';
import dicomParser from 'dicom-parser';

interface DicomViewerProps {
    /** Path relative to /public, e.g. '/dicom/test/SYNO0001.dcm' */
    dicomUrl: string;
    /** Currently active tool passed in from parent */
    activeTool?: string;
    /** Window center (default: 40) */
    windowCenter?: number;
    /** Window width (default: 400) */
    windowWidth?: number;
}

export default function DicomViewer({
    dicomUrl,
    activeTool = 'pan',
    windowCenter = 40,
    windowWidth = 400,
}: DicomViewerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    // zoom / pan state
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    // raw pixel data cache
    const pixelDataRef = useRef<{
        data: Uint8Array | Uint16Array | Int16Array;
        rows: number;
        cols: number;
        bitsStored: number;
        pixelRepresentation: number;
    } | null>(null);

    // ── 1. Load & parse DICOM ──────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setStatus('loading');
        setErrorMsg('');
        setScale(1);
        setOffset({ x: 0, y: 0 });

        (async () => {
            try {
                const res = await fetch(dicomUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const buf = await res.arrayBuffer();
                const byteArray = new Uint8Array(buf);
                const ds = dicomParser.parseDicom(byteArray);

                const rows: number = ds.uint16('x00280010') ?? 0;
                const cols: number = ds.uint16('x00280011') ?? 0;
                const bitsStored: number = ds.uint16('x00280101') ?? 16;
                const pixelRepresentation: number = ds.uint16('x00280103') ?? 0;

                const pixelDataElement = ds.elements['x7fe00010'];
                if (!pixelDataElement) throw new Error('No pixel data found');

                let pixelData: Uint8Array | Uint16Array | Int16Array;
                if (bitsStored <= 8) {
                    pixelData = new Uint8Array(byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length);
                } else if (pixelRepresentation === 1) {
                    pixelData = new Int16Array(byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
                } else {
                    pixelData = new Uint16Array(byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
                }

                if (!cancelled) {
                    pixelDataRef.current = { data: pixelData, rows, cols, bitsStored, pixelRepresentation };
                    setStatus('ready');
                }
            } catch (e) {
                if (!cancelled) {
                    setErrorMsg(e instanceof Error ? e.message : String(e));
                    setStatus('error');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [dicomUrl]);

    // ── 2. Render to canvas whenever pixel data or WL changes ──────────────
    useEffect(() => {
        if (status !== 'ready' || !canvasRef.current || !pixelDataRef.current) return;
        const { data, rows, cols } = pixelDataRef.current;
        const canvas = canvasRef.current;
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.createImageData(cols, rows);
        const wLow = windowCenter - windowWidth / 2;
        const wHigh = windowCenter + windowWidth / 2;

        for (let i = 0; i < data.length; i++) {
            const hu = data[i] as number;
            let val: number;
            if (hu <= wLow) val = 0;
            else if (hu >= wHigh) val = 255;
            else val = Math.round(((hu - wLow) / windowWidth) * 255);

            const idx = i * 4;
            imageData.data[idx] = val;
            imageData.data[idx + 1] = val;
            imageData.data[idx + 2] = val;
            imageData.data[idx + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
    }, [status, windowCenter, windowWidth]);

    // ── 3. Mouse interactions (pan / zoom) ─────────────────────────────────
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setScale(s => Math.max(0.3, Math.min(8, s * delta)));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (activeTool === 'pan') {
            isDragging.current = true;
            lastPos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) return;
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
        lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => { isDragging.current = false; };

    const handleZoomIn = () => setScale(s => Math.min(8, s * 1.2));
    const handleZoomOut = () => setScale(s => Math.max(0.3, s * 0.8));
    const handleFit = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

    // Let parent's zoom/fit buttons also work via activeTool prop
    useEffect(() => {
        if (activeTool === 'zoom') handleZoomIn();
        else if (activeTool === 'zoomout') handleZoomOut();
        else if (activeTool === 'fit') handleFit();
    }, [activeTool]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative overflow-hidden select-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: activeTool === 'pan' ? 'grab' : 'crosshair' }}
        >
            {status === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#4D94FF]/40">
                    <div className="w-8 h-8 border-2 border-[#4D94FF]/30 border-t-[#4D94FF] rounded-full animate-spin" />
                    <span className="text-[12px] font-mono font-bold uppercase tracking-widest">Loading DICOM...</span>
                </div>
            )}

            {status === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-400/60">
                    <span className="text-[12px] font-mono font-bold">Error: {errorMsg}</span>
                </div>
            )}

            {status === 'ready' && (
                <canvas
                    ref={canvasRef}
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                        transformOrigin: 'center center',
                        imageRendering: 'pixelated',
                        maxWidth: 'none',
                        transition: isDragging.current ? 'none' : 'transform 0.05s ease-out',
                    }}
                />
            )}
        </div>
    );
}
