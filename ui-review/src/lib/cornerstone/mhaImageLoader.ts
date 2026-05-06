import { Enums, imageLoader, metaData, type Types } from "@cornerstonejs/core";

type MhaElementType = "MET_SHORT";

interface MhaVolume {
  url: string;
  rows: number;
  columns: number;
  slices: number;
  spacing: [number, number, number];
  origin: [number, number, number];
  elementType: MhaElementType;
  pixelData: Int16Array;
  minPixelValue: number;
  maxPixelValue: number;
}

interface ParsedImageId {
  volumeUrl: string;
  sliceIndex: number;
}

interface MhaImagePlaneMetadata {
  frameOfReferenceUID: string;
  rows: number;
  columns: number;
  rowCosines: [number, number, number];
  columnCosines: [number, number, number];
  imageOrientationPatient: [number, number, number, number, number, number];
  imagePositionPatient: [number, number, number];
  pixelSpacing: [number, number];
  rowPixelSpacing: number;
  columnPixelSpacing: number;
  sliceThickness: number;
  spacingBetweenSlices: number;
}

const HEADER_SENTINEL = "ElementDataFile = LOCAL";
const MHA_SCHEME = "mha";
const FLOAT_TOLERANCE = 1e-3;
const volumeCache = new Map<string, Promise<MhaVolume>>();
const resolvedVolumeCache = new Map<string, MhaVolume>();
const imagePlaneMetadataCache = new Map<string, MhaImagePlaneMetadata>();
const stitchedImageIdsCache = new Map<string, Promise<string[]>>();
let mhaLoaderRegistered = false;

function parseTriple(value: string, label: string): [number, number, number] {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid ${label} in MHA header.`);
  }
  return [parts[0], parts[1], parts[2]];
}

function parseImageId(imageId: string): ParsedImageId {
  const raw = imageId.startsWith(`${MHA_SCHEME}:`) ? imageId.slice(MHA_SCHEME.length + 1) : imageId;
  const separatorIndex = raw.lastIndexOf("#");
  if (separatorIndex < 0) {
    throw new Error(`Invalid MHA imageId: ${imageId}`);
  }

  const volumeUrl = raw.slice(0, separatorIndex);
  const sliceIndex = Number(raw.slice(separatorIndex + 1));
  if (!Number.isFinite(sliceIndex)) {
    throw new Error(`Invalid MHA slice index in imageId: ${imageId}`);
  }

  return { volumeUrl, sliceIndex };
}

async function loadMhaVolume(volumeUrl: string): Promise<MhaVolume> {
  const existing = volumeCache.get(volumeUrl);
  if (existing) {
    return existing;
  }

  const pending: Promise<MhaVolume> = (async () => {
    const response = await fetch(volumeUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch MHA volume: ${volumeUrl}`);
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const previewLength = Math.min(bytes.length, 16 * 1024);
    const headerPreview = new TextDecoder("ascii").decode(bytes.subarray(0, previewLength));
    const sentinelIndex = headerPreview.indexOf(HEADER_SENTINEL);
    if (sentinelIndex < 0) {
      throw new Error(`Missing MHA header sentinel: ${volumeUrl}`);
    }

    let headerEndIndex = headerPreview.indexOf("\n", sentinelIndex);
    if (headerEndIndex < 0) {
      headerEndIndex = headerPreview.length - 1;
    }

    const headerText = headerPreview.slice(0, headerEndIndex + 1);
    const metadata = new Map<string, string>();
    headerText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const separator = line.indexOf("=");
        if (separator < 0) return;
        metadata.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      });

    const dimSize = metadata.get("DimSize");
    const spacing = metadata.get("ElementSpacing");
    const offset = metadata.get("Offset");
    const elementType = metadata.get("ElementType");

    if (!dimSize || !spacing || !offset || !elementType) {
      throw new Error(`Incomplete MHA header: ${volumeUrl}`);
    }
    if (elementType !== "MET_SHORT") {
      throw new Error(`Unsupported MHA element type: ${elementType}`);
    }

    const [columns, rows, slices] = parseTriple(dimSize, "DimSize");
    const elementSpacing = parseTriple(spacing, "ElementSpacing");
    const origin = parseTriple(offset, "Offset");
    const binaryOffset = headerEndIndex + 1;
    const voxelCount = columns * rows * slices;
    const pixelData = new Int16Array(buffer, binaryOffset, voxelCount);

    let minPixelValue = Number.POSITIVE_INFINITY;
    let maxPixelValue = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < pixelData.length; index += 1) {
      const value = pixelData[index];
      if (value < minPixelValue) minPixelValue = value;
      if (value > maxPixelValue) maxPixelValue = value;
    }

    const volume: MhaVolume = {
      url: volumeUrl,
      rows,
      columns,
      slices,
      spacing: elementSpacing,
      origin,
      elementType,
      pixelData,
      minPixelValue,
      maxPixelValue,
    };
    resolvedVolumeCache.set(volumeUrl, volume);
    return volume;
  })();

  volumeCache.set(volumeUrl, pending);
  return pending;
}

function createImageId(volumeUrl: string, sliceIndex: number) {
  return `${MHA_SCHEME}:${new URL(volumeUrl, window.location.origin).href}#${sliceIndex}`;
}

function nearlyEqual(left: number, right: number, tolerance = FLOAT_TOLERANCE) {
  return Math.abs(left - right) <= tolerance;
}

function createImagePlaneMetadata(
  volume: MhaVolume,
  imageId: string,
  zIndex: number,
  frameOfReferenceUID: string,
) {
  const metadata: MhaImagePlaneMetadata = {
    frameOfReferenceUID,
    rows: volume.rows,
    columns: volume.columns,
    rowCosines: [1, 0, 0],
    columnCosines: [0, 1, 0],
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    imagePositionPatient: [
      volume.origin[0],
      volume.origin[1],
      volume.origin[2] + zIndex * volume.spacing[2],
    ],
    pixelSpacing: [volume.spacing[1], volume.spacing[0]],
    rowPixelSpacing: volume.spacing[1],
    columnPixelSpacing: volume.spacing[0],
    sliceThickness: volume.spacing[2],
    spacingBetweenSlices: volume.spacing[2],
  };
  imagePlaneMetadataCache.set(imageId, metadata);
}

function getSliceImage(volume: MhaVolume, imageId: string, sliceIndex: number): Types.IImage {
  const sliceLength = volume.rows * volume.columns;
  const start = sliceIndex * sliceLength;
  const end = start + sliceLength;
  const pixelData = volume.pixelData.subarray(start, end);
  const windowWidth = Math.max(1, volume.maxPixelValue - volume.minPixelValue);
  const windowCenter = volume.minPixelValue + windowWidth / 2;

  return {
    imageId,
    rows: volume.rows,
    columns: volume.columns,
    height: volume.rows,
    width: volume.columns,
    color: false,
    rgba: false,
    minPixelValue: volume.minPixelValue,
    maxPixelValue: volume.maxPixelValue,
    slope: 1,
    intercept: 0,
    voiLUTFunction: Enums.VOILUTFunctionType.LINEAR,
    windowCenter,
    windowWidth,
    invert: false,
    getPixelData: () => pixelData,
    getCanvas: () => {
      throw new Error("Canvas rendering is not implemented for MHA images.");
    },
    rowPixelSpacing: volume.spacing[1],
    columnPixelSpacing: volume.spacing[0],
    sliceThickness: volume.spacing[2],
    photometricInterpretation: "MONOCHROME2",
    numberOfComponents: 1,
    dataType: "Int16Array",
    sizeInBytes: pixelData.byteLength,
  };
}

function mhaMetaDataProvider(type: string, imageId: string) {
  if (!imageId.startsWith(`${MHA_SCHEME}:`)) {
    return undefined;
  }

  const { volumeUrl, sliceIndex } = parseImageId(imageId);
  const volume = resolvedVolumeCache.get(volumeUrl);
  if (!volume) {
    return undefined;
  }

  if (type === "imagePlaneModule") {
    return imagePlaneMetadataCache.get(imageId) ?? {
      frameOfReferenceUID: `mha-frame-${volume.url}`,
      rows: volume.rows,
      columns: volume.columns,
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      imagePositionPatient: [
        volume.origin[0],
        volume.origin[1],
        volume.origin[2] + sliceIndex * volume.spacing[2],
      ],
      pixelSpacing: [volume.spacing[1], volume.spacing[0]],
      rowPixelSpacing: volume.spacing[1],
      columnPixelSpacing: volume.spacing[0],
      sliceThickness: volume.spacing[2],
      spacingBetweenSlices: volume.spacing[2],
    };
  }

  if (type === "imagePixelModule") {
    return {
      samplesPerPixel: 1,
      photometricInterpretation: "MONOCHROME2",
      rows: volume.rows,
      columns: volume.columns,
      bitsAllocated: 16,
      bitsStored: 16,
      highBit: 15,
      pixelRepresentation: 1,
    };
  }

  if (type === "generalSeriesModule") {
    return {
      modality: "CT",
      seriesInstanceUID: `mha-series-${volume.url}`,
      seriesNumber: 1,
    };
  }

  if (type === "generalImageModule") {
    return {
      instanceNumber: sliceIndex + 1,
    };
  }

  if (type === "voiLutModule") {
    const windowWidth = Math.max(1, volume.maxPixelValue - volume.minPixelValue);
    return {
      windowWidth,
      windowCenter: volume.minPixelValue + windowWidth / 2,
    };
  }

  return undefined;
}

export function initMhaImageLoader() {
  if (mhaLoaderRegistered) {
    return;
  }

  imageLoader.registerImageLoader(MHA_SCHEME, (imageId: string) => {
    const { volumeUrl, sliceIndex } = parseImageId(imageId);
    const promise: Promise<Types.IImage> = loadMhaVolume(volumeUrl).then((volume) => {
      if (sliceIndex < 0 || sliceIndex >= volume.slices) {
        throw new Error(`Slice index out of range for MHA volume: ${imageId}`);
      }
      return createImage(imageId, volume, sliceIndex);
    });

    return {
      promise,
      cancelFn: () => undefined,
    };
  });
  metaData.addProvider(mhaMetaDataProvider, 11001);
  mhaLoaderRegistered = true;
}

function createImage(imageId: string, volume: MhaVolume, sliceIndex: number): Types.IImage {
  return createImageObject(imageId, volume, sliceIndex);
}

function createImageObject(imageId: string, volume: MhaVolume, sliceIndex: number): Types.IImage {
  return getSliceImage(volume, imageId, sliceIndex);
}

export async function buildMhaImageIds(volumeUrl: string) {
  const absoluteUrl = new URL(volumeUrl, window.location.origin).href;
  const volume = await loadMhaVolume(absoluteUrl);
  resolvedVolumeCache.set(absoluteUrl, volume);
  const frameOfReferenceUID = `mha-frame-${absoluteUrl}`;
  return Array.from({ length: volume.slices }, (_, sliceIndex) => {
    const imageId = createImageId(absoluteUrl, sliceIndex);
    createImagePlaneMetadata(volume, imageId, sliceIndex, frameOfReferenceUID);
    return imageId;
  });
}

export async function buildStitchedMhaImageIds(volumeUrls: string[]) {
  const absoluteUrls = volumeUrls.map((volumeUrl) => new URL(volumeUrl, window.location.origin).href);
  const cacheKey = absoluteUrls.join("|");
  const existing = stitchedImageIdsCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    const volumes = await Promise.all(absoluteUrls.map((absoluteUrl) => loadMhaVolume(absoluteUrl)));
    const baseVolume = volumes[0];
    if (!baseVolume) {
      return [];
    }

    const frameOfReferenceUID = `mha-frame-stitched-${cacheKey}`;
    let cumulativeSliceIndex = 0;
    const stitchedImageIds: string[] = [];

    volumes.forEach((volume, volumeIndex) => {
      if (
        volume.rows !== baseVolume.rows ||
        volume.columns !== baseVolume.columns ||
        volume.slices !== baseVolume.slices ||
        volume.spacing.some((value, axis) => !nearlyEqual(value, baseVolume.spacing[axis])) ||
        volume.origin.some((value, axis) => !nearlyEqual(value, baseVolume.origin[axis]))
      ) {
        throw new Error("Cannot stitch MHA volumes with different dimensions or spacing.");
      }

      Array.from({ length: volume.slices }, (_, sliceIndex) => {
        const imageId = createImageId(absoluteUrls[volumeIndex], sliceIndex);
        createImagePlaneMetadata(volume, imageId, cumulativeSliceIndex + sliceIndex, frameOfReferenceUID);
        stitchedImageIds.push(imageId);
      });
      cumulativeSliceIndex += volume.slices;
    });

    return stitchedImageIds;
  })();

  stitchedImageIdsCache.set(cacheKey, pending);
  return pending;
}

export function isMhaVolumeUrl(url: string) {
  return url.toLowerCase().endsWith(".mha");
}

export async function warmupMhaVolumes(volumeUrls: string[]) {
  await Promise.all(
    volumeUrls.map((volumeUrl) => loadMhaVolume(new URL(volumeUrl, window.location.origin).href))
  );
}
