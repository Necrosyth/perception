"""object_detection module — Stage 3.

The module itself is detector-agnostic: it asks the DetectorRegistry for
whatever framework `object_detection.framework` names (ultralytics, rfdetr, ...)
and emits supervisions-style Detections under the "detections" capability. Swap
YOLO26 for RF-DETR / YOLOv8 / YOLO13 by editing config — no code path changes.
"""
from __future__ import annotations

import logging
from typing import Any

from ..detectors import DetectorBackend, DetectorRegistry
from ..smoothing import DetectionSmoother
from .base import CAP, Frame, PerceptionModule

logger = logging.getLogger("aina.modules.object_detection")


class ObjectDetection(PerceptionModule):
    name = "object_detection"
    implemented = True

    def __init__(self) -> None:
        super().__init__()
        self.backend: DetectorBackend | None = None
        self._detection_smoother: DetectionSmoother | None = None

    def requires(self) -> list[str]:
        return []

    def produces(self) -> list[str]:
        return [CAP["detections"].key]

    def start(self) -> None:
        if self.backend is not None:
            return
        backend = DetectorRegistry.create(self.params)
        backend.load()
        self.backend = backend
        logger.info("object_detection ready: %s", backend.describe())

    def process(self, frame: Frame, upstream: dict[str, list[Any]]) -> dict[str, Any]:
        if self.backend is None:
            raise RuntimeError("object_detection.process() called before start()")
        if frame.image is None:
            return {CAP["detections"].key: []}
        detections = self.backend.infer(frame.image)
        if self._smoothing_enabled():
            detections = self._smoother().smooth(detections)
        return {CAP["detections"].key: detections}

    def _smoothing_enabled(self) -> bool:
        return bool((self.smoothing or {}).get("detection_smoother", True))

    def _smoother(self) -> DetectionSmoother:
        if self._detection_smoother is None:
            self._detection_smoother = DetectionSmoother(
                enabled=True,
                length_seconds=float((self.smoothing or {}).get("detection_smoother_seconds", 0.5)),
            )
        return self._detection_smoother

    def stop(self) -> None:
        if self.backend is not None:
            self.backend.close()
            self.backend = None