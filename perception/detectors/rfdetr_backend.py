"""RF-DETR detector backend — robust, NMS-free end-to-end detection.

Selected via ``capabilities.object_detection.framework: rfdetr``.
``model`` is an rfdetr checkpoint id ('rfdetr-base', 'rfdetr-plus') or a local
weights file. RF-DETR's transformer head emits one-to-many matches natively and
requires no NMS, so lowering `confidence` recovers true positives that NMS would
have capped.

NOTE: not installed on this host yet. The API below follows the rfdetr package
public surface and is verified the first time this backend is wired at runtime
(the `rfdetr` extra in perception/pyproject.toml pins it).
"""
from __future__ import annotations

import logging
from typing import Any

from .base import (
    DEFAULT_MODELS_DIR,
    Detections,
    DetectorBackend,
    DetectorError,
    DetectorRegistry,
    resolve_model_path,
)

logger = logging.getLogger("aina.detectors.rfdetr")


class RFDetrBackend(DetectorBackend):
    framework_id = "rfdetr"
    device_heads = ("one_to_one", "one_to_many")  # head is NMS-free by design

    def _load(self) -> None:
        model = self.params.get("model", "rfdetr-base")
        local = resolve_model_path(model, self.params.get("models_dir", DEFAULT_MODELS_DIR))
        if local:
            model = local

        self.confidence = float(self.params.get("confidence", 0.25))

        try:
            from rfdetr import RFDetr
        except ImportError as exc:  # pragma: no cover
            raise DetectorError(
                "rfdetr is not installed; install it via the uv-managed "
                "`rfdetr` extra (see perception/pyproject.toml)"
            ) from exc

        logger.info("rfdetr loading checkpoint %r", model)
        self.model = RFDetr.checkpoint(model) if not _looks_like_path(model) else RFDetr(model)
        self.model.eval()
        if self.params.get("device"):
            self.model.to(self.params["device"])

    def infer(self, image: Any) -> Detections:
        import numpy as np

        out = self.model.inference(image, conf_thres=self.confidence)
        # RF-DETR returns a list-per-image; we always feed a single frame.
        pred = out[0] if isinstance(out, (list, tuple)) else out

        # Accept both key layouts used across rfdetr versions.
        boxes = pred.get("pred_boxes") or pred.get("boxes")
        labels = pred.get("pred_labels") or pred.get("class_ids") or pred.get("labels")
        scores = pred.get("scores") or pred.get("confidence")
        if boxes is None:
            return Detections(xyxy=[], confidence=[], class_id=[])

        boxes = np.asarray(boxes)
        if boxes.dtype == object:
            boxes = boxes[0]
        if labels is None:
            labels = np.zeros(len(boxes), dtype=np.int64)
        if scores is None:
            scores = np.ones(len(boxes), dtype=np.float32)
        return Detections(
            xyxy=boxes.astype(np.float32),
            confidence=np.asarray(scores, dtype=np.float32),
            class_id=np.asarray(labels, dtype=np.int64),
            data={"class_names": self._class_names()},
        )

    def _class_names(self) -> dict[int, str]:
        try:
            return dict(self.model.class_names or {})
        except Exception:
            return {}

    def _close(self) -> None:  # pragma: no cover - optional hook
        if getattr(self, "model", None) is not None:
            import gc

            del self.model
            gc.collect()


def _looks_like_path(value: str) -> bool:
    return "/" in value and value.endswith((".pt", ".pth", ".ckpt", ".onnx"))


DetectorRegistry.register(RFDetrBackend)