import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  cache,
  cornerstoneStreamingImageVolumeLoader,
  Enums,
  RenderingEngine,
  setVolumesForViewports,
  type Types,
  volumeLoader,
} from '@cornerstonejs/core';

import {
  buildWadoImageId,
  CornerstoneToolsEnums,
  destroyToolGroup,
  getOrCreateToolGroup,
  initCornerstone,
  TOOL_NAMES,
} from '../lib/cornerstone/initCornerstone';

export type CornerstoneMPRHandle = {
  resetAll: () => void;
};

interface CornerstoneMPRViewportProps {
  imageUrls: string[];
  windowCenter?: number;
  windowWidth?: number;
  onWindowLevelChange?: (wc: number, ww: number) => void;
  activeTool?: string;
  renderMode?: 'MPR' | 'MIP' | 'VR' | 'MinIP';
  className?: string;
  currentSliceIndex?: number;
}

let volumeLoaderRegistered = false;
function registerVolumeLoader() {
  if (volumeLoaderRegistered) return;
  volumeLoader.registerVolumeLoader('streaming-wado-image-volume', cornerstoneStreamingImageVolumeLoader as any);
  volumeLoaderRegistered = true;
}

const PANEL_LABEL_CLASS =
  'pointer-events-none absolute left-2 top-2 inline-flex h-[18px] items-center rounded-full border border-white/10 bg-black/55 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#93C5FD] z-10';

// Slab thickness (mm) used for the 4th panel in MIP / MinIP modes
const SLAB_THICKNESS_MM = 150;

const CornerstoneMPRViewport = forwardRef<CornerstoneMPRHandle, CornerstoneMPRViewportProps>(
  function CornerstoneMPRViewport(
    {
      imageUrls,
      windowCenter = 40,
      windowWidth = 400,
      onWindowLevelChange,
      activeTool = 'pan',
      renderMode = 'MPR',
      className,
      currentSliceIndex,
    },
    ref
  ) {
    const axialRef    = useRef<HTMLDivElement>(null);
    const coronalRef  = useRef<HTMLDivElement>(null);
    const sagittalRef = useRef<HTMLDivElement>(null);
    const slabRef     = useRef<HTMLDivElement>(null); // 4th panel — thick-slab ORTHOGRAPHIC

    const engineRef      = useRef<RenderingEngine | null>(null);
    const lastVoiRef     = useRef<{ lower: number; upper: number } | null>(null);
    const rafRef         = useRef<number | null>(null);

    const engineId    = useRef(`mpr-engine-${Math.random().toString(36).slice(2, 9)}`);
    const volumeIdRef = useRef(`streaming-wado-image-volume:mpr-${Math.random().toString(36).slice(2, 9)}`);
    const toolGroupId = useRef(`mpr-tools-${Math.random().toString(36).slice(2, 9)}`);

    const vpAxial    = `${engineId.current}-axial`;
    const vpCoronal  = `${engineId.current}-coronal`;
    const vpSagittal = `${engineId.current}-sagittal`;
    const vpSlab     = `${engineId.current}-slab`;   // was vpVolume
    const allVpIds   = [vpAxial, vpCoronal, vpSagittal, vpSlab];

    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    useImperativeHandle(ref, () => ({
      resetAll: () => {
        const engine = engineRef.current;
        if (!engine) return;
        allVpIds.forEach((id) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport;
          if (!vp) return;
          vp.resetCamera();
          vp.render();
        });
      },
    }));

    // ─── Setup ───────────────────────────────────────────────────────────────
    useEffect(() => {
      if (!imageUrls.length) return;
      const els = [axialRef.current, coronalRef.current, sagittalRef.current, slabRef.current];
      if (!els.every(Boolean)) return;

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

          // ── All 4 panels are ORTHOGRAPHIC — reliable across all datasets ──
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
          // 4th panel: coronal thick-slab — orientation matches coronal but will
          // use slab thickness + blend mode to project as MIP / MinIP.
          engine.enableElement({
            viewportId: vpSlab,
            type: Enums.ViewportType.ORTHOGRAPHIC,
            element: slabRef.current!,
            defaultOptions: { orientation: Enums.OrientationAxis.CORONAL, background: [0, 0, 0] as [number, number, number] },
          });

          // Tool group — all 4 panels
          const toolGroup = getOrCreateToolGroup(toolGroupId.current);
          allVpIds.forEach((id) => toolGroup.addViewport(id, engineId.current));

          // Volume
          const volId = volumeIdRef.current;
          const imageIds = imageUrls.map(buildWadoImageId);

          if (!cache.getVolume(volId)) {
            const vol = await volumeLoader.createAndCacheVolume(volId, { imageIds });
            if (disposed) return;
            vol.load(); // streaming — don't await
          } else {
            (cache.getVolume(volId) as any)?.load();
          }

          if (disposed) return;

          // Set volume on all 4 viewports in one call
          await setVolumesForViewports(engine, [{ volumeId: volId }], allVpIds);
          if (disposed) return;

          // Apply initial WW/WL to all panels
          const lower = windowCenter - windowWidth / 2;
          const upper = windowCenter + windowWidth / 2;
          lastVoiRef.current = { lower, upper };
          allVpIds.forEach((id) => {
            (engine.getViewport(id) as Types.IVolumeViewport)?.setProperties({ voiRange: { lower, upper } });
          });

          // Apply initial slab mode to 4th panel
          const slabVp = engine.getViewport(vpSlab) as Types.IVolumeViewport | undefined;
          if (slabVp) {
            slabVp.setBlendMode(Enums.BlendModes.MAXIMUM_INTENSITY_BLEND);
            slabVp.setProperties({ slabThickness: SLAB_THICKNESS_MM });
          }

          // ResizeObserver
          ro = new ResizeObserver(() => {
            engine.resize(true, false);
            engine.renderViewports(allVpIds);
          });
          els.forEach((el) => ro!.observe(el!));

          // Initial render
          engine.resize(true, false);
          engine.renderViewports(allVpIds);

          // ── Double rAF: wait for CSS grid to paint real heights before
          //    resizing and resetting cameras (fixes axial height=0 issue). ──
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = requestAnimationFrame(() => {
              if (disposed || !engineRef.current) return;
              engineRef.current.resize(true, false);
              allVpIds.forEach((id) => {
                const vp = engineRef.current?.getViewport(id) as Types.IVolumeViewport | undefined;
                vp?.resetCamera();
              });
              engineRef.current.renderViewports(allVpIds);
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
    }, [imageUrls]);

    // ─── WW/WL sync ──────────────────────────────────────────────────────────
    useEffect(() => {
      const engine = engineRef.current;
      if (!engine || status !== 'ready') return;

      const lower = windowCenter - windowWidth / 2;
      const upper = windowCenter + windowWidth / 2;
      const last = lastVoiRef.current;
      if (last && Math.abs(last.lower - lower) < 0.5 && Math.abs(last.upper - upper) < 0.5) return;

      lastVoiRef.current = { lower, upper };
      allVpIds.forEach((id) => {
        const vp = engineRef.current?.getViewport(id) as Types.IVolumeViewport | undefined;
        vp?.setProperties({ voiRange: { lower, upper } });
        vp?.render();
      });
    }, [status, windowCenter, windowWidth]);

    // ─── WW/WL feedback (axial panel IMAGE_RENDERED) ─────────────────────────
    useEffect(() => {
      const el = axialRef.current;
      if (!el || status !== 'ready' || !onWindowLevelChange) return;

      const handleRendered = () => {
        const vp = engineRef.current?.getViewport(vpAxial) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        try {
          const props = vp.getProperties();
          if (props.voiRange) {
            const ww = props.voiRange.upper - props.voiRange.lower;
            const wc = (props.voiRange.upper + props.voiRange.lower) / 2;
            lastVoiRef.current = { lower: props.voiRange.lower, upper: props.voiRange.upper };
            onWindowLevelChange(wc, ww);
          }
        } catch { /* ignore */ }
      };

      el.addEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
      return () => el.removeEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
    }, [status, onWindowLevelChange]);

    // ─── Active tool switching ────────────────────────────────────────────────
    useEffect(() => {
      if (status !== 'ready') return;

      const toolGroup = getOrCreateToolGroup(toolGroupId.current);
      const setActive = (toolName: string) => {
        toolGroup.setToolPassive(TOOL_NAMES.pan);
        toolGroup.setToolPassive(TOOL_NAMES.zoom);
        toolGroup.setToolPassive(TOOL_NAMES.windowLevel);
        toolGroup.setToolPassive(TOOL_NAMES.length);
        toolGroup.setToolActive(toolName, {
          bindings: [{ mouseButton: CornerstoneToolsEnums.MouseBindings.Primary }],
        });
      };

      switch (activeTool) {
        case 'window': setActive(TOOL_NAMES.windowLevel); break;
        case 'ruler':  setActive(TOOL_NAMES.length); break;
        case 'zoom':   setActive(TOOL_NAMES.zoom); break;
        default:       setActive(TOOL_NAMES.pan); break;
      }
    }, [activeTool, status]);

    // ─── Render mode: adjust 4th panel slab blend ────────────────────────────
    useEffect(() => {
      if (status !== 'ready') return;
      const vp = engineRef.current?.getViewport(vpSlab) as Types.IVolumeViewport | undefined;
      if (!vp) return;

      // All render modes use ORTHOGRAPHIC with slab thickness.
      // MPR / VR → thin slab (normal MPR view)
      // MIP      → thick slab Maximum Intensity
      // MinIP    → thick slab Minimum Intensity
      if (renderMode === 'MIP') {
        vp.setBlendMode(Enums.BlendModes.MAXIMUM_INTENSITY_BLEND);
        vp.setProperties({ slabThickness: SLAB_THICKNESS_MM });
      } else if (renderMode === 'MinIP') {
        vp.setBlendMode(Enums.BlendModes.MINIMUM_INTENSITY_BLEND);
        vp.setProperties({ slabThickness: SLAB_THICKNESS_MM });
      } else {
        // MPR or VR: show as normal coronal MPR
        vp.setBlendMode(Enums.BlendModes.COMPOSITE);
        vp.setProperties({ slabThickness: 1 });
      }
      vp.render();
    }, [renderMode, status]);
 
    // ─── Cine / Slice sync ───────────────────────────────────────────────────
    useEffect(() => {
      const engine = engineRef.current;
      if (!engine || status !== 'ready' || currentSliceIndex === undefined) return;
 
      const vp = engine.getViewport(vpAxial) as Types.IVolumeViewport | undefined;
      if (!vp) return;
 
      try {
        // Only set if different to avoid redundant renders
        if (vp.getSliceIndex() !== currentSliceIndex) {
          (vp as any).setSliceIndex(currentSliceIndex);
          vp.render();
        }
      } catch (e) {
        console.warn('Failed to set axial slice index:', e);
      }
    }, [currentSliceIndex, status]);

    // ─── Render ───────────────────────────────────────────────────────────────
    const panelBase = 'relative overflow-hidden bg-black';

    // Label for the 4th panel
    const slabLabel =
      renderMode === 'MIP'   ? 'MIP' :
      renderMode === 'MinIP' ? 'MinIP' :
      'Coronal';

    return (
      <div
        className={className ?? 'flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-[#0F172A]'}
        style={{ minHeight: 0 }}
      >
        {/* ── Four panels ── */}
        <div ref={axialRef}    className={panelBase} style={{ minHeight: 0 }}>
          <div className={PANEL_LABEL_CLASS}>Axial</div>
        </div>
        <div ref={coronalRef}  className={panelBase} style={{ minHeight: 0 }}>
          <div className={PANEL_LABEL_CLASS}>Coronal</div>
        </div>
        <div ref={sagittalRef} className={panelBase} style={{ minHeight: 0 }}>
          <div className={PANEL_LABEL_CLASS}>Sagittal</div>
        </div>
        <div ref={slabRef} className={panelBase} style={{ minHeight: 0 }}>
          <div className={PANEL_LABEL_CLASS} style={{ color: '#86EFAC' }}>{slabLabel}</div>
        </div>

        {/* ── Loading / error overlays ── */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0F172A] z-20 text-[#4D94FF]/40">
            <div className="w-8 h-8 border-2 border-[#4D94FF]/30 border-t-[#4D94FF] rounded-full animate-spin" />
            <span className="text-[12px] font-mono font-bold uppercase tracking-widest">Loading Volume…</span>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-red-400/70 bg-[#0F172A] z-20">
            <span className="text-[12px] font-mono font-bold">MPR Error: {errorMsg}</span>
          </div>
        )}
      </div>
    );
  }
);

export default CornerstoneMPRViewport;
