import {
  cache,
  cornerstoneStreamingImageVolumeLoader,
  Enums,
  RenderingEngine,
  setVolumesForViewports,
  type Types,
  volumeLoader,
} from '@cornerstonejs/core';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from 'react';

import {
  buildWadoImageId,
  CornerstoneToolsEnums,
  destroyToolGroup,
  getOrCreateToolGroup,
  initCornerstone,
  TOOL_NAMES,
} from '../lib/cornerstone/initCornerstone';
import { buildMhaImageIds, buildStitchedMhaImageIds, isMhaVolumeUrl } from '../lib/cornerstone/mhaImageLoader';

export type CornerstoneMPRHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetAll: () => void;
  forceWindowLevel: (wc: number, ww: number) => void;
};

type RenderMode = 'MPR' | 'MIP' | 'VR' | 'MinIP';
type LayoutMode = 'four-up' | 'three-up';
type PanelId = 'axial' | 'coronal' | 'sagittal';

interface CornerstoneMPRViewportProps {
  imageUrls: string[];
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
  windowCenter?: number;
  windowWidth?: number;
  onWindowLevelChange?: (wc: number, ww: number) => void;
  activeTool?: string;
  renderMode?: RenderMode;
  className?: string;
  currentSliceIndex?: number;
  windowSyncKey?: number;
  layoutMode?: LayoutMode;
  slabThickness?: number;
  phaseBadgeLabel?: string;
  showPhaseBadge?: boolean;
  phaseOptions?: Array<{ index: number; value: number }>;
  selectedPhaseIndex?: number;
  onPhaseChange?: (phase: number) => void;
}

interface TextAnnotation {
  id: string;
  panel: PanelId;
  x: number;
  y: number;
  text: string;
}

let volumeLoaderRegistered = false;
function registerVolumeLoader() {
  if (volumeLoaderRegistered) return;
  volumeLoader.registerVolumeLoader('streaming-wado-image-volume', cornerstoneStreamingImageVolumeLoader as any);
  volumeLoaderRegistered = true;
}

const PANEL_LABEL_CLASS =
  'pointer-events-none absolute left-2 top-2 inline-flex h-[18px] items-center rounded-full border border-white/10 bg-black/55 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#93C5FD] z-10';
const PHASE_BADGE_CLASS =
  'absolute right-2 top-2 z-10 rounded-md border border-white/15 bg-black/55 px-2 py-1 text-[11px] font-bold tracking-wide text-[#60A5FA] backdrop-blur-sm';
const CROSSHAIR_OVERLAY_CLASS = 'pointer-events-none absolute inset-0 z-[2]';
const SLAB_THICKNESS_MM = 150;

const AXIAL_COLOR = '#EF4444';
const CORONAL_COLOR = '#22C55E';
const SAGITTAL_COLOR = '#FACC15';

function CrosshairOverlay({
  horizontalColor,
  verticalColor,
}: {
  horizontalColor: string;
  verticalColor: string;
}) {
  return (
    <div className={CROSSHAIR_OVERLAY_CLASS}>
      <div
        className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
        style={{ backgroundColor: verticalColor, boxShadow: `0 0 10px ${verticalColor}66` }}
      />
      <div
        className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2"
        style={{ backgroundColor: horizontalColor, boxShadow: `0 0 10px ${horizontalColor}66` }}
      />
      <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-white/25" />
    </div>
  );
}

function getBlendMode(renderMode: RenderMode) {
  if (renderMode === 'MIP') return Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
  if (renderMode === 'MinIP') return Enums.BlendModes.MINIMUM_INTENSITY_BLEND;
  return Enums.BlendModes.COMPOSITE;
}

function isProjectionMode(renderMode: RenderMode) {
  return renderMode === 'MIP' || renderMode === 'MinIP';
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toPercentPoint(container: HTMLDivElement, clientX: number, clientY: number) {
  const rect = container.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(1, rect.width)) * 100)),
    y: Math.max(0, Math.min(100, ((clientY - rect.top) / Math.max(1, rect.height)) * 100)),
  };
}

const CornerstoneMPRViewport = forwardRef<CornerstoneMPRHandle, CornerstoneMPRViewportProps>(
  function CornerstoneMPRViewport(
    {
      imageUrls,
      onStatusChange,
      windowCenter = 40,
      windowWidth = 400,
      onWindowLevelChange,
      activeTool = 'pan',
      renderMode = 'MPR',
      className,
      currentSliceIndex,
      windowSyncKey,
      layoutMode = 'four-up',
      slabThickness = SLAB_THICKNESS_MM,
      phaseBadgeLabel,
      showPhaseBadge = false,
      phaseOptions,
      selectedPhaseIndex,
      onPhaseChange,
    },
    ref
  ) {
    const axialRef = useRef<HTMLDivElement>(null);
    const coronalRef = useRef<HTMLDivElement>(null);
    const sagittalRef = useRef<HTMLDivElement>(null);
    const slabRef = useRef<HTMLDivElement>(null);

    const engineRef = useRef<RenderingEngine | null>(null);
    const lastVoiRef = useRef<{ lower: number; upper: number } | null>(null);
    const lastEmittedVoiRef = useRef<{ lower: number; upper: number } | null>(null);
    const rafRef = useRef<number | null>(null);

    const engineId = useRef(`mpr-engine-${Math.random().toString(36).slice(2, 9)}`);
    const volumeIdRef = useRef(`streaming-wado-image-volume:mpr-${Math.random().toString(36).slice(2, 9)}`);
    const toolGroupId = useRef(`mpr-tools-${Math.random().toString(36).slice(2, 9)}`);

    const vpAxial = `${engineId.current}-axial`;
    const vpCoronal = `${engineId.current}-coronal`;
    const vpSagittal = `${engineId.current}-sagittal`;
    const vpSlab = `${engineId.current}-slab`;
    const activeViewportIds = useMemo(() => (layoutMode === 'three-up'
      ? [vpAxial, vpCoronal, vpSagittal]
      : [vpAxial, vpCoronal, vpSagittal, vpSlab]), [layoutMode, vpAxial, vpCoronal, vpSagittal, vpSlab]);

    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
    const [phasePickerPanel, setPhasePickerPanel] = useState<PanelId | null>(null);
    const phasePickerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      onStatusChange?.(status);
    }, [onStatusChange, status]);

    useEffect(() => {
      if (!showPhaseBadge) {
        setPhasePickerPanel(null);
      }
    }, [showPhaseBadge]);

    useEffect(() => {
      if (!phasePickerPanel) return;
      const handlePointerDown = (event: PointerEvent) => {
        if (!phasePickerRef.current?.contains(event.target as Node)) {
          setPhasePickerPanel(null);
        }
      };
      window.addEventListener('pointerdown', handlePointerDown);
      return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [phasePickerPanel]);

    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        const engine = engineRef.current;
        if (!engine) return;
        activeViewportIds.forEach((id) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
          if (!vp) return;
          vp.setZoom(vp.getZoom() * 1.15);
          vp.render();
        });
      },
      zoomOut: () => {
        const engine = engineRef.current;
        if (!engine) return;
        activeViewportIds.forEach((id) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
          if (!vp) return;
          vp.setZoom(vp.getZoom() * 0.87);
          vp.render();
        });
      },
      resetAll: () => {
        const engine = engineRef.current;
        if (!engine) return;
        activeViewportIds.forEach((id) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
          if (!vp) return;
          vp.resetCamera();
          vp.render();
        });
        setTextAnnotations([]);
      },
      forceWindowLevel: (wc: number, ww: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        const lower = wc - ww / 2;
        const upper = wc + ww / 2;
        lastVoiRef.current = { lower, upper };
        activeViewportIds.forEach((id) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
          vp?.setProperties({ voiRange: { lower, upper } });
          vp?.render();
        });
      },
    }));

    useEffect(() => {
      if (!imageUrls.length) return;
      const refs = [axialRef.current, coronalRef.current, sagittalRef.current];
      if (layoutMode === 'four-up') refs.push(slabRef.current);
      if (!refs.every(Boolean)) return;

      let disposed = false;
      let ro: ResizeObserver | null = null;

      const setup = async () => {
        try {
          setStatus('loading');
          setErrorMsg('');

          await initCornerstone();
          registerVolumeLoader();
          if (disposed) return;

          const engine = new RenderingEngine(engineId.current);
          engineRef.current = engine;

          engine.enableElement({
            viewportId: vpAxial,
            type: Enums.ViewportType.ORTHOGRAPHIC,
            element: axialRef.current!,
            defaultOptions: { orientation: Enums.OrientationAxis.AXIAL, background: [0, 0, 0] as [number, number, number] },
          });
          engine.enableElement({
            viewportId: vpCoronal,
            type: Enums.ViewportType.ORTHOGRAPHIC,
            element: coronalRef.current!,
            defaultOptions: { orientation: Enums.OrientationAxis.CORONAL, background: [0, 0, 0] as [number, number, number] },
          });
          engine.enableElement({
            viewportId: vpSagittal,
            type: Enums.ViewportType.ORTHOGRAPHIC,
            element: sagittalRef.current!,
            defaultOptions: { orientation: Enums.OrientationAxis.SAGITTAL, background: [0, 0, 0] as [number, number, number] },
          });
          if (layoutMode === 'four-up') {
            engine.enableElement({
              viewportId: vpSlab,
              type: Enums.ViewportType.ORTHOGRAPHIC,
              element: slabRef.current!,
              defaultOptions: { orientation: Enums.OrientationAxis.CORONAL, background: [0, 0, 0] as [number, number, number] },
            });
          }

          const toolGroup = getOrCreateToolGroup(toolGroupId.current);
          activeViewportIds.forEach((id) => toolGroup.addViewport(id, engineId.current));

          const volId = volumeIdRef.current;
          const imageIds =
            imageUrls.length === 1 && isMhaVolumeUrl(imageUrls[0])
              ? await buildMhaImageIds(imageUrls[0])
              : imageUrls.length > 1 && imageUrls.every(isMhaVolumeUrl)
                ? await buildStitchedMhaImageIds(imageUrls)
                : imageUrls.map(buildWadoImageId);

          if (!cache.getVolume(volId)) {
            const vol = await volumeLoader.createAndCacheVolume(volId, { imageIds });
            if (disposed) return;
            vol.load();
          } else {
            (cache.getVolume(volId) as any)?.load();
          }

          if (disposed) return;

          await setVolumesForViewports(engine, [{ volumeId: volId }], activeViewportIds);
          if (disposed) return;

          const lower = windowCenter - windowWidth / 2;
          const upper = windowCenter + windowWidth / 2;
          lastVoiRef.current = { lower, upper };
          activeViewportIds.forEach((id) => {
            (engine.getViewport(id) as Types.IVolumeViewport | undefined)?.setProperties({ voiRange: { lower, upper } });
          });

          ro = new ResizeObserver(() => {
            engine.resize(true, false);
            engine.renderViewports(activeViewportIds);
          });
          refs.forEach((el) => ro?.observe(el!));

          engine.resize(true, false);
          engine.renderViewports(activeViewportIds);

          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = requestAnimationFrame(() => {
              if (disposed || !engineRef.current) return;
              engineRef.current.resize(true, false);
              activeViewportIds.forEach((id) => {
                const vp = engineRef.current?.getViewport(id) as Types.IVolumeViewport | undefined;
                vp?.resetCamera();
              });
              engineRef.current.renderViewports(activeViewportIds);
              if (!disposed) setStatus('ready');
            });
          });
        } catch (err) {
          console.error('CornerstoneMPRViewport setup failed:', err);
          if (!disposed) {
            setStatus('error');
            setErrorMsg(err instanceof Error ? err.message : String(err));
          }
        }
      };

      void setup();

      return () => {
        disposed = true;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        ro?.disconnect();
        destroyToolGroup(toolGroupId.current);
        try { cache.removeVolumeLoadObject(volumeIdRef.current); } catch { /* ok */ }
        engineRef.current?.destroy();
        engineRef.current = null;
        lastVoiRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageUrls, layoutMode]);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine || status !== 'ready') return;

      const lower = windowCenter - windowWidth / 2;
      const upper = windowCenter + windowWidth / 2;
      lastVoiRef.current = { lower, upper };
      lastEmittedVoiRef.current = { lower, upper };
      activeViewportIds.forEach((id) => {
        const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
        vp?.setProperties({ voiRange: { lower, upper } });
        vp?.render();
      });
    }, [activeViewportIds, status, windowCenter, windowWidth, windowSyncKey]);

    useEffect(() => {
      const el = axialRef.current;
      if (!el || status !== 'ready' || !onWindowLevelChange) return;

      const handleRendered = () => {
        const vp = engineRef.current?.getViewport(vpAxial) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        try {
          const props = vp.getProperties();
          if (!props.voiRange) return;
          const { lower, upper } = props.voiRange;
          const last = lastEmittedVoiRef.current;
          if (last && Math.abs(last.lower - lower) < 1.0 && Math.abs(last.upper - upper) < 1.0) return;
          lastVoiRef.current = { lower, upper };
          lastEmittedVoiRef.current = { lower, upper };
          onWindowLevelChange((upper + lower) / 2, upper - lower);
        } catch {
          // ignore
        }
      };

      el.addEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
      return () => el.removeEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
    }, [onWindowLevelChange, status, vpAxial]);

    useEffect(() => {
      if (status !== 'ready') return;
      const toolGroup = getOrCreateToolGroup(toolGroupId.current);
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

      switch (activeTool) {
        case 'window':
          setPrimaryTool(TOOL_NAMES.windowLevel);
          break;
        case 'ruler':
          setPrimaryTool(TOOL_NAMES.length);
          break;
        case 'eraser':
          setPrimaryTool(TOOL_NAMES.eraser);
          break;
        case 'annotate':
          toolGroup.setToolPassive(TOOL_NAMES.pan);
          toolGroup.setToolPassive(TOOL_NAMES.zoom);
          toolGroup.setToolPassive(TOOL_NAMES.windowLevel);
          toolGroup.setToolPassive(TOOL_NAMES.length);
          toolGroup.setToolPassive(TOOL_NAMES.eraser);
          break;
        default:
          setPrimaryTool(TOOL_NAMES.pan);
          break;
      }
    }, [activeTool, status]);

    useEffect(() => {
      if (status !== 'ready') return;
      const engine = engineRef.current;
      if (!engine) return;

      const blendMode = getBlendMode(renderMode);
      const panelViewportIds = [vpAxial, vpCoronal, vpSagittal];
      if (layoutMode === 'three-up') {
        panelViewportIds.forEach((id) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
          if (!vp) return;
          vp.setBlendMode(blendMode);
          vp.setSlabThickness(isProjectionMode(renderMode) ? slabThickness : 1);
          vp.render();
        });
        return;
      }

      const slabVp = engine.getViewport(vpSlab) as Types.IVolumeViewport | undefined;
      if (!slabVp) return;
      slabVp.setBlendMode(blendMode);
      slabVp.setSlabThickness(isProjectionMode(renderMode) ? slabThickness : 1);
      slabVp.render();
    }, [layoutMode, renderMode, slabThickness, status, vpAxial, vpCoronal, vpSagittal, vpSlab]);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine || status !== 'ready' || currentSliceIndex === undefined) return;
      const vp = engine.getViewport(vpAxial) as Types.IVolumeViewport | undefined;
      if (!vp) return;
      try {
        if (vp.getSliceIndex() !== currentSliceIndex) {
          (vp as any).setSliceIndex(currentSliceIndex);
          vp.render();
        }
      } catch (e) {
        console.warn('Failed to set axial slice index:', e);
      }
    }, [currentSliceIndex, status, vpAxial]);

    const visibleAnnotations = useMemo(() => textAnnotations, [textAnnotations]);
    const panelBase = 'relative overflow-hidden bg-black';
    const showCrosshairs = renderMode === 'MPR';
    const slabLabel = renderMode === 'MIP' ? 'MIP' : renderMode === 'MinIP' ? 'MinIP' : 'Coronal';

    const renderTextAnnotations = (panel: PanelId) =>
      visibleAnnotations
        .filter((item) => item.panel === panel)
        .map((annotation) => (
          <div
            key={annotation.id}
            className={`absolute z-[12] flex items-center gap-1 ${activeTool === 'eraser' ? 'cursor-pointer' : 'pointer-events-none'}`}
            style={{
              left: `${annotation.x}%`,
              top: `${annotation.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onClick={(e) => {
              if (activeTool !== 'eraser') return;
              e.stopPropagation();
              setTextAnnotations((prev) => prev.filter((item) => item.id !== annotation.id));
            }}
          >
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFD54F]" />
            <div className="rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-[#FFF8E1] whitespace-nowrap">
              {annotation.text}
            </div>
          </div>
        ));

    const renderPhaseBadge = (panel: PanelId) => {
      if (!showPhaseBadge || !phaseBadgeLabel) return null;
      const open = phasePickerPanel === panel;
      const hasPicker = !!phaseOptions?.length && typeof onPhaseChange === 'function';
      return (
        <div ref={open ? phasePickerRef : undefined} className="absolute right-2 top-2 z-10">
          <button
            type="button"
            className={`${PHASE_BADGE_CLASS} ${hasPicker ? 'cursor-pointer transition-colors hover:border-[#4D94FF]/60 hover:bg-[#1E3A8A]/70 hover:text-white' : 'pointer-events-none'}`}
            onClick={(event) => {
              if (!hasPicker) return;
              event.stopPropagation();
              setPhasePickerPanel((prev) => (prev === panel ? null : panel));
            }}
          >
            <span>{phaseBadgeLabel}</span>
            {hasPicker && (
              <svg
                width="9"
                height="9"
                viewBox="0 0 8 8"
                fill="currentColor"
                className={`ml-1 inline-block transition-transform ${open ? 'rotate-180' : ''}`}
              >
                <path d="M0 2l4 4 4-4z" />
              </svg>
            )}
          </button>
          {open && hasPicker && (
            <div
              className="absolute right-0 top-full mt-1.5 w-[180px] overflow-hidden rounded-lg border border-white/15 bg-[#0B1220]/95 shadow-xl backdrop-blur-md"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                <span>Select Phase</span>
                <span className="text-[#60A5FA]">{phaseBadgeLabel}</span>
              </div>
              <div className="grid grid-cols-5 gap-1 p-2">
                {phaseOptions.map((opt) => {
                  const active = opt.index === selectedPhaseIndex;
                  return (
                    <button
                      key={opt.index}
                      type="button"
                      onClick={() => {
                        onPhaseChange?.(opt.index);
                        setPhasePickerPanel(null);
                      }}
                      className={`rounded-md py-1.5 text-[11px] font-bold tabular-nums transition-colors ${
                        active
                          ? 'bg-[#4D94FF] text-white shadow-[0_0_8px_rgba(77,148,255,0.5)]'
                          : 'bg-white/5 text-slate-200 hover:bg-white/15 hover:text-white'
                      }`}
                    >
                      {opt.value}%
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    };

    const renderAnnotateLayer = (panel: PanelId, refEl: RefObject<HTMLDivElement | null>) => (
      <div
        className={`absolute inset-0 z-[11] ${activeTool === 'annotate' ? 'cursor-cell' : 'pointer-events-none'}`}
        onClick={(e) => {
          if (activeTool !== 'annotate' || !refEl.current) return;
          const point = toPercentPoint(refEl.current, e.clientX, e.clientY);
          const noteCount = textAnnotations.filter((item) => item.panel === panel).length;
          setTextAnnotations((prev) => [
            ...prev,
            {
              id: makeId('text'),
              panel,
              x: point.x,
              y: point.y,
              text: `Note ${noteCount + 1}`,
            },
          ]);
        }}
      />
    );

    return (
      <div
        className={className ?? 'flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-[#0F172A]'}
        style={{ minHeight: 0 }}
      >
        <div
          ref={axialRef}
          className={`${panelBase} ${layoutMode === 'three-up' ? 'col-start-1 row-start-1' : ''}`}
          style={{ minHeight: 0 }}
        >
          {showCrosshairs && <CrosshairOverlay horizontalColor={CORONAL_COLOR} verticalColor={SAGITTAL_COLOR} />}
          <div className={PANEL_LABEL_CLASS}>Axial</div>
          {renderPhaseBadge('axial')}
          {renderAnnotateLayer('axial', axialRef)}
          {renderTextAnnotations('axial')}
        </div>
        <div
          ref={coronalRef}
          className={`${panelBase} ${layoutMode === 'three-up' ? 'col-start-2 row-start-1 row-span-2' : ''}`}
          style={{ minHeight: 0 }}
        >
          {showCrosshairs && <CrosshairOverlay horizontalColor={AXIAL_COLOR} verticalColor={SAGITTAL_COLOR} />}
          <div className={PANEL_LABEL_CLASS}>Coronal</div>
          {renderPhaseBadge('coronal')}
          {renderAnnotateLayer('coronal', coronalRef)}
          {renderTextAnnotations('coronal')}
        </div>
        <div
          ref={sagittalRef}
          className={`${panelBase} ${layoutMode === 'three-up' ? 'col-start-1 row-start-2' : ''}`}
          style={{ minHeight: 0 }}
        >
          {showCrosshairs && <CrosshairOverlay horizontalColor={AXIAL_COLOR} verticalColor={CORONAL_COLOR} />}
          <div className={PANEL_LABEL_CLASS}>Sagittal</div>
          {renderPhaseBadge('sagittal')}
          {renderAnnotateLayer('sagittal', sagittalRef)}
          {renderTextAnnotations('sagittal')}
        </div>
        <div
          ref={slabRef}
          className={`${panelBase} ${layoutMode === 'three-up' ? 'hidden' : ''}`}
          style={{ minHeight: 0 }}
        >
          <div className={PANEL_LABEL_CLASS} style={{ color: '#86EFAC' }}>{slabLabel}</div>
        </div>

        {status === 'loading' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#0F172A] text-[#4D94FF]/40">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4D94FF]/30 border-t-[#4D94FF]" />
            <span className="text-[12px] font-mono font-bold uppercase tracking-widest">Loading Volume...</span>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#0F172A] px-6 text-center text-red-400/70">
            <span className="text-[12px] font-mono font-bold">MPR Error: {errorMsg}</span>
          </div>
        )}
      </div>
    );
  }
);

export default CornerstoneMPRViewport;
