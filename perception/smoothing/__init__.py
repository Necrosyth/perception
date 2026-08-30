"""Smoothing stack — per-toggle jitter/drift suppression for the hot path.

Each element is independently debuggable via ``config/aina.yaml -> smoothing``:

- `detection_smoother` : first pass on raw detections (sv.DetectionSmoother)
- `one_euro_filter`    : per-track render-box smoothing (One Euro Filter)
- `render_interpolation`: constant-velocity Kalman between real detections
"""

from .detection_smoother import DetectionSmoother
from .kalman import KalmanCV
from .one_euro import BoxOneEuro, OneEuroFilter

__all__ = [
    "DetectionSmoother",
    "KalmanCV",
    "BoxOneEuro",
    "OneEuroFilter",
]