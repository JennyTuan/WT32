import {
  Enums as CornerstoneEnums,
  init as initCornerstoneCore,
  isCornerstoneInitialized,
  metaData,
} from '@cornerstonejs/core';
import {
  addTool,
  Enums as CornerstoneToolsEnums,
  EraserTool,
  init as initCornerstoneTools,
  LengthTool,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';

let initPromise: Promise<void> | null = null;
let toolsRegistered = false;

const TOOL_NAMES = {
  pan: 'Pan',
  zoom: 'Zoom',
  windowLevel: 'WindowLevel',
  length: 'Length',
  stackScroll: 'StackScroll',
} as const;

function registerTools() {
  if (toolsRegistered) {
    return;
  }

  addTool(PanTool);
  addTool(ZoomTool);
  addTool(WindowLevelTool);
  addTool(LengthTool);
  addTool(StackScrollTool);
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
      metaData.addProvider(dicomImageLoader.wadouri.metaData.metaDataProvider, 10000);
      registerTools();
    })();
  }

  return initPromise;
}

export function buildWadoImageId(url: string) {
  return `wadouri:${new URL(url, window.location.origin).href}`;
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
  toolGroup.addTool(TOOL_NAMES.stackScroll);
  toolGroup.setToolPassive(TOOL_NAMES.pan);
  toolGroup.setToolPassive(TOOL_NAMES.zoom);
  toolGroup.setToolPassive(TOOL_NAMES.windowLevel);
  toolGroup.setToolPassive(TOOL_NAMES.length);
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
