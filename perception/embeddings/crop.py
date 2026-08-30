"""Crop a track's object patch from a frame image (letterboxed square).

OpenCV frames are BGR ndarrays; CLIP image encoders want RGB. `crop_patch`
returns a square, letterboxed RGB **uint8** patch ready for the encoder's own
resize/normalize transform — the encoder owns the final preprocessing so the
pipeline size/host never hardcode a model's expected input resolution.
"""
from __future__ import annotations

import numpy as np


def crop_patch(image, box: tuple[float, float, float, float], side: int = 96) -> np.ndarray | None:
    """Extract + letterbox a box into a `side`x`side` RGB patch.

    Returns None when the box is entirely outside the frame. The patch is
    square (longer side scaled to `side`, the other centered on a grey bar),
    which keeps aspect ratio while giving CLIP a fixed-size square input.
    """
    if image is None:
        return None
    h, w = image.shape[:2]
    x1, y1, x2, y2 = (float(v) for v in box)
    x1, y1 = max(x1, 0.0), max(y1, 0.0)
    x2, y2 = min(x2, float(w)), min(y2, float(h))
    if x2 - x1 < 1.0 or y2 - y1 < 1.0:
        return None

    roi = image[int(y1) : int(y2), int(x1) : int(x2)]
    if roi.size == 0:
        return None

    rh, rw = roi.shape[:2]
    scale = side / max(rh, rw)
    nw, nh = max(1, int(round(rw * scale))), max(1, int(round(rh * scale)))
    # INTER_AREA downsample is the sane choice for thumbnails (aliasing).
    if image.dtype == np.uint8:
        resized = cv2_resize(roi, (nw, nh))
    else:
        resized = np.asarray(roi)

    pad_col = max(0, side - nw)
    pad_row = max(0, side - nh)
    left, top = pad_col // 2, pad_row // 2
    # grey 128 letterbox (CLIP transforms normalize anyway)
    canvas = np.full((side, side, 3), 128, dtype=np.uint8)
    canvas[top : top + nh, left : left + nw] = resized
    return rgb(canvas)


def cv2_resize(roi, size: tuple[int, int]) -> np.ndarray:
    try:
        import cv2

        return cv2.resize(roi, size, interpolation=cv2.INTER_AREA)
    except ImportError:  # pragma: no cover - cv2 is a runtime dep; host tests may skip it
        tw, th = size
        rh, rw = roi.shape[:2]
        ys = np.linspace(0, max(0, rh - 1), th).round().astype(int)
        xs = np.linspace(0, max(0, rw - 1), tw).round().astype(int)
        out = roi[np.ix_(ys, xs)]
        if out.ndim == 2:
            out = out[..., None]
        return out.astype(np.uint8)


def rgb(bgr: np.ndarray) -> np.ndarray:
    """BGR -> RGB via cv2 if it is available, else a numpy projection."""
    try:
        import cv2

        return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    except Exception:  # noqa: BLE001 - rgb is a display detail, never fatal
        return bgr[..., ::-1]