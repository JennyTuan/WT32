"""Modal-hosted fracture inference webhook.

This file deploys a serverless web endpoint on Modal that the FastAPI backend
calls when ``CT_AI_PROVIDER=modal`` and ``CT_AI_MODAL_URL`` points at the URL
printed by ``modal deploy``.

Why Modal:
    - Generous monthly free tier (no card needed to start).
    - Cold-starts in ~3-6s for a CPU container, ~10-20s on GPU.
    - Image build is declarative; you describe deps in code, Modal builds + caches.
    - Local dev: ``modal serve cloud/modal_fracture.py`` gives you a tunneled
      URL that hot-reloads on file save — perfect for the demo loop.

Deployment:
    pip install modal
    modal token new                       # one-time, opens browser
    modal serve cloud/modal_fracture.py   # dev, prints an https URL
    modal deploy cloud/modal_fracture.py  # prod, prints stable URL

Wiring it into the backend:
    export CT_AI_PROVIDER=modal
    export CT_AI_MODAL_URL="https://<your-account>--ct-fracture-infer.modal.run"

Contract:
    Request  JSON: { "body_part": "EXTREMITY" | null }
    Response JSON: FractureReport (see backend/routers/ai_inference.py)

The current implementation returns a deterministic mock so the full chain can be
exercised end-to-end before plugging in a real model. To swap in MONAI:
    1. Add monai + torch to the image deps below.
    2. Bake the model weights into the image (``image.add_local_dir`` or
       ``image.run_function`` for download-at-build).
    3. Replace ``_mock_report`` with real inference inside ``infer``.
"""
from __future__ import annotations

import modal

app = modal.App("ct-fracture-infer")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "pydantic>=2.0",
        # Uncomment when swapping to real MONAI inference:
        # "monai[all]>=1.3",
        # "torch>=2.2",
        # "pydicom>=3.0",
        # "numpy>=2.0",
        # "SimpleITK>=2.3",
    )
)


def _mock_report() -> dict:
    """Bbox coords aligned to the limbs helical demo by visually locating the
    talus fracture in the 215-slice series. Primary finding matches the
    talus region noted in the demo report."""
    return {
        "findings": [
            {
                "id": "f1",
                "site": "距骨体",
                "type": "局部骨皮质连续性略欠规则",
                "severity": "medium",
                "confidence": 0.78,
                "ao": "—",
                "note": (
                    "距骨体矢状面局部骨皮质边缘略不连续，可见细线样低密度影；"
                    "邻近骨结构未见明显移位或游离骨片。"
                ),
                "keySlicePct": 0.54,
                "keyPlane": "sagittal",
                "bbox": {"x": 28, "y": 36, "w": 32, "h": 30},
                "teaching": (
                    "红框标在左下角「矢状面」（脚的侧面剖视图）——侧面看距骨较直观。"
                    "正常骨皮质应呈连续光滑的高密度边缘；红框区域可见局部边缘略不连续"
                    "及细线样低密度影。AI 仅标注这一影像征象，不判断疾病名称或处置级别。"
                ),
                "comparePct": 0.49,
            },
            {
                "id": "f2",
                "site": "跟骨外侧骨皮质",
                "type": "骨皮质局部不规则",
                "severity": "info",
                "confidence": 0.72,
                "ao": "—",
                "note": "跟骨外侧缘骨皮质局部轻度凹凸，未见贯穿性低密度线或明显骨片分离。",
                "keySlicePct": 0.42,
                "bbox": {"x": 41, "y": 49, "w": 17, "h": 19},
                "teaching": (
                    "红框内为跟骨（脚后跟骨头）外侧骨皮质。这里 AI 标出是因为骨缘有轻度起伏，"
                    "但未见贯穿性低密度线或骨片分离。AI 将其作为低优先级征象提示，供人工复核时对照。"
                ),
                "comparePct": 0.28,
            },
            {
                "id": "f3",
                "site": "前足跖骨基底",
                "type": "骨结构完整",
                "severity": "info",
                "confidence": 0.93,
                "ao": "—",
                "note": "前足跖骨基底部横断面，骨皮质连续，骨小梁纹理规则，未见局灶性异常密度影。",
                "keySlicePct": 0.84,
                "bbox": {"x": 43, "y": 32, "w": 14, "h": 13},
                "teaching": (
                    "红框内是跖骨（脚掌长骨）基底部的横断面。怎么看是正常的？看三点："
                    "① 外圈骨皮质是一整圈连续光滑的亮白边缘，没有缺口；② 内部骨小梁"
                    "（蜂窝状结构）纹理整齐、没有错位或模糊；③ 形状对称完整。AI 将其列为参考对照区域。"
                ),
                "comparePct": 0.47,
            },
        ],
        "summary_advice": (
            "影像征象摘要：距骨体矢状面局部骨皮质连续性略欠规则，可见细线样低密度影；"
            "跟骨外侧缘轻度骨皮质起伏；中足、前足所示骨皮质连续，未见局灶性异常密度影。"
            "以上仅供影像复核参考，不构成诊断结论或处置建议。"
        ),
        "model_version": "modal-mock-v0.3",
        "elapsed_ms": 1800,
    }


@app.function(image=image, timeout=300)
@modal.fastapi_endpoint(method="POST", docs=True)
def infer(payload: dict) -> dict:
    """POST endpoint. Returns a FractureReport-shaped dict.

    Swap the body with real MONAI inference when ready:

        import torch
        from monai.bundle import ConfigParser
        # ... build model, load DICOM stack from payload (signed URL or volume),
        # run forward pass, post-process to bounding boxes in image-percent
        # coordinates, fill out FractureFinding entries.
    """
    body_part = (payload or {}).get("body_part")
    # In a real impl we'd dispatch by body_part to different models. The mock
    # returns the same foot/ankle report regardless to keep the demo chain alive.
    _ = body_part
    return _mock_report()
