import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Enums, RenderingEngine, type StackViewport } from '@cornerstonejs/core';
import { annotation } from '@cornerstonejs/tools';

import {
  buildWadoImageId,
  CornerstoneToolsEnums,
  destroyToolGroup,
  getOrCreateToolGroup,
  initCornerstone,
  TOOL_NAMES,
} from '../lib/cornerstone/initCornerstone';
import { fromVoiRange, getVoiLutFunction, toVoiRange, type VoiLutMode } from '../lib/cornerstone/voi';
import { FeedbackViewportOverlay } from './FeedbackNotice';
import { useI18n } from '../lib/i18nContext';

type ActiveTool = 'pan' | 'zoom' | 'zoomin' | 'window' | 'ruler' | 'eraser' | 'zoomout' | 'fit' | 'flip' | 'reset' | 'annotate';
type InterpolationMode = 'NEAREST' | 'LINEAR' | 'FAST_LINEAR';
type AppliedDisplayProperties = {
  lower: number;
  upper: number;
  invert: boolean;
  interpolationMode: InterpolationMode;
  voiLutMode: VoiLutMode;
  smoothing: number;
  sharpening: number;
};

export type CornerstoneViewportHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  reset: () => void;
  clearAnnotations: () => void;
};

interface CornerstoneStackViewportProps {
  dicomUrl?: string;
  imageUrls?: string[];
  currentImageIndex?: number;
  onImageIndexChange?: (index: number) => void;
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
  activeTool?: string;
  windowCenter?: number;
  windowWidth?: number;
  onWindowLevelChange?: (windowCenter: number, windowWidth: number) => void;
  className?: string;
  windowSyncKey?: number;
  invert?: boolean;
  interpolationMode?: InterpolationMode;
  voiLutMode?: VoiLutMode;
  smoothing?: number;
  sharpening?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getInterpolationType(mode: InterpolationMode) {
  if (mode === 'NEAREST') return Enums.InterpolationType.NEAREST;
  if (mode === 'FAST_LINEAR') return Enums.InterpolationType.FAST_LINEAR;
  return Enums.InterpolationType.LINEAR;
}

type DicomErrorCode =
  | 'DICOM_INVALID'
  | 'DICOM_NOT_FOUND'
  | 'DICOM_PERMISSION_DENIED'
  | 'DICOM_READ_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

const DICOM_ERROR_I18N_KEYS: Record<DicomErrorCode, string> = {
  DICOM_INVALID: 'dicomError.invalid',
  DICOM_NOT_FOUND: 'dicomError.notFound',
  DICOM_PERMISSION_DENIED: 'dicomError.permissionDenied',
  DICOM_READ_ERROR: 'dicomError.readError',
  NETWORK_ERROR: 'dicomError.network',
  UNKNOWN: 'dicomError.unknown',
};

async function probeDicomUrl(url: string): Promise<{ ok: true } | { ok: false; code: DicomErrorCode; detail?: string }> {
  try {
    const resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-131' } });
    if (resp.ok) return { ok: true };
    if (resp.status === 404) return { ok: false, code: 'DICOM_NOT_FOUND' };
    const contentType = resp.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const body = (await resp.json()) as { code?: string; message?: string; file?: string };
        const code = body.code as DicomErrorCode | undefined;
        if (code && code in DICOM_ERROR_I18N_KEYS) {
          return { ok: false, code, detail: body.file };
        }
        return { ok: false, code: 'UNKNOWN', detail: body.message };
      } catch {
        // fall through
      }
    }
    return { ok: false, code: 'UNKNOWN', detail: `HTTP ${resp.status}` };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR' };
  }
}

function isSupportedActiveTool(value: string | undefined): value is ActiveTool {
  return (
    value === 'pan' ||
    value === 'zoom' ||
    value === 'zoomin' ||
    value === 'window' ||
    value === 'ruler' ||
    value === 'eraser' ||
    value === 'zoomout' ||
    value === 'fit' ||
    value === 'flip' ||
    value === 'reset' ||
    value === 'annotate'
  );
}

const CornerstoneStackViewport = forwardRef<CornerstoneViewportHandle, CornerstoneStackViewportProps>(
  function CornerstoneStackViewport(
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
      className,
      windowSyncKey,
      invert = false,
      interpolationMode = 'LINEAR',
      voiLutMode = 'LINEAR',
      smoothing = 0,
      sharpening = 0,
    },
    ref
  ) {
    const { t } = useI18n();
    const elementRef = useRef<HTMLDivElement>(null);
    const renderingEngineRef = useRef<RenderingEngine | null>(null);
    const viewportRef = useRef<StackViewport | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    // eslint-disable-next-line react-hooks/purity
    const viewportIdRef = useRef(`cs-viewport-${Math.random().toString(36).slice(2, 10)}`);
    // eslint-disable-next-line react-hooks/purity
    const renderingEngineIdRef = useRef(`cs-engine-${Math.random().toString(36).slice(2, 10)}`);
    // eslint-disable-next-line react-hooks/purity
    const toolGroupIdRef = useRef(`cs-tools-${Math.random().toString(36).slice(2, 10)}`);
    // Track last WL values sent to Cornerstone to avoid feedback loops
    const lastSentVoiRef = useRef<{ lower: number; upper: number } | null>(null);
    const lastEmittedVoiRef = useRef<{ lower: number; upper: number } | null>(null);
    const lastAppliedDisplayRef = useRef<AppliedDisplayProperties | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
      onStatusChange?.(status);
    }, [onStatusChange, status]);

    // Expose imperative API for direct viewport control (zoom, fit, reset)
    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.setZoom(clamp(viewport.getZoom() * 1.15, 0.2, 20));
        viewport.render();
      },
      zoomOut: () => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.setZoom(clamp(viewport.getZoom() * 0.87, 0.2, 20));
        viewport.render();
      },
      fit: () => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.resetCamera();
        viewport.render();
      },
      reset: () => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.resetProperties();
        viewport.resetCamera();
        lastSentVoiRef.current = null;
        lastAppliedDisplayRef.current = null;
        viewport.render();
      },
      clearAnnotations: () => {
        const viewport = viewportRef.current;
        annotation.state.removeAllAnnotations();
        viewport?.render();
      },
    }));

    // ─── Viewport setup (only reruns when the image URLs change, NOT on every slice) ───
    useEffect(() => {
      const urls = imageUrls?.length ? imageUrls : dicomUrl ? [dicomUrl] : [];
      if (!urls.length || !elementRef.current) {
        setStatus('error');
        setErrorMsg('No DICOM image source provided.');
        return;
      }

      let disposed = false;
      const toolGroupId = toolGroupIdRef.current;

      const setupViewport = async () => {
        try {
          setStatus('loading');
          setErrorMsg('');

          const probe = await probeDicomUrl(urls[0]);
          if (disposed) return;
          if (!probe.ok) {
            const msg = t(DICOM_ERROR_I18N_KEYS[probe.code] as never) + (probe.detail ? `（${probe.detail}）` : '');
            setStatus('error');
            setErrorMsg(msg);
            return;
          }

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

          const toolGroup = getOrCreateToolGroup(toolGroupId);
          toolGroup.addViewport(viewportIdRef.current, renderingEngineIdRef.current);

          // Start at index 0; the separate currentImageIndex effect will jump to the right position
          await viewport.setStack(urls.map(buildWadoImageId), 0);
          viewport.render();

          resizeObserverRef.current = new ResizeObserver(() => {
            if (disposed || renderingEngineRef.current !== renderingEngine) return;
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
        destroyToolGroup(toolGroupId);
        viewportRef.current = null;
        renderingEngineRef.current?.destroy();
        renderingEngineRef.current = null;
        lastSentVoiRef.current = null;
        lastAppliedDisplayRef.current = null;
      };
      // currentImageIndex intentionally excluded — handled by the effect below
       
    }, [dicomUrl, imageUrls, t]);

    // ─── Slice navigation (lightweight, no teardown) ───
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

    // ─── Window / Level (VOI) ───
    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport || status !== 'ready') {
        return;
      }

      const { lower: newLower, upper: newUpper } = toVoiRange(windowWidth, windowCenter, voiLutMode);
      const nextDisplay: AppliedDisplayProperties = {
        lower: newLower,
        upper: newUpper,
        invert,
        interpolationMode,
        voiLutMode,
        smoothing,
        sharpening,
      };

      // Skip only if every display property is already applied. WW/WL alone is not enough:
      // controls such as invert/interpolation can change while VOI stays the same.
      const last = lastAppliedDisplayRef.current;
      if (
        last &&
        Math.abs(last.lower - nextDisplay.lower) < 0.5 &&
        Math.abs(last.upper - nextDisplay.upper) < 0.5 &&
        last.invert === nextDisplay.invert &&
        last.interpolationMode === nextDisplay.interpolationMode &&
        last.voiLutMode === nextDisplay.voiLutMode &&
        Math.abs(last.smoothing - nextDisplay.smoothing) < 0.001 &&
        Math.abs(last.sharpening - nextDisplay.sharpening) < 0.001
      ) {
        return;
      }

      lastSentVoiRef.current = { lower: newLower, upper: newUpper };
      lastEmittedVoiRef.current = { lower: newLower, upper: newUpper };
      lastAppliedDisplayRef.current = nextDisplay;
      viewport.setProperties({
        voiRange: { lower: newLower, upper: newUpper },
        invert,
        interpolationType: getInterpolationType(interpolationMode),
        VOILUTFunction: getVoiLutFunction(voiLutMode),
        smoothing,
        sharpening,
      });
      viewport.render();
    }, [interpolationMode, invert, sharpening, smoothing, status, voiLutMode, windowCenter, windowWidth, windowSyncKey]);

    // ─── Active tool switching ───
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
        toolGroup.setToolPassive(TOOL_NAMES.eraser);
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
        case 'eraser':
          setPrimaryTool(TOOL_NAMES.eraser);
          break;
        case 'zoomin':
          viewport.setZoom(clamp(viewport.getZoom() * 1.15, 0.2, 20));
          viewport.render();
          break;
        case 'zoomout':
          viewport.setZoom(clamp(viewport.getZoom() * 0.87, 0.2, 20));
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
          lastSentVoiRef.current = null;
          lastAppliedDisplayRef.current = null;
          viewport.render();
          break;
        case 'annotate':
          // Annotation is handled by the React overlay; deactivate all CS tools
          // so the mouse doesn't pan/zoom while the user clicks to place annotations.
          toolGroup.setToolPassive(TOOL_NAMES.pan);
          toolGroup.setToolPassive(TOOL_NAMES.zoom);
          toolGroup.setToolPassive(TOOL_NAMES.windowLevel);
          toolGroup.setToolPassive(TOOL_NAMES.length);
          toolGroup.setToolPassive(TOOL_NAMES.eraser);
          break;
      }
    }, [activeTool, status]);

    // ─── Report WW/WL changes back to parent (e.g. after user drags WL tool) ───
    useEffect(() => {
      const element = elementRef.current;
      if (!element || status !== 'ready' || !onWindowLevelChange) return;

      const handleImageRendered = () => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        try {
          const props = viewport.getProperties();
          if (props.voiRange) {
            const { lower, upper } = props.voiRange;
            const { windowWidth: ww, windowCenter: wc } = fromVoiRange(lower, upper, voiLutMode);
            
            // THRESHOLD GUARD
            const lastEmitted = lastEmittedVoiRef.current;
            if (lastEmitted && Math.abs(lastEmitted.lower - lower) < 1.0 && Math.abs(lastEmitted.upper - upper) < 1.0) {
                return;
            }

            // Update both to keep them in sync
            lastSentVoiRef.current = { lower, upper };
            lastEmittedVoiRef.current = { lower, upper };
            onWindowLevelChange(wc, ww);
          }
        } catch {
          // ignore
        }
      };

      element.addEventListener(Enums.Events.IMAGE_RENDERED, handleImageRendered);
      return () => element.removeEventListener(Enums.Events.IMAGE_RENDERED, handleImageRendered);
    }, [status, onWindowLevelChange, voiLutMode]);

    // ─── Stack-image change sync ─────────────────────────────────────────────
    // Authoritative slice-index mirror: whenever Cornerstone advances to a new
    // image (wheel, programmatic, or any built-in tool), pull the current
    // imageIdIndex from the viewport and report it up. This makes the React
    // state robust to any code path that bypasses our manual wheel callback —
    // we no longer rely on whoever changed the slice to remember to call
    // onImageIndexChange.
    useEffect(() => {
      const element = elementRef.current;
      const viewport = viewportRef.current;
      if (!element || !viewport || status !== 'ready' || !onImageIndexChange) {
        return;
      }
      let lastReported = viewport.getCurrentImageIdIndex();
      const handleStackNewImage = () => {
        try {
          const idx = viewport.getCurrentImageIdIndex();
          if (idx !== lastReported) {
            lastReported = idx;
            onImageIndexChange(idx);
          }
        } catch {
          /* viewport torn down — ignore */
        }
      };
      element.addEventListener(Enums.Events.STACK_NEW_IMAGE, handleStackNewImage);
      return () => element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, handleStackNewImage);
    }, [status, onImageIndexChange]);

    // ─── Mouse wheel: slice scroll or zoom ───
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
      <div
        ref={elementRef}
        className={className ?? 'w-full h-full relative overflow-hidden bg-black'}
      >
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#4D94FF]/40">
            <div className="w-8 h-8 border-2 border-[#4D94FF]/30 border-t-[#4D94FF] rounded-full animate-spin" />
            <span className="text-[12px] font-mono font-bold uppercase tracking-widest">Loading DICOM...</span>
          </div>
        )}

        {status === 'error' && (
          <FeedbackViewportOverlay title={t('dicomError.unknown' as never)} message={errorMsg} />
        )}
      </div>
    );
  }
);

export default CornerstoneStackViewport;
