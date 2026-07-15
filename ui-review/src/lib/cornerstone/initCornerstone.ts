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
      if (viewportId.endsWith('-sagittal')) return 'rgb(250, 204, 21)';
      if (viewportId.endsWith('-slab')) return 'rgb(251, 191, 36)';
      return 'rgb(200, 200, 200)';
    },
    getReferenceLineControllable: () => true,
    getReferenceLineDraggableRotatable: () => true,
    getReferenceLineSlabThicknessControlsOn: () => true,
    viewportIndicators: true,
    viewportIndicatorsConfig: {
      xOffset: 0.95,
      yOffset: 0.06,
      circleRadius: 5,
    },
    handleRadius: 5,
    enableHDPIHandles: true,
    referenceLinesCenterGapRadius: 16,
    centerPoint: {
      enabled: true,
      color: 'rgba(255, 255, 255, 0.8)',
      size: 3,
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

export { CornerstoneEnums, CornerstoneToolsEnums, TOOL_NAMES };
