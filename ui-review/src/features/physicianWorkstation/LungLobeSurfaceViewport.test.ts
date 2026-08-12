import { describe, expect, it } from "vitest";

import { parseLungLobeSurface } from "./lungLobeSurface";

function sampleSurface(): ArrayBuffer {
  const header = "ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nproperty int segment_number\nend_header\n";
  const encodedHeader = new TextEncoder().encode(header);
  const bytes = new Uint8Array(encodedHeader.length + 36 + 17);
  bytes.set(encodedHeader);
  const view = new DataView(bytes.buffer);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => view.setFloat32(encodedHeader.length + index * 4, value, true));
  const faceOffset = encodedHeader.length + 36;
  view.setUint8(faceOffset, 3);
  view.setInt32(faceOffset + 1, 0, true);
  view.setInt32(faceOffset + 5, 1, true);
  view.setInt32(faceOffset + 9, 2, true);
  view.setInt32(faceOffset + 13, 1, true);
  return bytes.buffer;
}

describe("parseLungLobeSurface", () => {
  it("keeps the patient-coordinate vertices and lobe face assignment", () => {
    const mesh = parseLungLobeSurface(sampleSurface());

    expect([...mesh.points]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...mesh.trianglesBySegment.get(1)!]).toEqual([3, 0, 1, 2]);
  });

  it("rejects a surface with an unknown lobe number", () => {
    const invalid = sampleSurface();
    new DataView(invalid).setInt32(invalid.byteLength - 4, 99, true);

    expect(() => parseLungLobeSurface(invalid)).toThrow("无效分段");
  });
});
