import { useEffect, useRef, useState } from 'react';
import { Enums, RenderingEngine, type StackViewport } from '@cornerstonejs/core';

import {
  buildWadoImageId,
  CornerstoneToolsEnums,
  destroyToolGroup,
  getOrCreateToolGroup,
  initCornerstone,
  TOOL_NAMES,
} from '../lib/cornerstone/initCornerstone';

type ActiveTool = 'pan' | 'zoom' | 'window' | 'ruler' | 'zoomout' | 'fit' | 'flip' | 'reset';

interface CornerstoneStackViewportProps {
  dicomUrl?: string;
  imageUrls?: string[];
  currentImageIndex?: number;
  onImageIndexChange?: (index: number) => void;
  activeTool?: string;
  windowCenter?: number;
  windowWidth?: number;
  className?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isSupportedActiveTool(value: string | undefined): value is ActiveTool {
  return (
    value === 'pan' ||
    value === 'zoom' ||
    value === 'window' ||
    value === 'ruler' ||
    value === 'zoomout' ||
    value === 'fit' ||
    value === 'flip' ||
    value === 'reset'
  );
}

export default function CornerstoneStackViewport({
  dicomUrl,
  imageUrls,
  currentImageIndex = 0,
  onImageIndexChange,
  activeTool = 'pan',
  windowCenter = 40,
  windowWidth = 400,
  className,
}: CornerstoneStackViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const viewportRef = useRef<StackViewport | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const viewportIdRef = useRef(`cs-viewport-${Math.random().toString(36).slice(2, 10)}`);
  const renderingEngineIdRef = useRef(`cs-engine-${Math.random().toString(36).slice(2, 10)}`);
  const toolGroupIdRef = useRef(`cs-tools-${Math.random().toString(36).slice(2, 10)}`);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const urls = imageUrls?.length ? imageUrls : dicomUrl ? [dicomUrl] : [];
    if (!urls.length || !elementRef.current) {
      setStatus('error');
      setErrorMsg('No DICOM image source provided.');
      return;
    }

    let disposed = false;

    const setupViewport = async () => {
      try {
        setStatus('loading');
        setErrorMsg('');

        await initCornerstone();
        if (disposed || !elementRef.current) {
          return;
        }

        const renderingEngine = new RenderingEngine(renderingEngineIdRef.current);
        renderingEngineRef.current = renderingEngine;

        renderingEngine.enableElement({
          viewportId: viewportIdRef.current,
          element: elementRef.current,
          type: Enums.ViewportType.STACK,
        });

        const viewport = renderingEngine.getStackViewport(viewportIdRef.current);
        viewportRef.current = viewport;

        const toolGroup = getOrCreateToolGroup(toolGroupIdRef.current);
        toolGroup.addViewport(viewportIdRef.current, renderingEngineIdRef.current);

        await viewport.setStack(urls.map(buildWadoImageId), clamp(currentImageIndex, 0, Math.max(urls.length - 1, 0)));
        viewport.render();

        resizeObserverRef.current = new ResizeObserver(() => {
          renderingEngine.resize(true, false);
        });
        resizeObserverRef.current.observe(elementRef.current);

        if (!disposed) {
          setStatus('ready');
        }
      } catch (error) {
        console.error('Cornerstone viewport setup failed.', error);
        if (!disposed) {
          setStatus('error');
          setErrorMsg(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void setupViewport();

    return () => {
      disposed = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      destroyToolGroup(toolGroupIdRef.current);
      viewportRef.current = null;
      renderingEngineRef.current?.destroy();
      renderingEngineRef.current = null;
    };
  }, [currentImageIndex, dicomUrl, imageUrls]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const urls = imageUrls?.length ? imageUrls : dicomUrl ? [dicomUrl] : [];
    if (!viewport || status !== 'ready' || !urls.length) {
      return;
    }

    const targetIndex = clamp(currentImageIndex, 0, Math.max(urls.length - 1, 0));
    if (viewport.getCurrentImageIdIndex() === targetIndex) {
      return;
    }

    void viewport.setImageIdIndex(targetIndex).then(() => {
      viewport.render();
    });
  }, [currentImageIndex, dicomUrl, imageUrls, status]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || status !== 'ready') {
      return;
    }

    viewport.setProperties({
      voiRange: {
        lower: windowCenter - windowWidth / 2,
        upper: windowCenter + windowWidth / 2,
      },
    });
    viewport.render();
  }, [status, windowCenter, windowWidth]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || status !== 'ready') {
      return;
    }

    const toolGroup = getOrCreateToolGroup(toolGroupIdRef.current);
    const setPrimaryTool = (toolName: string) => {
      toolGroup.setToolPassive(TOOL_NAMES.pan);
      toolGroup.setToolPassive(TOOL_NAMES.zoom);
      toolGroup.setToolPassive(TOOL_NAMES.windowLevel);
      toolGroup.setToolPassive(TOOL_NAMES.length);
      toolGroup.setToolActive(toolName, {
        bindings: [{ mouseButton: CornerstoneToolsEnums.MouseBindings.Primary }],
      });
    };

    switch (isSupportedActiveTool(activeTool) ? activeTool : 'pan') {
      case 'pan':
        setPrimaryTool(TOOL_NAMES.pan);
        break;
      case 'zoom':
        setPrimaryTool(TOOL_NAMES.zoom);
        break;
      case 'window':
        setPrimaryTool(TOOL_NAMES.windowLevel);
        break;
      case 'ruler':
        setPrimaryTool(TOOL_NAMES.length);
        break;
      case 'zoomout':
        viewport.setZoom(clamp(viewport.getZoom() * 0.8, 0.2, 20));
        viewport.render();
        break;
      case 'fit':
        viewport.resetCamera();
        viewport.render();
        break;
      case 'flip': {
        const camera = viewport.getCamera();
        viewport.setCamera({ flipHorizontal: !camera.flipHorizontal });
        viewport.render();
        break;
      }
      case 'reset':
        viewport.resetProperties();
        viewport.resetCamera();
        viewport.render();
        break;
    }
  }, [activeTool, status]);

  useEffect(() => {
    const element = elementRef.current;
    const viewport = viewportRef.current;
    const urls = imageUrls?.length ? imageUrls : dicomUrl ? [dicomUrl] : [];
    if (!element || !viewport || status !== 'ready') {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (urls.length > 1 && !event.ctrlKey) {
        const nextIndex = clamp(
          viewport.getCurrentImageIdIndex() + (event.deltaY > 0 ? 1 : -1),
          0,
          urls.length - 1
        );
        if (nextIndex !== viewport.getCurrentImageIdIndex()) {
          void viewport.setImageIdIndex(nextIndex).then(() => {
            viewport.render();
            onImageIndexChange?.(nextIndex);
          });
        }
        return;
      }

      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      viewport.setZoom(clamp(viewport.getZoom() * factor, 0.2, 20));
      viewport.render();
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [dicomUrl, imageUrls, onImageIndexChange, status]);

  return (
    <div ref={elementRef} className={className ?? 'w-full h-full relative overflow-hidden bg-black'}>
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#4D94FF]/40">
          <div className="w-8 h-8 border-2 border-[#4D94FF]/30 border-t-[#4D94FF] rounded-full animate-spin" />
          <span className="text-[12px] font-mono font-bold uppercase tracking-widest">Loading DICOM...</span>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-red-400/70">
          <span className="text-[12px] font-mono font-bold">Error: {errorMsg}</span>
        </div>
      )}
    </div>
  );
}
