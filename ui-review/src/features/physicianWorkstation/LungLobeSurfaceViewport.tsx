import { useEffect, useRef, useState } from "react";

import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkCellArray from "@kitware/vtk.js/Common/Core/CellArray";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";

import { apiFetch } from "../../lib/apiClient";
import { LOBE_COLORS, parseLungLobeSurface } from "./lungLobeSurface";

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

export default function LungLobeSurfaceViewport({ surfaceUrl }: { surfaceUrl: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState(surfaceUrl ? "正在载入 AI 肺叶三维表面…" : "AI 肺叶三维表面将在分割完成后显示");

  useEffect(() => {
    if (!surfaceUrl || !containerRef.current) return undefined;
    const container = containerRef.current;
    let disposed = false;
    let renderWindow: ReturnType<typeof vtkGenericRenderWindow.newInstance> | undefined;

    const showSurface = async () => {
      try {
        const response = await apiFetch(surfaceUrl);
        if (!response.ok) throw new Error("肺叶三维表面暂不可用");
        const mesh = parseLungLobeSurface(await response.arrayBuffer());
        if (disposed) return;
        renderWindow = vtkGenericRenderWindow.newInstance({ background: [0.02, 0.04, 0.05] });
        renderWindow.setContainer(container);
        const renderer = renderWindow.getRenderer();
        for (const [segmentNumber, triangles] of mesh.trianglesBySegment) {
          const polyData = vtkPolyData.newInstance();
          const points = vtkPoints.newInstance({ numberOfComponents: 3 });
          points.setData(mesh.points, 3);
          polyData.setPoints(points);
          polyData.setPolys(vtkCellArray.newInstance({ values: triangles }));
          const mapper = vtkMapper.newInstance();
          mapper.setInputData(polyData);
          const actor = vtkActor.newInstance({ mapper });
          actor.getProperty().setColor(hexToRgb(LOBE_COLORS[segmentNumber]));
          actor.getProperty().setOpacity(0.88);
          actor.getProperty().setInterpolationToPhong();
          renderer.addActor(actor);
        }
        renderer.resetCamera();
        renderer.getActiveCamera().elevation(12);
        renderer.getActiveCamera().azimuth(20);
        renderer.resetCameraClippingRange();
        renderWindow.resize();
        renderWindow.getRenderWindow().render();
        setMessage("");
      } catch (cause) {
        if (!disposed) setMessage(cause instanceof Error ? cause.message : "肺叶三维表面暂不可用");
      }
    };
    void showSurface();
    return () => {
      disposed = true;
      renderWindow?.delete();
      container.replaceChildren();
    };
  }, [surfaceUrl]);

  return <div className="absolute inset-0 z-10 overflow-hidden bg-[#05090a]" aria-label="AI 肺叶三维表面">
    <div ref={containerRef} className="absolute inset-0" />
    <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/75 px-2 py-1 font-mono text-[10px] tracking-[.12em] text-[#9ff0c1]">3D LOBES</div>
    {message && <div className="absolute inset-0 grid place-items-center px-8 text-center text-[11px] leading-5 text-[#8aa4a4]">{message}</div>}
    {!message && <div className="pointer-events-none absolute bottom-3 left-3 bg-black/75 px-2 py-1 text-[10px] text-[#b8c9c9]">AI 初步分割 · 仅供医生复核和修订</div>}
  </div>;
}
