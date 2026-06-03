# Cloud inference (Modal)

This folder holds the cloud-side deployment for AI inference. The on-device
backend stays light; heavy ML runs on Modal.

## Files

- `modal_fracture.py` — fracture detection webhook (currently returns a
  deterministic mock so the full chain can be exercised before plugging in
  MONAI / Torch).

## Setup

```bash
pip install modal
modal token new   # one-time, opens browser to authenticate
```

## Dev loop (hot-reload, tunneled URL)

```bash
modal serve cloud/modal_fracture.py
```

Modal prints an HTTPS URL like `https://<account>--ct-fracture-infer-infer-dev.modal.run`.
Point the backend at it:

```bash
# in the backend shell:
export CT_AI_PROVIDER=modal
export CT_AI_MODAL_URL="https://<that-url>"
```

Restart `uvicorn` and the `/api/ai/fracture/analyze` route now proxies to Modal.

## Production deploy

```bash
modal deploy cloud/modal_fracture.py
```

Prints a stable URL. Same `CT_AI_MODAL_URL` env wiring as above.

## Default: no cloud needed

If `CT_AI_PROVIDER` is unset (or `mock`), the backend runs an in-process
simulator — useful for offline UI work. The JSON contract is identical, so
swapping providers requires no frontend or contract changes.

## Swapping to a real model

Inside `modal_fracture.py::infer`:

1. Add MONAI / Torch to the image `pip_install` list (commented stubs already
   in place).
2. Bake model weights with `image.run_function(...)` or attach a Modal Volume.
3. Receive the DICOM series via signed URL or Modal Volume mount instead of
   the mock payload.
4. Run inference, post-process to bounding boxes in image-percent coordinates,
   and return a `FractureReport`-shaped dict.

The frontend (`ViewScreen.tsx`) consumes the same JSON contract either way.
