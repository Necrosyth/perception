"""First-pass raw-detection smoother (``smoothing.detection_smoother``).

Wraps supervision's ``sv.DetectionsSmoother`` (EMA per (class, centre) motion
trajectories on the raw per-frame detections, *before* tracking) with a
passthrough fallback when supervision is not importable — e.g. a test host
that only installed the core extras. The ML extras are never imported here at
import time, which keeps the perception unit tests free of torch/cuda deps.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("aina.smoothing.detection")


class DetectionSmoother:
    """sv.DetectionsSmoother if available, else identity pass-through.

    ``smoothing.detection_smoother: false`` (or no supervision installed) is
    the pass-through case; the stack must never hard-depend on supervision.
    """

    def __init__(self, enabled: bool = True, length_seconds: float = 0.5) -> None:
        self.enabled = bool(enabled)
        self.length_seconds = float(max(length_seconds, 0.01))
        self._backend = None

    def _get_backend(self):
        if self._backend is not None:
            return self._backend
        try:
            import inspect

            import supervision as sv

            cls = getattr(sv, "DetectionsSmoother", None) or sv.DetectionSmoother
            kwargs = {"class_agnostic": False}
            params = inspect.signature(cls.__init__).parameters
            if "length_seconds" in params:
                kwargs["length_seconds"] = self.length_seconds
            if "history_length" in params:
                kwargs["history_length"] = max(1, int(round(self.length_seconds * 30)))
            if "length" in params:
                kwargs["length"] = max(1, int(round(self.length_seconds * 30)))
            self._backend = cls(**kwargs)
            logger.info("detection_smoother: supervision %s (%.2fs)", cls.__name__, self.length_seconds)
        except (ImportError, AttributeError, TypeError) as exc:  # pragma: no cover - exercised when extras absent
            logger.warning(
                "detection_smoother enabled but supervision is not installed — "
                "falling back to pass-through"
            )
            self._backend = False
        return self._backend

    def smooth(self, detections):
        """One pass over raw detections -> smoothed detections (or same object)."""
        if not self.enabled:
            return detections
        backend = self._get_backend()
        if backend is False or backend is None:
            return detections
        try:
            return backend.smooth_with_mask(detections) if hasattr(backend, "smooth_with_mask") else backend.smooth(detections)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("detection_smoother failed (%s) — pass-through", exc)
            return detections