import { imageLoader } from "@cornerstonejs/core";
import dicomParser from "dicom-parser";
import { useEffect, useMemo, useState } from "react";

import { buildWadoImageId, initCornerstone } from "../lib/cornerstone/initCornerstone";

type PreviewOrientation = "axial" | "coronal" | "sagittal";

type DecodedSlice = {
  columns: number;
  rows: number;
  pixels: Int16Array | Uint16Array | Uint8Array;
  intercept: number;
  slope: number;
  invert: boolean;
  pixelSpacingX: number;
  pixelSpacingY: number;
  sliceThickness: number;
  windowCenter: number | null;
  windowWidth: number | null;
};

const sliceCache = new Map<string, Promise<DecodedSlice>>();
const previewCache = new Map<string, Promise<string>>();

function firstNumber(value: string | undefined) {
  if (!value) return null;
  const number = Number(value.split("\\")[0]);
  return Number.isFinite(number) ? number : null;
}

async function decodeSlice(url: string): Promise<DecodedSlice> {
  const existing = sliceCache.get(url);
  if (existing) return existing;

  const task = (async () => {
    await initCornerstone();
    const [response, image] = await Promise.all([
      fetch(url),
      imageLoader.loadAndCacheImage(buildWadoImageId(url)),
    ]);
    if (!response.ok) throw new Error(`DICOM 请求失败 (${response.status})`);

    const dataSet = dicomParser.parseDicom(new Uint8Array(await response.arrayBuffer()));
    const imageLike = image as unknown as {
      rows?: number;
      columns?: number;
      getPixelData: () => Int16Array | Uint16Array | Uint8Array;
    };
    const rows = dataSet.uint16("x00280010") ?? imageLike.rows ?? 0;
    const columns = dataSet.uint16("x00280011") ?? imageLike.columns ?? 0;
    if (!rows || !columns) throw new Error("DICOM 缺少有效像素尺寸");

    const spacing = (dataSet.string("x00280030") ?? "1\\1").split("\\").map(Number);
    return {
      rows,
      columns,
      pixels: imageLike.getPixelData(),
      intercept: firstNumber(dataSet.string("x00281052")) ?? 0,
      slope: firstNumber(dataSet.string("x00281053")) ?? 1,
      invert: (dataSet.string("x00280004") ?? "").toUpperCase() === "MONOCHROME1",
      pixelSpacingX: Number.isFinite(spacing[1]) && spacing[1] > 0 ? spacing[1] : 1,
      pixelSpacingY: Number.isFinite(spacing[0]) && spacing[0] > 0 ? spacing[0] : 1,
      sliceThickness: firstNumber(dataSet.string("x00180050")) ?? 1,
      windowCenter: firstNumber(dataSet.string("x00281050")),
      windowWidth: firstNumber(dataSet.string("x00281051")),
    };
  })();
  sliceCache.set(url, task);
  return task;
}

function toGray(value: number, low: number, width: number, invert: boolean) {
  const normalized = Math.max(0, Math.min(1, (value - low) / width));
  const gray = Math.round(normalized * 255);
  return invert ? 255 - gray : gray;
}

async function createPreview(urls: string[], orientation: PreviewOrientation): Promise<string> {
  const slices = await Promise.all(urls.map((url) => decodeSlice(url)));
  const source = slices[Math.floor(slices.length / 2)];
  if (!source) throw new Error("没有可用于预览的 DICOM 切片");
  if (slices.some((slice) => slice.rows !== source.rows || slice.columns !== source.columns)) {
    throw new Error("DICOM 切片尺寸不一致，无法生成预览");
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const slice of slices) {
    for (let index = 0; index < slice.rows * slice.columns; index += 1) {
      const value = slice.pixels[index] * slice.slope + slice.intercept;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  let center = source.windowCenter ?? 40;
  let width = source.windowWidth && source.windowWidth > 1 ? source.windowWidth : 400;
  if (max < center - width / 2 || min > center + width / 2) {
    center = (min + max) / 2;
    width = Math.max(1, (max - min) * 1.1);
  }
  const low = center - width / 2;

  const outputWidth = orientation === "sagittal"
    ? Math.max(2, Math.round(slices.length * source.sliceThickness / source.pixelSpacingX))
    : source.columns;
  const outputHeight = orientation === "coronal"
    ? Math.max(2, Math.round(slices.length * source.sliceThickness / source.pixelSpacingY))
    : source.rows;
  const rgba = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  const middleRow = Math.floor(source.rows / 2);
  const middleColumn = Math.floor(source.columns / 2);

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      let slice = source;
      let pixelIndex = 0;
      if (orientation === "axial") {
        pixelIndex = y * source.columns + x;
      } else {
        const sliceIndex = Math.min(slices.length - 1, Math.round(
          ((orientation === "coronal" ? y / Math.max(outputHeight - 1, 1) : x / Math.max(outputWidth - 1, 1)) * (slices.length - 1)),
        ));
        slice = slices[sliceIndex];
        pixelIndex = orientation === "coronal"
          ? middleRow * source.columns + x
          : y * source.columns + middleColumn;
      }
      const gray = toGray(slice.pixels[pixelIndex] * slice.slope + slice.intercept, low, width, slice.invert);
      const outputIndex = (y * outputWidth + x) * 4;
      rgba[outputIndex] = gray;
      rgba[outputIndex + 1] = gray;
      rgba[outputIndex + 2] = gray;
      rgba[outputIndex + 3] = 255;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 DICOM 预览画布");
  context.putImageData(new ImageData(rgba, outputWidth, outputHeight), 0, 0);
  return canvas.toDataURL("image/png");
}

export function DicomPreviewImage({
  imageUrls,
  orientation = "axial",
  className,
}: {
  imageUrls: string[];
  orientation?: PreviewOrientation;
  className?: string;
}) {
  const cacheKey = useMemo(() => `${orientation}:${imageUrls.join("|")}`, [imageUrls, orientation]);
  const [resolvedPreview, setResolvedPreview] = useState<{ key: string; url: string | null; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const urls = imageUrls.filter(Boolean);
    if (!urls.length) {
      void Promise.resolve().then(() => {
        if (!cancelled) setResolvedPreview({ key: cacheKey, url: null, error: true });
      });
      return () => { cancelled = true; };
    }
    let preview = previewCache.get(cacheKey);
    if (!preview) {
      preview = createPreview(urls, orientation);
      previewCache.set(cacheKey, preview);
    }
    preview.then(
      (url) => { if (!cancelled) setResolvedPreview({ key: cacheKey, url, error: false }); },
      () => { if (!cancelled) setResolvedPreview({ key: cacheKey, url: null, error: true }); },
    );
    return () => { cancelled = true; };
  }, [cacheKey, imageUrls, orientation]);

  const previewUrl = resolvedPreview?.key === cacheKey ? resolvedPreview.url : null;
  const error = resolvedPreview?.key === cacheKey && resolvedPreview.error;
  if (previewUrl) {
    return <img src={previewUrl} alt="DICOM 解码预览" draggable={false} className={className} />;
  }
  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#071426] text-[10px] font-medium ${error ? "text-rose-300" : "text-slate-500"}`}>
      {error ? "DICOM 解析失败" : "正在解析 DICOM…"}
    </div>
  );
}
