"""Pluggable object-detector backends.

The object_detection module never knows which detector it runs — it asks the
DetectorRegistry for whatever `config/aina.yaml -> capabilities.object_detection
.framework` names. Each backend owns:

- weight/model resolution (built-in id, local .pt, package checkpoint);
- post-processing promise (device_head: one_to_one vs one_to_many);
- the conversion of framework-native output into supervision-style Detections.

Backends import their ML stack lazily (inside load/infer), so the rest of the
perception stack and its unit tests never need torch/ultralytics/rfdetr/supervision
installed. This is what keeps swapping RF-DETR / YOLO26 / YOLO13 / YOLOv8 a pure
config change.
"""
from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("aina.detectors")

DEFAULT_MODELS_DIR = os.environ.get("AINA_MODELS_DIR") or "/etc/aina/models"


class DetectorError(Exception):
    """Detector configuration or runtime problem (fail fast, never mid-run)."""


@dataclass
class Detections:
    """Duck-typed supervision-style detections.

    Backends return an object shaped like `sv.Detections` (xyxy, confidence,
    class_id, extra `data`). Consumers (tracking, zones, events) only rely on
    this surface, so the detection stage is swappable end-to-end.
    """

    xyxy: Any = None
    confidence: Any = None
    class_id: Any = None
    tracker_id: Any = None
    data: dict[str, Any] | None = None

    def __len__(self) -> int:
        return 0 if self.xyxy is None else int(len(self.xyxy))


class DetectorBackend(ABC):
    """Adapter for one inference framework. `framework_id` selects it."""

    framework_id: str = ""
    device_heads: tuple[str, ...] = ("one_to_one",)

    def __init__(self) -> None:
        self.params: dict[str, Any] = {}
        self._loaded = False

    def configure(self, params: dict[str, Any] | None = None) -> None:
        self.params = dict(params or {})
        head = self.params.get("device_head", "one_to_one")
        if head not in self.device_heads:
            raise DetectorError(
                f"framework {self.framework_id!r} supports device_head "
                f"{sorted(self.device_heads)} but config asks for {head!r}"
            )

    # -- lifecycle -------------------------------------------------------- #
    def load(self) -> None:
        """Bring the model to its device. Idempotent; may take seconds/minutes."""
        if not self._loaded:
            self._load()
            self._loaded = True

    def close(self) -> None:
        if self._loaded:
            self._close()
            self._loaded = False

    @abstractmethod
    def _load(self) -> None:
        """Framework-specific weight resolution + first-load work."""

    @abstractmethod
    def infer(self, image: Any) -> Detections | Any:
        """One decoded frame -> detections."""

    def _close(self) -> None:  # pragma: no cover - optional hook
        pass

    def describe(self) -> str:  # pragma: no cover - convenience
        return f"{type(self).__name__}(framework={self.framework_id}, model={self.params.get('model')!r})"


# --------------------------------------------------------------------------- #
# Weights resolution (shared by backends)
# --------------------------------------------------------------------------- #


def resolve_model_path(model: str, models_dir: str = DEFAULT_MODELS_DIR) -> str | None:
    """Locate a local weights file, else None (framework built-in id).

    Order: exact existing path > <models_dir>/<model> > None. Returning None
    means the framework should resolve the id itself (e.g. 'yolo26s' triggers
    ultralytics' own download).
    """
    if not model:
        return None
    if model.startswith("/") or model.startswith(".\\") or "\\" in model or "/" in model:
        if os.path.exists(model):
            return model
        logger.debug("requested weights %r does not exist on disk", model)
        return None
    candidate = os.path.join(models_dir, model)
    if os.path.exists(candidate):
        return candidate
    logger.debug("no local weights for %r under %s — falling back to framework id", model, models_dir)
    return None


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #


class DetectorRegistry:
    _backends: dict[str, type[DetectorBackend]] = {}

    @classmethod
    def register(cls, backend: type[DetectorBackend]) -> type[DetectorBackend]:
        cls._backends[backend.framework_id] = backend
        logger.info("registered detector backend %r", backend.framework_id)
        return backend

    @classmethod
    def create(cls, params: dict[str, Any] | None) -> DetectorBackend:
        params = dict(params or {})
        framework = params.get("framework", "ultralytics")
        backend_cls = cls._backends.get(framework)
        if backend_cls is None:
            raise DetectorError(
                f"no detector framework named {framework!r}; available: "
                f"{sorted(cls._backends)} (set object_detection.framework in aina.yaml)"
            )
        backend = backend_cls()
        backend.configure(params)
        return backend