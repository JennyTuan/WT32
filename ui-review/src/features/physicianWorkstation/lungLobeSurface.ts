const LOBE_COLORS: Record<number, string> = {
  1: "#4F9DDE",
  2: "#6BCB77",
  3: "#F7B267",
  4: "#E76F9A",
  5: "#9B8AFB",
};

export type SurfaceMesh = { points: Float32Array; trianglesBySegment: Map<number, Uint32Array> };

function findHeaderEnd(bytes: Uint8Array): number {
  const marker = new TextEncoder().encode("end_header\n");
  for (let start = 0; start <= bytes.length - marker.length; start += 1) {
    if (marker.every((value, offset) => bytes[start + offset] === value)) return start + marker.length;
  }
  throw new Error("肺叶表面文件的头信息不完整");
}

export function parseLungLobeSurface(buffer: ArrayBuffer): SurfaceMesh {
  const bytes = new Uint8Array(buffer);
  const headerEnd = findHeaderEnd(bytes);
  const header = new TextDecoder().decode(bytes.slice(0, headerEnd));
  const vertexMatch = header.match(/^element vertex (\d+)$/m);
  const faceMatch = header.match(/^element face (\d+)$/m);
  if (!header.startsWith("ply\nformat binary_little_endian 1.0\n") || !vertexMatch || !faceMatch) {
    throw new Error("肺叶表面文件格式不受支持");
  }
  const vertexCount = Number(vertexMatch[1]);
  const faceCount = Number(faceMatch[1]);
  const vertexBytes = vertexCount * 12;
  const expectedBytes = headerEnd + vertexBytes + faceCount * 17;
  if (!Number.isSafeInteger(vertexCount) || !Number.isSafeInteger(faceCount) || expectedBytes !== buffer.byteLength) {
    throw new Error("肺叶表面文件长度不匹配");
  }

  const view = new DataView(buffer);
  const points = new Float32Array(vertexCount * 3);
  let offset = headerEnd;
  for (let index = 0; index < points.length; index += 1) {
    points[index] = view.getFloat32(offset, true);
    offset += 4;
  }
  const triangleParts = new Map<number, number[]>();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    if (view.getUint8(offset) !== 3) throw new Error("肺叶表面只支持三角面片");
    const triangle = [view.getInt32(offset + 1, true), view.getInt32(offset + 5, true), view.getInt32(offset + 9, true)];
    const segmentNumber = view.getInt32(offset + 13, true);
    if (triangle.some((vertex) => vertex < 0 || vertex >= vertexCount) || !LOBE_COLORS[segmentNumber]) {
      throw new Error("肺叶表面包含无效分段");
    }
    const cells = triangleParts.get(segmentNumber) ?? [];
    cells.push(3, ...triangle);
    triangleParts.set(segmentNumber, cells);
    offset += 17;
  }
  if (!triangleParts.size) throw new Error("肺叶表面没有可显示的面片");
  return { points, trianglesBySegment: new Map([...triangleParts].map(([segment, cells]) => [segment, Uint32Array.from(cells)])) };
}

export { LOBE_COLORS };
