import {
  Enums as CornerstoneEnums,
  init as initCornerstoneCore,
  isCornerstoneInitialized,
  metaData,
} from '@cornerstonejs/core';
import {
  addTool,
  CrosshairsTool,
  Enums as CornerstoneToolsEnums,
  EraserTool,
  init as initCornerstoneTools,
  LengthTool,
  PanTool,
  StackScrollTool,
  TrackballRotateTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { initMhaImageLoader } from './mhaImageLoader';
import { buildApiUrl } from '../apiClient';

let initPromise: Promise<void> | null = null;
let toolsRegistered = false;

const TOOL_NAMES = {
  pan: 'Pan',
  zoom: 'Zoom',
  windowLevel: 'WindowLevel',
  length: 'Length',
  eraser: 'Eraser',
  stackScroll: 'StackScroll',
  crosshairs: 'Crosshairs',
  trackballRotate: 'TrackballRotate',
} as const;

function registerTools() {
  if (toolsRegistered) {
    return;
  }

  addTool(PanTool);
  addTool(ZoomTool);
  addTool(WindowLevelTool);
  addTool(LengthTool);
  addTool(EraserTool);
  addTool(StackScrollTool);
  addTool(CrosshairsTool);
  addTool(TrackballRotateTool);
  toolsRegistered = true;
}

export async function initCornerstone() {
  if (!initPromise) {
    initPromise = (async () => {
      if (!isCornerstoneInitialized()) {
        await initCornerstoneCore();
      }

      await initCornerstoneTools();
      dicomImageLoader.init();
      initMhaImageLoader();
      metaData.addProvider(dicomImageLoader.wadouri.metaData.metaDataProvider, 10000);
      registerTools();
    })();
  }

  return initPromise;
}

export function buildWadoImageId(url: string) {
  const resolved = /^https?:\/\//i.test(url)
    ? url
    : new URL(buildApiUrl(url), window.location.origin).href;
  return `wadouri:${resolved}`;
}

export function getOrCreateToolGroup(toolGroupId: string) {
  const existingToolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  if (existingToolGroup) {
    return existingToolGroup;
  }

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  if (!toolGroup) {
    throw new Error(`Failed to create Cornerstone tool group: ${toolGroupId}`);
  }

  toolGroup.addTool(TOOL_NAMES.pan);
  toolGroup.addTool(TOOL_NAMES.zoom);
  toolGroup.addTool(TOOL_NAMES.windowLevel);
  toolGroup.addTool(TOOL_NAMES.length);
  toolGroup.addTool(TOOL_NAMES.eraser);
  toolGroup.addTool(TOOL_NAMES.stackScroll);
  toolGroup.addTool(TOOL_NAMES.trackballRotate);
  toolGroup.addTool(TOOL_NAMES.crosshairs, {
    getReferenceLineColor: (viewportId: string) => {
      if (viewportId.endsWith('-axial')) return 'rgb(239, 68, 68)';
      if (viewportId.endsWith('-coronal')) return 'rgb(34, 197, 94)';
      if (viewportId.endsWith('-sagittal')) return 'rgb(59, 130, 246)';
      if (viewportId.endsWith('-slab')) return 'rgb(251, 191, 36)';
      return 'rgb(200, 200, 200)';
    },
    getReferenceLineControllable: () => true,
    getReferenceLineDraggableRotatable: () => false,
    getReferenceLineSlabThicknessControlsOn: () => false,
    centerPoint: {
      enabled: true,
      color: 'rgba(255,255,255,0.65)',
      size: 2,
    },
  });
  toolGroup.setToolPassive(TOOL_NAMES.pan);
  toolGroup.setToolPassive(TOOL_NAMES.zoom);
  toolGroup.setToolPassive(TOOL_NAMES.windowLevel);
  toolGroup.setToolPassive(TOOL_NAMES.length);
  toolGroup.setToolPassive(TOOL_NAMES.eraser);
  toolGroup.setToolPassive(TOOL_NAMES.trackballRotate);
  toolGroup.setToolEnabled(TOOL_NAMES.crosshairs);
  toolGroup.setToolActive(TOOL_NAMES.stackScroll, {
    bindings: [{ mouseButton: CornerstoneToolsEnums.MouseBindings.Wheel }],
  });

  return toolGroup;
}

export function destroyToolGroup(toolGroupId: string) {
  if (ToolGroupManager.getToolGroup(toolGroupId)) {
    ToolGroupManager.destroyToolGroup(toolGroupId);
  }
}

function clampByte(value: number) {
  return Math.min(255, Math.max(0, value));
}

function clampIndex(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function blurRgba(source: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius <= 0) return new Uint8ClampedArray(source);

  const temp = new Uint8ClampedArray(source.length);
  const output = new Uint8ClampedArray(source.length);
  const diameter = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    for (let x = -radius; x <= radius; x += 1) {
      const cx = clampIndex(x, 0, width - 1);
      const offset = (y * width + cx) * 4;
      r += source[offset];
      g += source[offset + 1];
      b += source[offset + 2];
      a += source[offset + 3];
    }

    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      temp[offset] = r / diameter;
      temp[offset + 1] = g / diameter;
      temp[offset + 2] = b / diameter;
      temp[offset + 3] = a / diameter;

      const removeX = clampIndex(x - radius, 0, width - 1);
      const addX = clampIndex(x + radius + 1, 0, width - 1);
      const removeOffset = (y * width + removeX) * 4;
      const addOffset = (y * width + addX) * 4;
      r += source[addOffset] - source[removeOffset];
      g += source[addOffset + 1] - source[removeOffset + 1];
      b += source[addOffset + 2] - source[removeOffset + 2];
      a += source[addOffset + 3] - source[removeOffset + 3];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    for (let y = -radius; y <= radius; y += 1) {
      const cy = clampIndex(y, 0, height - 1);
      const offset = (cy * width + x) * 4;
      r += temp[offset];
      g += temp[offset + 1];
      b += temp[offset + 2];
      a += temp[offset + 3];
    }

    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      output[offset] = r / diameter;
      output[offset + 1] = g / diameter;
      output[offset + 2] = b / diameter;
      output[offset + 3] = a / diameter;

      const removeY = clampIndex(y - radius, 0, height - 1);
      const addY = clampIndex(y + radius + 1, 0, height - 1);
      const removeOffset = (removeY * width + x) * 4;
      const addOffset = (addY * width + x) * 4;
      r += temp[addOffset] - temp[removeOffset];
      g += temp[addOffset + 1] - temp[removeOffset + 1];
      b += temp[addOffset + 2] - temp[removeOffset + 2];
      a += temp[addOffset + 3] - temp[removeOffset + 3];
    }
  }

  return output;
}

export function applyCanvasImagePostProcessing(element: HTMLElement, smoothing: number, sharpening: number) {
  if (smoothing <= 0 && sharpening <= 0) return;

  const canvas = element.querySelector('canvas');
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const original = new Uint8ClampedArray(imageData.data);
  const denoiseRadius = smoothing > 0 ? Math.max(1, Math.round(smoothing * 3)) : 0;
  const denoised = denoiseRadius > 0 ? blurRgba(original, canvas.width, canvas.height, denoiseRadius) : original;
  const output = new Uint8ClampedArray(denoised);

  if (sharpening > 0) {
    const maskRadius = Math.max(1, Math.round(1 + sharpening * 2));
    const blurred = blurRgba(denoised, canvas.width, canvas.height, maskRadius);
    const amount = sharpening * 1.8;

    for (let i = 0; i < output.length; i += 4) {
      output[i] = clampByte(denoised[i] + (denoised[i] - blurred[i]) * amount);
      output[i + 1] = clampByte(denoised[i + 1] + (denoised[i + 1] - blurred[i + 1]) * amount);
      output[i + 2] = clampByte(denoised[i + 2] + (denoised[i + 2] - blurred[i + 2]) * amount);
    }
  }

  imageData.data.set(output);
  context.putImageData(imageData, 0, 0);
}

export { CornerstoneEnums, CornerstoneToolsEnums, TOOL_NAMES };
