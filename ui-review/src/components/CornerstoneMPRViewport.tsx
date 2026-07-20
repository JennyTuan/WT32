import {
  cache,
  cornerstoneStreamingImageVolumeLoader,
  Enums,
  imageLoader,
  RenderingEngine,
  setVolumesForViewports,
  type Types,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import { annotation } from '@cornerstonejs/tools';
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
import { fromVoiRange, getVoiLutFunction, toVoiRange, type VoiLutMode } from '../lib/cornerstone/voi';
import { useI18n } from '../lib/i18nContext';
import { FeedbackViewportOverlay } from './FeedbackNotice';

export type MprPanelId = 'axial' | 'coronal' | 'sagittal';
export type MprActivePanelId = MprPanelId | 'volume';

export type CornerstoneMPRHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fitActive: () => void;
  resetActiveView: () => void;
  resetPlanes: () => void;
  resetAllViews: () => void;
  resetAll: () => void;
  forceWindowLevel: (wc: number, ww: number) => void;
  /**
   * Advance the slice of one MPR panel by `delta` (wraps at boundaries).
   * Cornerstone's built-in crosshairs/reference-line tools handle the
   * cross-panel visual sync; the other two panels' reference lines update
   * automatically as the active panel's slice moves.
   */
  advanceSlice: (panel: MprActivePanelId, delta: number) => void;
};

type RenderMode = 'MPR' | 'MIP' | 'VR' | 'MinIP' | 'Avg';
type LayoutMode = 'four-up' | 'three-up';
type VolumePanelMode = 'slab' | 'volume3d';
type VolumePreset = string;
type InterpolationMode = 'NEAREST' | 'LINEAR' | 'FAST_LINEAR';
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
  onSliceIndexChange?: (panel: MprActivePanelId, sliceIndex: number) => void;
  windowSyncKey?: number;
  layoutMode?: LayoutMode;
  volumePanelMode?: VolumePanelMode;
  volumePreset?: VolumePreset;
  volumeSampleDistanceMultiplier?: number;
  slabThickness?: number;
  invert?: boolean;
  interpolationMode?: InterpolationMode;
  voiLutMode?: VoiLutMode;
  smoothing?: number;
  sharpening?: number;
  phaseBadgeLabel?: string;
  showPhaseBadge?: boolean;
  phaseOptions?: Array<{ index: number; value: number }>;
  selectedPhaseIndex?: number;
  onPhaseChange?: (phase: number) => void;
  /**
   * Currently-selected MPR panel for cine / paging actions. The selected
   * panel receives a blue inset ring; play and the "上一张/下一张" buttons
   * advance the slice along this panel's axis. Crosshairs in the other two
   * panels move automatically because Cornerstone's crosshairs tool keeps
   * them in sync with the volume's camera/focal point.
   */
  activeOrientation?: MprActivePanelId;
  onActiveOrientationChange?: (panel: MprActivePanelId) => void;
  focusedPanel?: MprActivePanelId | null;
  /** Switches the visible plane while an MPR panel is shown as a single window. */
  onFocusedPanelChange?: (panel: MprPanelId) => void;
  /**
   * Optional list of URL-sets (e.g. one per 4D phase) to warm the cornerstone
   * volume cache in the background after mount, so phase-cine playback hits
   * cached volumes instead of cold-loading DICOM on every tick.
   */
  preloadImageUrlsList?: string[][];
  /** When false, disables Cornerstone crosshairs and reference lines in all panels.
   *  Defaults to true (the standard MPR working view). */
  showCrosshairs?: boolean;
  showAnnotations?: boolean;
  stateKey?: string;
}

interface TextAnnotation {
  id: string;
  stateKey: string;
  panel: MprActivePanelId;
  x: number;
  y: number;
  text: string;
}

let volumeLoaderRegistered = false;
function registerVolumeLoader() {
  if (volumeLoaderRegistered) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  volumeLoader.registerVolumeLoader('streaming-wado-image-volume', cornerstoneStreamingImageVolumeLoader as any);
  volumeLoaderRegistered = true;
}

// Wraps StreamingImageVolume.load() in a promise that resolves when the
// volume has finished loading every frame. Callers can then safely call
// setVolumesForViewports without rendering an empty viewport mid-load.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function awaitVolumeLoaded(vol: any): Promise<void> {
  if (vol?.loadStatus?.loaded) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
      resolve();
    };
    // 同一体数据已在加载时，部分加载器不会登记第二个完成回调；轮询状态用于容错。
    const pollTimer = window.setInterval(() => {
      if (vol?.loadStatus?.loaded) finish();
    }, 120);
    const timeoutTimer = window.setTimeout(finish, 120_000);
    try {
      vol.load(finish);
    } catch {
      finish();
    }
  });
}

const PANEL_LABEL_CLASS =
  'pointer-events-none absolute left-2 top-2 inline-flex h-[18px] items-center rounded-full border border-white/10 bg-black/55 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#93C5FD] z-10';
const PHASE_BADGE_CLASS =
  'absolute right-2 top-2 z-10 rounded-md border border-white/15 bg-black/55 px-2 py-1 text-[11px] font-bold tracking-wide text-[#60A5FA] backdrop-blur-sm';
const SLAB_THICKNESS_MM = 150;

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

function getBlendMode(renderMode: RenderMode) {
  if (renderMode === 'MIP') return Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
  if (renderMode === 'MinIP') return Enums.BlendModes.MINIMUM_INTENSITY_BLEND;
  if (renderMode === 'Avg') return Enums.BlendModes.AVERAGE_INTENSITY_BLEND;
  return Enums.BlendModes.COMPOSITE;
}

function isProjectionMode(renderMode: RenderMode) {
  return renderMode === 'MIP' || renderMode === 'MinIP' || renderMode === 'Avg';
}

function getInterpolationType(mode: InterpolationMode) {
  if (mode === 'NEAREST') return Enums.InterpolationType.NEAREST;
  if (mode === 'FAST_LINEAR') return Enums.InterpolationType.FAST_LINEAR;
  return Enums.InterpolationType.LINEAR;
}

const CUSTOM_VOLUME_PRESETS: Record<string, Types.ViewportPreset> = {
  'WT-Head-Soft-Tissue': {
    name: 'WT-Head-Soft-Tissue',
    gradientOpacity: '4 0 0.28 180 1',
    specularPower: '18',
    scalarOpacity: '20 -3024 0 -1000 0 -250 0 -120 0.025 20 0.08 80 0.16 200 0.24 400 0.36 800 0.58 3071 0.88',
    specular: '0.22',
    shade: '1',
    ambient: '0.18',
    colorTransfer: '40 -3024 0 0 0 -1000 0 0 0 -250 0.08 0.025 0.018 -120 0.22 0.07 0.045 20 0.56 0.22 0.16 80 0.86 0.46 0.34 200 0.94 0.66 0.5 400 0.98 0.8 0.61 800 1 0.91 0.74 3071 1 1 0.96',
    diffuse: '0.82',
    interpolation: '1',
  },
  'WT-Head-Bone': {
    name: 'WT-Head-Bone',
    gradientOpacity: '4 0 0.18 260 1',
    specularPower: '24',
    scalarOpacity: '18 -3024 0 -1000 0 120 0 220 0.04 350 0.22 500 0.48 800 0.72 1400 0.88 3071 0.95',
    specular: '0.28',
    shade: '1',
    ambient: '0.14',
    colorTransfer: '36 -3024 0 0 0 -1000 0 0 0 120 0.18 0.07 0.04 220 0.58 0.28 0.16 350 0.84 0.61 0.38 500 0.94 0.8 0.58 800 1 0.92 0.72 1400 1 0.98 0.88 3071 1 1 1',
    diffuse: '0.86',
    interpolation: '1',
  },
};

function applyVolumeRenderingProperties(
  viewport: Types.IVolumeViewport,
  presetName: VolumePreset,
  sampleDistanceMultiplier: number,
  smoothing: number,
  sharpening: number,
) {
  const customPreset = CUSTOM_VOLUME_PRESETS[presetName];
  if (customPreset) {
    // 头部专用曲线只改变模拟显示效果，不修改原始体数据或序列窗宽窗位。
    const actor = viewport.getDefaultActor()?.actor as Types.VolumeActor | undefined;
    if (actor) utilities.applyPreset(actor, customPreset);
    viewport.setProperties({
      sampleDistanceMultiplier,
      smoothing,
      sharpening,
    } as Types.VolumeViewportProperties);
    return;
  }

  viewport.setProperties({
    preset: presetName,
    sampleDistanceMultiplier,
    smoothing,
    sharpening,
  } as Types.VolumeViewportProperties);
}

function resetVolumeRenderingCamera(viewport: Types.IVolumeViewport) {
  viewport.resetCamera();
  const renderer = viewport.getRenderer();
  const camera = renderer.getActiveCamera();
  camera.azimuth(30);
  camera.elevation(58);
  renderer.resetCamera();
  renderer.resetCameraClippingRange();
  viewport.setZoom(viewport.getZoom() * 1.28);
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
      onSliceIndexChange,
      windowSyncKey,
      layoutMode = 'four-up',
      volumePanelMode = 'slab',
      volumePreset = 'CT-Lung',
      volumeSampleDistanceMultiplier = 0.75,
      slabThickness = SLAB_THICKNESS_MM,
      invert = false,
      interpolationMode = 'LINEAR',
      voiLutMode = 'LINEAR',
      smoothing = 0,
      sharpening = 0,
      phaseBadgeLabel,
      showPhaseBadge = false,
      phaseOptions,
      selectedPhaseIndex,
      onPhaseChange,
      activeOrientation,
      onActiveOrientationChange,
      focusedPanel = null,
      onFocusedPanelChange,
      preloadImageUrlsList,
      showCrosshairs: showCrosshairsProp = true,
      showAnnotations = true,
      stateKey = 'default',
    },
    ref
  ) {
    const { t } = useI18n();
    const isFourthVolume3d = volumePanelMode === 'volume3d' && renderMode === 'VR';
    const axialRef = useRef<HTMLDivElement>(null);
    const coronalRef = useRef<HTMLDivElement>(null);
    const sagittalRef = useRef<HTMLDivElement>(null);
    const slabRef = useRef<HTMLDivElement>(null);

    const engineRef = useRef<RenderingEngine | null>(null);
    const lastVoiRef = useRef<{ lower: number; upper: number } | null>(null);
    const lastEmittedVoiRef = useRef<{ lower: number; upper: number } | null>(null);
    const lastEmittedSliceRef = useRef<Partial<Record<PanelId, number>>>({});
    const rafRef = useRef<number | null>(null);

    const engineId = useRef(`mpr-engine-${Math.random().toString(36).slice(2, 9)}`);
    const volumeIdRef = useRef(`streaming-wado-image-volume:mpr-${Math.random().toString(36).slice(2, 9)}`);
    const toolGroupId = useRef(`mpr-tools-${Math.random().toString(36).slice(2, 9)}`);
    const volumeToolGroupId = useRef(`mpr-volume3d-tools-${Math.random().toString(36).slice(2, 9)}`);

    const vpAxial = `${engineId.current}-axial`;
    const vpCoronal = `${engineId.current}-coronal`;
    const vpSagittal = `${engineId.current}-sagittal`;
    const vpSlab = `${engineId.current}-slab`;
    const getViewportIdForPanel = (panel: MprActivePanelId = activeOrientation ?? 'axial') => (
      panel === 'axial' ? vpAxial : panel === 'coronal' ? vpCoronal : panel === 'sagittal' ? vpSagittal : vpSlab
    );
    // 四个视口始终保持挂载；布局切换只改变可见性，避免销毁相机状态和标注。
    const activeViewportIds = useMemo(
      () => [vpAxial, vpCoronal, vpSagittal, vpSlab],
      [vpAxial, vpCoronal, vpSagittal, vpSlab],
    );

    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [isResultInteracting, setIsResultInteracting] = useState(false);
    const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
    const [phasePickerPanel, setPhasePickerPanel] = useState<PanelId | null>(null);
    const phasePickerRef = useRef<HTMLDivElement | null>(null);
    // Engine lifecycle is independent of imageUrls so that phase-cine swaps
    // don't tear down + rebuild the whole cornerstone scene on every tick.
    const [engineReady, setEngineReady] = useState(false);
    const loadedVolumeIdsRef = useRef<Set<string>>(new Set());
    const hasFirstRenderRef = useRef(false);
    const slabViewportIs3dRef = useRef<boolean | null>(null);
    const savedCamerasRef = useRef<Map<string, Types.ICamera>>(new Map());
    const activeStateKeyRef = useRef(stateKey);
    // Latest imageUrls reference, read by the long-lived prewarm walker so it
    // can skip the active phase without being restarted on every cine tick.
    const currentImageUrlsRef = useRef(imageUrls);
    // Keep rotation responsive, then restore the selected sampling quality
    // immediately when the interaction ends.
    const effectiveVolumeSampleDistanceMultiplier = isResultInteracting
      ? Math.max(1.75, volumeSampleDistanceMultiplier * 2.25)
      : volumeSampleDistanceMultiplier;
    useEffect(() => {
      currentImageUrlsRef.current = imageUrls;
    }, [imageUrls]);

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
        const vp = engine.getViewport(getViewportIdForPanel()) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        vp.setZoom(vp.getZoom() * 1.15);
        vp.render();
      },
      zoomOut: () => {
        const engine = engineRef.current;
        if (!engine) return;
        const vp = engine.getViewport(getViewportIdForPanel()) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        vp.setZoom(vp.getZoom() * 0.87);
        vp.render();
      },
      fitActive: () => {
        const engine = engineRef.current;
        if (!engine) return;
        const vp = engine.getViewport(getViewportIdForPanel()) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        const camera = vp.getCamera();
        vp.resetCamera();
        vp.setCamera({ viewPlaneNormal: camera.viewPlaneNormal, viewUp: camera.viewUp });
        vp.render();
      },
      resetActiveView: () => {
        const engine = engineRef.current;
        if (!engine) return;
        const vp = engine.getViewport(getViewportIdForPanel()) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        const activePanel = activeOrientation ?? 'axial';
        if (activePanel !== 'volume') {
          const toolGroup = getOrCreateToolGroup(toolGroupId.current);
          const rotateTool = toolGroup.getToolInstance(TOOL_NAMES.planarRotate) as {
            setAngle?: (target: Types.IVolumeViewport, angle: number) => void;
          } | undefined;
          rotateTool?.setAngle?.(vp, 0);
        }
        // MPR 当前视图复位仅恢复画面内状态，不能顺带改变用户建立的重建平面。
        const camera = activePanel === 'volume' ? null : vp.getCamera();
        vp.resetCamera();
        if (camera) vp.setCamera({ viewPlaneNormal: camera.viewPlaneNormal, viewUp: camera.viewUp });
        vp.render();
      },
      resetPlanes: () => {
        const engine = engineRef.current;
        if (!engine) return;
        const orientations = [
          [vpAxial, Enums.OrientationAxis.AXIAL],
          [vpCoronal, Enums.OrientationAxis.CORONAL],
          [vpSagittal, Enums.OrientationAxis.SAGITTAL],
        ] as const;
        orientations.forEach(([id, orientation]) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
          if (!vp) return;
          vp.setOrientation(orientation);
          vp.resetCamera();
          vp.render();
        });
        const crosshairs = getOrCreateToolGroup(toolGroupId.current).getToolInstance(TOOL_NAMES.crosshairs) as {
          resetCrosshairs?: () => void;
        } | undefined;
        crosshairs?.resetCrosshairs?.();
      },
      resetAllViews: () => {
        const engine = engineRef.current;
        if (!engine) return;
        activeViewportIds.forEach((id) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
          vp?.resetCamera();
          vp?.render();
        });
      },
      resetAll: () => {
        const engine = engineRef.current;
        if (!engine) return;
        activeViewportIds.forEach((id) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
          vp?.resetCamera();
          vp?.render();
        });
      },
      forceWindowLevel: (wc: number, ww: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        const { lower, upper } = toVoiRange(ww, wc, voiLutMode);
        lastVoiRef.current = { lower, upper };
        activeViewportIds.forEach((id) => {
          const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
          vp?.setProperties({ voiRange: { lower, upper } });
          vp?.render();
        });
      },
      advanceSlice: (panel, delta) => {
        const engine = engineRef.current;
        if (!engine) return;
        const vpId =
          panel === 'axial' ? vpAxial : panel === 'coronal' ? vpCoronal : panel === 'sagittal' ? vpSagittal : vpSlab;
        const vp = engine.getViewport(vpId) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const total = (vp as any).getNumberOfSlices?.() ?? 0;
          if (!total || total <= 1) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const current = (vp as any).getSliceIndex?.() ?? 0;
          let next = current + delta;
          // Wrap at boundaries so cine loops continuously.
          while (next < 0) next += total;
          next = next % total;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (vp as any).setSliceIndex?.(next);
          onSliceIndexChange?.(panel, next);
          vp.render();
        } catch {
          /* ignore — viewport not ready */
        }
      },
    }));

    useEffect(() => {
      const allAnnotations = annotation.state.getAllAnnotations();
      allAnnotations.forEach((item) => {
        if (item.annotationUID) {
          annotation.visibility.setAnnotationVisibility(item.annotationUID, showAnnotations);
        }
      });
      engineRef.current?.renderViewports(activeViewportIds);
    }, [activeViewportIds, showAnnotations]);

    // ── Engine lifecycle ─────────────────────────────────────────────────────
    // Create the cornerstone rendering engine once per viewport type. Layout
    // changes are CSS-only so the three/four-window switch retains observation state.
    useEffect(() => {
      const refs = [axialRef.current, coronalRef.current, sagittalRef.current, slabRef.current];
      if (!refs.every(Boolean)) return;

      let disposed = false;
      let ro: ResizeObserver | null = null;
      const mainToolGroupId = toolGroupId.current;
      const volume3dToolGroupId = volumeToolGroupId.current;
      const savedCameras = savedCamerasRef.current;
      (async () => {
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
          slabViewportIs3dRef.current = isFourthVolume3d;
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
          engine.enableElement({
            viewportId: vpSlab,
            type: isFourthVolume3d ? Enums.ViewportType.VOLUME_3D : Enums.ViewportType.ORTHOGRAPHIC,
            element: slabRef.current!,
            defaultOptions: isFourthVolume3d
              ? { background: [0, 0, 0] as [number, number, number] }
              : { orientation: Enums.OrientationAxis.CORONAL, background: [0, 0, 0] as [number, number, number] },
          });

          const toolGroup = getOrCreateToolGroup(mainToolGroupId);
          const primaryToolViewportIds = [vpAxial, vpCoronal, vpSagittal];
          primaryToolViewportIds.forEach((id) => toolGroup.addViewport(id, engineId.current));

          // The fourth result panel deliberately lives outside the MPR group:
          // it must never receive MPR crosshairs/reference lines.
          const resultToolGroup = getOrCreateToolGroup(volume3dToolGroupId);
          resultToolGroup.addViewport(vpSlab, engineId.current);
          resultToolGroup.setToolPassive(TOOL_NAMES.pan);
          resultToolGroup.setToolPassive(TOOL_NAMES.zoom);
          resultToolGroup.setToolPassive(TOOL_NAMES.windowLevel);
          resultToolGroup.setToolPassive(TOOL_NAMES.length);
          resultToolGroup.setToolPassive(TOOL_NAMES.eraser);
          resultToolGroup.setToolPassive(TOOL_NAMES.stackScroll);
          resultToolGroup.setToolPassive(TOOL_NAMES.planarRotate);
          resultToolGroup.setToolPassive(TOOL_NAMES.trackballRotate);
          resultToolGroup.setToolDisabled(TOOL_NAMES.crosshairs);
          resultToolGroup.setToolActive(TOOL_NAMES.zoom, {
            bindings: [{ mouseButton: CornerstoneToolsEnums.MouseBindings.Wheel }],
          });

          ro = new ResizeObserver(() => {
            if (disposed || engineRef.current !== engine) return;
            engine.resize(true, false);
            engine.renderViewports(activeViewportIds);
          });
          refs.forEach((el) => ro?.observe(el!));

          if (disposed) return;
          hasFirstRenderRef.current = false;
          setEngineReady(true);
        } catch (err) {
          console.error('CornerstoneMPRViewport setup failed:', err);
          if (!disposed) {
            setStatus('error');
            setErrorMsg(err instanceof Error ? err.message : String(err));
          }
        }
      })();

      return () => {
        disposed = true;
        setEngineReady(false);
        activeViewportIds.forEach((id) => {
          const camera = (engineRef.current?.getViewport(id) as Types.IVolumeViewport | undefined)?.getCamera();
          if (camera) savedCameras.set(`${stateKey}:${id}`, camera);
        });
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        ro?.disconnect();
        destroyToolGroup(mainToolGroupId);
        destroyToolGroup(volume3dToolGroupId);
        engineRef.current?.destroy();
        engineRef.current = null;
        slabViewportIs3dRef.current = null;
        lastVoiRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [volumePanelMode]);

    useEffect(() => () => {
      // 页面内切换 MPR/投影/体绘制时复用体数据；真正离开页面后再释放缓存。
      loadedVolumeIdsRef.current.forEach((id) => {
        try { cache.removeVolumeLoadObject(id); } catch { /* ok */ }
      });
      loadedVolumeIdsRef.current.clear();
    }, []);

    // The fourth panel changes renderer type between VR and slab projection.
    // Reconfigure that panel only; rebuilding the complete engine would blank
    // the three MPR views and reload the same cached volume on every click.
    useEffect(() => {
      if (!engineReady || status !== 'ready' || slabViewportIs3dRef.current === isFourthVolume3d) return;
      const engine = engineRef.current;
      const volumeId = volumeIdRef.current;
      if (!engine || !slabRef.current || !cache.getVolume(volumeId)) return;

      let cancelled = false;
      try {
        engine.disableElement(vpSlab);
        engine.enableElement({
          viewportId: vpSlab,
          type: isFourthVolume3d ? Enums.ViewportType.VOLUME_3D : Enums.ViewportType.ORTHOGRAPHIC,
          element: slabRef.current,
          defaultOptions: isFourthVolume3d
            ? { background: [0, 0, 0] as [number, number, number] }
            : { orientation: Enums.OrientationAxis.CORONAL, background: [0, 0, 0] as [number, number, number] },
        });
        // disableElement 会让 Cornerstone Tools 自动移除旧视口；重建后必须重新挂回第四窗工具组。
        getOrCreateToolGroup(volumeToolGroupId.current).addViewport(vpSlab, engineId.current);
        slabViewportIs3dRef.current = isFourthVolume3d;

        void setVolumesForViewports(engine, [{ volumeId }], [vpSlab]).then(() => {
          if (cancelled) return;
          const fourthViewport = engine.getViewport(vpSlab) as Types.IVolumeViewport | undefined;
          if (!fourthViewport) return;

          if (isFourthVolume3d) {
            // setVolumesForViewports creates a new actor and resets its
            // properties, so the VR transfer preset must be applied after it.
            applyVolumeRenderingProperties(
              fourthViewport,
              volumePreset,
              effectiveVolumeSampleDistanceMultiplier,
              smoothing,
              sharpening,
            );
            fourthViewport.setBlendMode(Enums.BlendModes.COMPOSITE);
          } else {
            fourthViewport.setProperties({
              invert,
              interpolationType: getInterpolationType(interpolationMode),
              VOILUTFunction: getVoiLutFunction(voiLutMode),
              smoothing,
              sharpening,
            } as Types.VolumeViewportProperties);
            fourthViewport.setBlendMode(getBlendMode(renderMode));
            fourthViewport.setSlabThickness(isProjectionMode(renderMode) ? slabThickness : 1);
          }
          if (isFourthVolume3d) resetVolumeRenderingCamera(fourthViewport);
          else fourthViewport.resetCamera();
          fourthViewport.render();
        }).catch((error) => {
          if (!cancelled) console.error('Fourth result viewport switch failed:', error);
        });
      } catch (error) {
        console.error('Fourth result viewport reconfiguration failed:', error);
      }

      return () => {
        cancelled = true;
      };
    }, [effectiveVolumeSampleDistanceMultiplier, engineReady, interpolationMode, invert, isFourthVolume3d, renderMode, sharpening, slabThickness, smoothing, status, volumePreset, voiLutMode, vpSlab]);

    // ── Volume swap ──────────────────────────────────────────────────────────
    // When imageUrls change (e.g. 4D phase-cine advances phase N → N+1),
    // derive a stable volume ID from the URL set so revisits hit the
    // cornerstone volume cache, then swap with setVolumesForViewports.
    // Camera state is preserved across swaps so playback looks smooth
    // rather than re-fitting on every frame.
    //
    // CRITICAL: setVolumesForViewports is only called once the new volume's
    // pixel data is fully loaded. Otherwise the viewport renders empty for
    // the duration of the load and the cine "blanks" between phases.
    useEffect(() => {
      if (!engineReady || !imageUrls.length) return;
      const engine = engineRef.current;
      if (!engine) return;

      let cancelled = false;
      const isFirstSwap = !hasFirstRenderRef.current;
      // Only show the loading spinner on the very first cold load. Cine swaps
      // either land instantly (cached) or are silently dropped (still loading)
      // — never flash a "loading" state mid-playback.
      if (isFirstSwap) {
        setStatus('loading');
        setErrorMsg('');
      }

      (async () => {
        try {
          // Stable id derived from the URL set so phase 0..9 each get their
          // own cached volume and the second pass through the cine loop is
          // effectively instant.
          const volId = `streaming-wado-image-volume:${engineId.current}:${imageUrls.length}:${imageUrls[0]}`;

          let vol = cache.getVolume(volId);
          if (!vol) {
            const imageIds =
              imageUrls.length === 1 && isMhaVolumeUrl(imageUrls[0])
                ? await buildMhaImageIds(imageUrls[0])
                : imageUrls.length > 1 && imageUrls.every(isMhaVolumeUrl)
                  ? await buildStitchedMhaImageIds(imageUrls)
                  : imageUrls.map(buildWadoImageId);
            if (cancelled) return;
            // Force the first image through the loader so its DICOM header is
            // parsed and registered with the wadouri metadata provider. The
            // streaming volume loader reads imagePixelModule (pixelRepresentation,
            // bitsAllocated, …) synchronously during createAndCacheVolume; without
            // this prefetch, brand-new series (e.g. the LIHVR limbs demo) crash
            // with "Cannot destructure property 'pixelRepresentation' of
            // 'getMetaData(...)' as it is undefined".
            if (imageIds.length && !imageIds[0].startsWith('mha:')) {
              try { await imageLoader.loadAndCacheImage(imageIds[0]); }
              catch (prefetchErr) { console.warn('MPR metadata prefetch failed; volume load may still recover.', prefetchErr); }
              if (cancelled) return;
            }
            vol = await volumeLoader.createAndCacheVolume(volId, { imageIds });
            if (cancelled) return;
            loadedVolumeIdsRef.current.add(volId);
          }

          // For cine ticks: if the new phase isn't fully loaded yet, drop the
          // frame rather than swap to an empty volume. The previous phase
          // stays on screen until prewarm catches up.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const alreadyLoaded = (vol as any)?.loadStatus?.loaded === true;
          if (!isFirstSwap && !alreadyLoaded) {
            // Kick the loader (idempotent) so prewarm-in-progress finishes,
            // but don't swap or block.
            void awaitVolumeLoaded(vol);
            return;
          }

          // First-paint cold load OR cine swap with a cache-hot volume:
          // make sure pixel data is fully there before the swap.
          if (!alreadyLoaded) {
            await awaitVolumeLoaded(vol);
            if (cancelled) return;
          }

          const displayVolumeId = volId;
          volumeIdRef.current = displayVolumeId;

          // 同一序列换时相时保留当前相机；换序列时保存旧状态并恢复目标序列最近状态。
          const scopeChanged = activeStateKeyRef.current !== stateKey;
          if (scopeChanged && hasFirstRenderRef.current) {
            activeViewportIds.forEach((id) => {
              const camera = (engine.getViewport(id) as Types.IVolumeViewport | undefined)?.getCamera();
              if (camera) savedCamerasRef.current.set(`${activeStateKeyRef.current}:${id}`, camera);
            });
          }
          const cameras = activeViewportIds
            .map((id) => {
              const viewport = engine.getViewport(id) as Types.IVolumeViewport | undefined;
              const camera = scopeChanged || !hasFirstRenderRef.current
                ? savedCamerasRef.current.get(`${stateKey}:${id}`)
                : viewport?.getCamera();
              return camera ? { id, camera } : null;
            })
            .filter((item): item is { id: string; camera: Types.ICamera } => item !== null);
          activeStateKeyRef.current = stateKey;

          await setVolumesForViewports(engine, [{ volumeId: displayVolumeId }], activeViewportIds);
          if (cancelled) return;

          if (cameras.length > 0) {
            cameras.forEach(({ id, camera }) => {
              const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
              try { vp?.setCamera(camera); } catch { /* volume geometry may differ */ }
            });
          } else {
            activeViewportIds.forEach((id) => {
              const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
              vp?.resetCamera();
            });
          }

          const requestedVoi = toVoiRange(windowWidth, windowCenter, voiLutMode);
          const lower = lastVoiRef.current?.lower ?? requestedVoi.lower;
          const upper = lastVoiRef.current?.upper ?? requestedVoi.upper;
          lastVoiRef.current = { lower, upper };
          const voiViewportIds = isFourthVolume3d
            ? [vpAxial, vpCoronal, vpSagittal]
            : activeViewportIds;
          voiViewportIds.forEach((id) => {
            (engine.getViewport(id) as Types.IVolumeViewport | undefined)?.setProperties({ voiRange: { lower, upper } });
          });

          engine.renderViewports(activeViewportIds);

          if (!hasFirstRenderRef.current) {
            // First paint: defer a resize+render tick so layout settles.
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = requestAnimationFrame(() => {
                if (cancelled || !engineRef.current) return;
                engineRef.current.resize(true, false);
                engineRef.current.renderViewports(activeViewportIds);
                hasFirstRenderRef.current = true;
                if (!cancelled) setStatus('ready');
              });
            });
          } else if (!cancelled) {
            setStatus('ready');
          }
        } catch (err) {
          console.error('CornerstoneMPRViewport volume load failed:', err);
          if (!cancelled) {
            setStatus('error');
            setErrorMsg(err instanceof Error ? err.message : String(err));
          }
        }
      })();

      return () => {
        cancelled = true;
      };
      // windowCenter/windowWidth intentionally excluded: the dedicated
      // window-level effect below keeps them in sync without thrashing
      // the volume loader.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageUrls, engineReady, activeViewportIds, stateKey, voiLutMode]);

    // ── Background phase pre-warm ────────────────────────────────────────────
    // Walk the URL-sets one at a time and create + fully load each volume in
    // the background. STRICTLY sequential: we await each volume's full load
    // before starting the next, so we never have more than one phase
    // streaming at a time. Otherwise 10 phases × ~99 slices = ~990 parallel
    // requests that choke the network and freeze playback.
    //
    // The active phase (current imageUrls) is read from a ref so this walk
    // is NOT restarted on every cine tick — restarting would mean we
    // re-queue from phase 0 every 500ms and never finish warming anything.
    useEffect(() => {
      if (!engineReady || !preloadImageUrlsList?.length) return;
      let cancelled = false;
      let kickoffTimer: number | null = null;

      const warmAll = async () => {
        // Warm the active phase first so cine has something cache-hot
        // immediately, then walk the rest in array order.
        const ordered = [...preloadImageUrlsList].sort((a, b) => {
          const aActive = a === currentImageUrlsRef.current ? -1 : 0;
          const bActive = b === currentImageUrlsRef.current ? -1 : 0;
          return aActive - bActive;
        });

        for (const urls of ordered) {
          if (cancelled) return;
          if (!urls?.length) continue;
          try {
            const volId = `streaming-wado-image-volume:${engineId.current}:${urls.length}:${urls[0]}`;
            let vol = cache.getVolume(volId);
            if (!vol) {
              const imageIds =
                urls.length === 1 && isMhaVolumeUrl(urls[0])
                  ? await buildMhaImageIds(urls[0])
                  : urls.length > 1 && urls.every(isMhaVolumeUrl)
                    ? await buildStitchedMhaImageIds(urls)
                    : urls.map(buildWadoImageId);
              if (cancelled) return;
              if (imageIds.length && !imageIds[0].startsWith('mha:')) {
                try { await imageLoader.loadAndCacheImage(imageIds[0]); }
                catch (prefetchErr) { console.warn('MPR prewarm metadata prefetch failed.', prefetchErr); }
                if (cancelled) return;
              }
              vol = await volumeLoader.createAndCacheVolume(volId, { imageIds });
              if (cancelled) return;
              loadedVolumeIdsRef.current.add(volId);
            }
            // Wait until this phase is fully in cache before starting the
            // next one — this is the key serialisation point.
            await awaitVolumeLoaded(vol);
          } catch (err) {
            // Best-effort — don't break playback if one phase fails to warm.
            console.warn('Phase volume pre-warm failed:', err);
          }
        }
      };

      // Let the active volume start streaming first, then kick off warms.
      kickoffTimer = window.setTimeout(() => { void warmAll(); }, 250);

      return () => {
        cancelled = true;
        if (kickoffTimer !== null) window.clearTimeout(kickoffTimer);
      };
    }, [engineReady, preloadImageUrlsList]);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine || status !== 'ready') return;

      const { lower, upper } = toVoiRange(windowWidth, windowCenter, voiLutMode);
      lastVoiRef.current = { lower, upper };
      lastEmittedVoiRef.current = { lower, upper };
      const voiViewportIds = isFourthVolume3d
        ? [vpAxial, vpCoronal, vpSagittal]
        : activeViewportIds;
      voiViewportIds.forEach((id) => {
        const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
        vp?.setProperties({ voiRange: { lower, upper } });
        vp?.render();
      });
    }, [activeViewportIds, isFourthVolume3d, layoutMode, status, voiLutMode, vpAxial, vpCoronal, vpSagittal, windowCenter, windowWidth, windowSyncKey]);

    useEffect(() => {
      const mprViewportElements = [
        { element: axialRef.current, viewportId: vpAxial },
        { element: coronalRef.current, viewportId: vpCoronal },
        { element: sagittalRef.current, viewportId: vpSagittal },
      ];
      if (status !== 'ready' || !onWindowLevelChange || mprViewportElements.some(({ element }) => !element)) return;

      const makeHandleRendered = (viewportId: string) => () => {
        const vp = engineRef.current?.getViewport(viewportId) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        try {
          const props = vp.getProperties();
          if (!props.voiRange) return;
          const { lower, upper } = props.voiRange;
          const last = lastEmittedVoiRef.current;
          if (last && Math.abs(last.lower - lower) < 1.0 && Math.abs(last.upper - upper) < 1.0) return;
          lastVoiRef.current = { lower, upper };
          lastEmittedVoiRef.current = { lower, upper };
          const { windowCenter: wc, windowWidth: ww } = fromVoiRange(lower, upper, voiLutMode);
          onWindowLevelChange(wc, ww);
        } catch {
          // ignore
        }
      };

      const subscriptions = mprViewportElements.map(({ element, viewportId }) => {
        const handleRendered = makeHandleRendered(viewportId);
        element!.addEventListener(Enums.Events.VOI_MODIFIED, handleRendered);
        return () => {
          element!.removeEventListener(Enums.Events.VOI_MODIFIED, handleRendered);
        };
      });

      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    }, [onWindowLevelChange, status, voiLutMode, vpAxial, vpCoronal, vpSagittal]);

    useEffect(() => {
      const mprViewportElements: Array<{ element: HTMLDivElement | null; panel: PanelId; viewportId: string }> = [
        { element: axialRef.current, panel: 'axial', viewportId: vpAxial },
        { element: coronalRef.current, panel: 'coronal', viewportId: vpCoronal },
        { element: sagittalRef.current, panel: 'sagittal', viewportId: vpSagittal },
      ];
      if (status !== 'ready' || !onSliceIndexChange || mprViewportElements.some(({ element }) => !element)) return;

      const emitSliceIndex = (panel: PanelId, viewportId: string) => {
        const vp = engineRef.current?.getViewport(viewportId) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = (vp as any).getSliceIndex?.();
          if (typeof raw !== 'number' || !Number.isFinite(raw)) return;
          const next = Math.round(raw);
          if (lastEmittedSliceRef.current[panel] === next) return;
          lastEmittedSliceRef.current[panel] = next;
          onSliceIndexChange(panel, next);
        } catch {
          // ignore
        }
      };

      const subscriptions = mprViewportElements.map(({ element, panel, viewportId }) => {
        const handleRendered = () => emitSliceIndex(panel, viewportId);
        handleRendered();
        element!.addEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
        return () => {
          element!.removeEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
        };
      });

      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    }, [onSliceIndexChange, status, vpAxial, vpCoronal, vpSagittal]);

    useEffect(() => {
      if (status !== 'ready') return;
      const toolGroup = getOrCreateToolGroup(toolGroupId.current);
      const enableMprCrosshairs = showCrosshairsProp && (
        volumePanelMode === 'volume3d' || layoutMode === 'four-up' || renderMode === 'MPR'
      );
      {
        const volumeToolGroup = getOrCreateToolGroup(volumeToolGroupId.current);
        const volumeToolNames = [
          TOOL_NAMES.pan,
          TOOL_NAMES.zoom,
          TOOL_NAMES.windowLevel,
          TOOL_NAMES.length,
          TOOL_NAMES.eraser,
          TOOL_NAMES.stackScroll,
          TOOL_NAMES.planarRotate,
          TOOL_NAMES.trackballRotate,
        ];
        volumeToolNames.forEach((name) => volumeToolGroup.setToolPassive(name));
        volumeToolGroup.setToolDisabled(TOOL_NAMES.crosshairs);
        const volumePrimary = activeOrientation === 'volume'
          ? activeTool === 'trackballRotate'
            ? TOOL_NAMES.trackballRotate
            : activeTool === 'planarRotate'
              ? TOOL_NAMES.planarRotate
            : activeTool === 'window'
              ? TOOL_NAMES.windowLevel
              : activeTool === 'ruler'
                ? TOOL_NAMES.length
                : activeTool === 'eraser'
                  ? TOOL_NAMES.eraser
                  : activeTool === 'annotate'
                    ? undefined
                    : TOOL_NAMES.pan
          : undefined;
        if (volumePrimary) {
          volumeToolGroup.setToolActive(volumePrimary, {
            bindings: [
              { mouseButton: CornerstoneToolsEnums.MouseBindings.Primary },
              { numTouchPoints: 1 },
            ],
          });
        }
        volumeToolGroup.setToolActive(TOOL_NAMES.zoom, {
          bindings: [{ mouseButton: CornerstoneToolsEnums.MouseBindings.Wheel }],
        });
      }
      const setToolsPassive = () => {
        toolGroup.setToolPassive(TOOL_NAMES.pan);
        toolGroup.setToolPassive(TOOL_NAMES.zoom);
        toolGroup.setToolPassive(TOOL_NAMES.windowLevel);
        toolGroup.setToolPassive(TOOL_NAMES.length);
        toolGroup.setToolPassive(TOOL_NAMES.eraser);
        toolGroup.setToolPassive(TOOL_NAMES.trackballRotate);
        toolGroup.setToolPassive(TOOL_NAMES.stackScroll);
        toolGroup.setToolPassive(TOOL_NAMES.planarRotate);
        toolGroup.setToolPassive(TOOL_NAMES.crosshairs);
      };
      const setPrimaryTool = (toolName?: string) => {
        setToolsPassive();
        if (enableMprCrosshairs) toolGroup.setToolEnabled(TOOL_NAMES.crosshairs);
        else toolGroup.setToolDisabled(TOOL_NAMES.crosshairs);
        if (!toolName) return;
        toolGroup.setToolActive(toolName, {
          bindings: [
            { mouseButton: CornerstoneToolsEnums.MouseBindings.Primary },
            { numTouchPoints: 1 },
          ],
        });
        if (toolName !== TOOL_NAMES.stackScroll) {
          toolGroup.setToolActive(TOOL_NAMES.stackScroll, {
            bindings: [{ mouseButton: CornerstoneToolsEnums.MouseBindings.Wheel }],
          });
        }
      };

      if (activeOrientation === 'volume') {
        setToolsPassive();
        return;
      }

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
        case 'stackScroll':
          setPrimaryTool(TOOL_NAMES.stackScroll);
          break;
        case 'planarRotate':
          setPrimaryTool(TOOL_NAMES.planarRotate);
          break;
        case 'trackballRotate':
          setPrimaryTool(TOOL_NAMES.trackballRotate);
          break;
        case 'annotate':
          setPrimaryTool();
          break;
        case 'crosshairs':
          setToolsPassive();
          if (enableMprCrosshairs) {
            toolGroup.setToolActive(TOOL_NAMES.crosshairs, {
              bindings: [
                { mouseButton: CornerstoneToolsEnums.MouseBindings.Primary },
                { numTouchPoints: 1 },
              ],
            });
          } else {
            toolGroup.setToolDisabled(TOOL_NAMES.crosshairs);
          }
          break;
        default:
          setPrimaryTool(TOOL_NAMES.pan);
          break;
      }
    }, [activeOrientation, activeTool, isFourthVolume3d, layoutMode, renderMode, status, volumePanelMode, showCrosshairsProp]);

    // 平板双指手势：捏合缩放，同时允许移动双指中点来平移当前视口。
    useEffect(() => {
      if (status !== 'ready') return;
      const targets = [
        [axialRef.current, vpAxial],
        [coronalRef.current, vpCoronal],
        [sagittalRef.current, vpSagittal],
        ...(layoutMode === 'four-up' ? [[slabRef.current, vpSlab] as const] : []),
      ] as const;
      const cleanups: Array<() => void> = [];

      targets.forEach(([element, viewportId]) => {
        if (!element) return;
        let gesture: {
          distance: number;
          midpoint: [number, number];
          zoom: number;
          pan: [number, number];
        } | null = null;
        const readPair = (event: TouchEvent) => {
          if (event.touches.length < 2) return null;
          const first = event.touches[0];
          const second = event.touches[1];
          return {
            distance: Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)),
            midpoint: [(first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2] as [number, number],
          };
        };
        const handleTouchStart = (event: TouchEvent) => {
          const pair = readPair(event);
          const viewport = engineRef.current?.getViewport(viewportId) as Types.IVolumeViewport | undefined;
          if (!pair || !viewport) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const pan = viewport.getPan();
          gesture = { ...pair, zoom: viewport.getZoom(), pan: [pan[0], pan[1]] };
        };
        const handleTouchMove = (event: TouchEvent) => {
          const pair = readPair(event);
          const viewport = engineRef.current?.getViewport(viewportId) as Types.IVolumeViewport | undefined;
          if (!pair || !viewport || !gesture) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          viewport.setZoom(Math.min(20, Math.max(0.2, gesture.zoom * (pair.distance / gesture.distance))));
          viewport.setPan([
            gesture.pan[0] + pair.midpoint[0] - gesture.midpoint[0],
            gesture.pan[1] + pair.midpoint[1] - gesture.midpoint[1],
          ]);
          viewport.render();
        };
        const handleTouchEnd = (event: TouchEvent) => {
          if (event.touches.length < 2) gesture = null;
        };
        element.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
        element.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
        element.addEventListener('touchend', handleTouchEnd, { capture: true });
        element.addEventListener('touchcancel', handleTouchEnd, { capture: true });
        cleanups.push(() => {
          element.removeEventListener('touchstart', handleTouchStart, true);
          element.removeEventListener('touchmove', handleTouchMove, true);
          element.removeEventListener('touchend', handleTouchEnd, true);
          element.removeEventListener('touchcancel', handleTouchEnd, true);
        });
      });

      return () => cleanups.forEach((cleanup) => cleanup());
    }, [layoutMode, status, vpAxial, vpCoronal, vpSagittal, vpSlab]);

    useEffect(() => {
      if (status !== 'ready') return;
      const engine = engineRef.current;
      if (!engine) return;

      const blendMode = getBlendMode(renderMode);
      // In the standard four-window viewer, renderMode only belongs to the
      // fourth result panel. Axial/coronal/sagittal remain true MPR views.
      const useProjectionForMprPanels =
        volumePanelMode !== 'volume3d' && isProjectionMode(renderMode) && layoutMode === 'three-up';
      const commonProperties: Types.VolumeViewportProperties = {
        invert,
        interpolationType: getInterpolationType(interpolationMode),
        VOILUTFunction: getVoiLutFunction(voiLutMode),
        smoothing,
        sharpening,
      };
      const panelViewportIds = [vpAxial, vpCoronal, vpSagittal];
      panelViewportIds.forEach((id) => {
        const vp = engine.getViewport(id) as Types.IVolumeViewport | undefined;
        if (!vp) return;
        try {
          vp.setProperties(commonProperties);
          vp.setBlendMode(useProjectionForMprPanels ? blendMode : Enums.BlendModes.COMPOSITE);
          vp.setSlabThickness(useProjectionForMprPanels ? slabThickness : 1);
          vp.render();
        } catch {
          // 渲染器切换瞬间 Actor 可能尚未挂载，体数据就绪后的下一次同步会自动补齐。
        }
      });

      if (layoutMode === 'three-up') return;

      const fourthVp = engine.getViewport(vpSlab) as Types.IVolumeViewport | undefined;
      if (!fourthVp) return;

      try {
        if (isFourthVolume3d) {
          applyVolumeRenderingProperties(
            fourthVp,
            volumePreset,
            effectiveVolumeSampleDistanceMultiplier,
            smoothing,
            sharpening,
          );
          fourthVp.setBlendMode(Enums.BlendModes.COMPOSITE);
        } else {
          fourthVp.setProperties(commonProperties);
          fourthVp.setBlendMode(blendMode);
          fourthVp.setSlabThickness(isProjectionMode(renderMode) ? slabThickness : 1);
        }
        fourthVp.render();
      } catch {
        // 第四窗重建期间忽略一次中间态参数同步，避免快速切换导致页面白屏。
      }
    }, [effectiveVolumeSampleDistanceMultiplier, interpolationMode, invert, isFourthVolume3d, layoutMode, renderMode, sharpening, slabThickness, smoothing, status, voiLutMode, volumePanelMode, volumePreset, vpAxial, vpCoronal, vpSagittal, vpSlab]);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine || status !== 'ready' || currentSliceIndex === undefined) return;
      const vp = engine.getViewport(vpAxial) as Types.IVolumeViewport | undefined;
      if (!vp) return;
      try {
        if (vp.getSliceIndex() !== currentSliceIndex) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (vp as any).setSliceIndex(currentSliceIndex);
          vp.render();
        }
      } catch (e) {
        console.warn('Failed to set axial slice index:', e);
      }
    }, [currentSliceIndex, status, vpAxial]);

    const visibleAnnotations = useMemo(
      () => showAnnotations ? textAnnotations.filter((item) => item.stateKey === stateKey) : [],
      [showAnnotations, stateKey, textAnnotations],
    );
    const panelBase = 'relative overflow-hidden bg-black touch-none';
    const volumeCursorClass = isFourthVolume3d && activeTool === 'trackballRotate'
      ? isResultInteracting
        ? 'cursor-grabbing [&_canvas]:!cursor-grabbing'
        : 'cursor-grab [&_canvas]:!cursor-grab'
      : '';
    const slabLabel = volumePanelMode === 'volume3d'
      ? renderMode === 'VR' ? 'VR' : renderMode
      : renderMode === 'MIP' ? 'MIP' : renderMode === 'MinIP' ? 'MinIP' : renderMode === 'Avg' ? 'Avg' : 'Coronal';
    const renderPanelLabel = (panel: MprPanelId, label: string) => {
      const canSelectSingleWindowView = focusedPanel === panel && volumePanelMode === 'volume3d';
      if (!canSelectSingleWindowView) return <div className={PANEL_LABEL_CLASS}>{label}</div>;

      return (
        <div
          className="absolute left-2 top-2 z-10 flex overflow-hidden rounded-lg border border-white/15 bg-[#07111F]/95 p-0.5 shadow-lg"
          role="group"
          aria-label="单窗视角"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {([
            ['axial', '轴位'],
            ['coronal', '冠状'],
            ['sagittal', '矢状'],
          ] as const).map(([option, optionLabel]) => (
            <button
              key={option}
              type="button"
              title={option}
              aria-pressed={focusedPanel === option}
              onClick={(event) => {
                event.stopPropagation();
                onFocusedPanelChange?.(option);
                onActiveOrientationChange?.(option);
              }}
              className={`rounded-md px-2 py-1 text-[10px] font-black tracking-[0.06em] transition-colors ${focusedPanel === option
                ? 'bg-[#2563EB] text-white'
                : 'text-[#BFDBFE] hover:bg-white/10 hover:text-white'
                }`}
            >
              {optionLabel}
            </button>
          ))}
        </div>
      );
    };

    const renderTextAnnotations = (panel: MprActivePanelId) =>
      visibleAnnotations
        .filter((item) => item.panel === panel)
        .map((annotation) => (
          <div
            key={annotation.id}
            className={`absolute z-[12] flex items-center gap-1 ${activeTool === 'eraser' || activeTool === 'annotate' ? 'cursor-pointer' : 'pointer-events-none'}`}
            style={{
              left: `${annotation.x}%`,
              top: `${annotation.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (activeTool === 'eraser') {
                setTextAnnotations((prev) => prev.filter((item) => item.id !== annotation.id));
                return;
              }
              if (activeTool === 'annotate') {
                const text = window.prompt('请输入标注文字', annotation.text)?.trim();
                if (text) setTextAnnotations((prev) => prev.map((item) => item.id === annotation.id ? { ...item, text } : item));
              }
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

    const renderAnnotateLayer = (panel: MprActivePanelId, refEl: RefObject<HTMLDivElement | null>) => (
      <div
        className={`absolute inset-0 z-[11] ${activeTool === 'annotate' ? 'cursor-cell' : 'pointer-events-none'}`}
        onClick={(e) => {
          if (activeTool !== 'annotate' || !refEl.current) return;
          const point = toPercentPoint(refEl.current, e.clientX, e.clientY);
          const noteCount = textAnnotations.filter((item) => item.stateKey === stateKey && item.panel === panel).length;
          const text = window.prompt('请输入标注文字', `标注 ${noteCount + 1}`)?.trim();
          if (!text) return;
          setTextAnnotations((prev) => [
            ...prev,
            {
              id: makeId('text'),
              stateKey,
              panel,
              x: point.x,
              y: point.y,
              text,
            },
          ]);
        }}
      />
    );

    const getPanelLayoutClass = (panel: MprActivePanelId) => {
      if (focusedPanel) {
        return focusedPanel === panel ? 'col-start-1 row-start-1' : 'hidden';
      }
      if (layoutMode !== 'three-up') return '';
      if (panel === 'axial') return 'col-start-1 row-start-1';
      if (panel === 'coronal') return 'col-start-2 row-start-1 row-span-2';
      if (panel === 'sagittal') return 'col-start-1 row-start-2';
      return 'hidden';
    };

    return (
      <div
        className={className ?? 'flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-[#0F172A]'}
        style={focusedPanel
          ? { minHeight: 0, gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
          : { minHeight: 0 }}
      >
        <div
          ref={axialRef}
          onPointerDown={() => onActiveOrientationChange?.('axial')}
          className={`${panelBase} ${getPanelLayoutClass('axial')} ${activeOrientation === 'axial' ? 'ring-2 ring-inset ring-[#4D94FF]' : ''}`}
          style={{ minHeight: 0 }}
        >
          {renderPanelLabel('axial', 'Axial')}
          {renderPhaseBadge('axial')}
          {renderAnnotateLayer('axial', axialRef)}
          {renderTextAnnotations('axial')}
        </div>
        <div
          ref={coronalRef}
          onPointerDown={() => onActiveOrientationChange?.('coronal')}
          className={`${panelBase} ${getPanelLayoutClass('coronal')} ${activeOrientation === 'coronal' ? 'ring-2 ring-inset ring-[#4D94FF]' : ''}`}
          style={{ minHeight: 0 }}
        >
          {renderPanelLabel('coronal', 'Coronal')}
          {renderPhaseBadge('coronal')}
          {renderAnnotateLayer('coronal', coronalRef)}
          {renderTextAnnotations('coronal')}
        </div>
        <div
          ref={sagittalRef}
          onPointerDown={() => onActiveOrientationChange?.('sagittal')}
          className={`${panelBase} ${getPanelLayoutClass('sagittal')} ${activeOrientation === 'sagittal' ? 'ring-2 ring-inset ring-[#4D94FF]' : ''}`}
          style={{ minHeight: 0 }}
        >
          {renderPanelLabel('sagittal', 'Sagittal')}
          {renderPhaseBadge('sagittal')}
          {renderAnnotateLayer('sagittal', sagittalRef)}
          {renderTextAnnotations('sagittal')}
        </div>
        <div
          ref={slabRef}
          onPointerDown={() => {
            onActiveOrientationChange?.('volume');
            if (isFourthVolume3d) setIsResultInteracting(true);
          }}
          onPointerUp={() => setIsResultInteracting(false)}
          onPointerCancel={() => setIsResultInteracting(false)}
          onPointerLeave={(event) => {
            if (event.buttons === 0) setIsResultInteracting(false);
          }}
          className={`${panelBase} ${volumeCursorClass} ${getPanelLayoutClass('volume')} ${activeOrientation === 'volume' ? 'ring-2 ring-inset ring-[#4D94FF]' : ''}`}
          style={{ minHeight: 0 }}
        >
          <div className={PANEL_LABEL_CLASS} style={{ color: '#86EFAC' }}>{slabLabel}</div>
          {renderMode !== 'VR' && renderAnnotateLayer('volume', slabRef)}
          {renderTextAnnotations('volume')}
        </div>

        {status === 'loading' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#0F172A] text-[#4D94FF]/40">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4D94FF]/30 border-t-[#4D94FF]" />
            <span className="text-[12px] font-mono font-bold uppercase tracking-widest">Loading Volume...</span>
          </div>
        )}
        {status === 'error' && (
          <FeedbackViewportOverlay title={t('dicomError.unknown' as never)} message={errorMsg} />
        )}
      </div>
    );
  }
);

export default CornerstoneMPRViewport;
