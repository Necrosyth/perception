"""Ultralytics detector backend — YOLO26 / YOLO13 / YOLO11 / YOLOv8 / any .pt.

Selected via ``capabilities.object_detection.framework: ultralytics`` (default).
``model`` is either an ultralytics id ('yolo26s', 'yolov8s', 'yolo13n', ...) or a
local weights path (resolved through AINA_MODELS_DIR when it is a bare filename).

Lazy imports keep the rest of the stack torch-free.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from .base import (
    DEFAULT_MODELS_DIR,
    Detections,
    DetectorBackend,
    DetectorError,
    DetectorRegistry,
    resolve_model_path,
)

logger = logging.getLogger("aina.detectors.ultralytics")


class UltralyticsBackend(DetectorBackend):
    framework_id = "ultralytics"
    # YOLO predict() applies built-in NMS → one-to-one assignments only.
    device_heads = ("one_to_one",)

    def _load(self) -> None:
        params = self.params
        model = params.get("model", "yolo26s")
        local = resolve_model_path(model, params.get("models_dir", DEFAULT_MODELS_DIR))
        if local:
            model = local

        self.image_size = int(params.get("image_size", 640))
        self.confidence = float(params.get("confidence", 0.25))
        self.classes = params.get("classes")  # optional class-id filter

        try:
            from ultralytics import YOLO
        except ImportError as exc:  # pragma: no cover - host machines without torch
            raise DetectorError(
                "ultralytics is not installed; install it via the uv-managed "
                "`detection` extra (see perception/pyproject.toml)"
            ) from exc

        logger.info(
            "ultralytics loading model %r (imgsz=%s, conf=%s)",
            model,
            self.image_size,
            self.confidence,
        )
        self.model = YOLO(model)
        self.model.to(params.get("device") or ("cuda:0" if _torch_has_cuda() else "cpu"))
        self.class_names = {int(k): v for k, v in (self.model.names or {}).items()}
        logger.info(
            "ultralytics ready: %s classes=%s device=%s",
            os.path.basename(getattr(self.model, "ckpt_path", "") or model),
            len(self.class_names),
            str(getattr(self.model, "device", "?")),
        )

    def infer(self, image: Any) -> Detections:
        result = self.model.predict(
            source=image,
            imgsz=self.image_size,
            conf=self.confidence,
            classes=self.classes,
            verbose=False,
        )[0]

        if result.boxes is None or len(result.boxes.data) == 0:
            return Detections(xyxy=[], confidence=[], class_id=[])

        import numpy as np

        xyxy = result.boxes.xyxy.cpu().numpy()
        confidence = result.boxes.conf.cpu().numpy()
        class_id = result.boxes.cls.cpu().numpy().astype(np.int64)
        data: dict[str, Any] = {"class_names": dict(self.class_names)}
        if result.masks is not None and len(result.masks.data) > 0:
            data["masks"] = result.masks.data.cpu().numpy()
        return Detections(xyxy=xyxy, confidence=confidence, class_id=class_id, data=data)

    def _close(self) -> None:  # pragma: no cover - optional hook
        if getattr(self, "model", None) is not None:
            import gc

            del self.model
            gc.collect()


def _torch_has_cuda() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


DetectorRegistry.register(UltralyticsBackend)