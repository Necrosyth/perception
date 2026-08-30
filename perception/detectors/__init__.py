"""Pluggable detector backends. Importing the package registers all backends."""
from __future__ import annotations

from .base import (
    DEFAULT_MODELS_DIR,
    Detections,
    DetectorBackend,
    DetectorError,
    DetectorRegistry,
    resolve_model_path,
)
from .rfdetr_backend import RFDetrBackend  # noqa: F401  (triggers registration)
from .ultralytics_backend import UltralyticsBackend  # noqa: F401  (triggers registration)

__all__ = [
    "DEFAULT_MODELS_DIR",
    "Detections",
    "DetectorBackend",
    "DetectorError",
    "DetectorRegistry",
    "resolve_model_path",
    "UltralyticsBackend",
    "RFDetrBackend",
]