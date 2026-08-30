"""Constant-velocity box Kalman — render interpolation between detections.

``smoothing.render_interpolation``: when a track has no fresh detection this
frame, instead of freezing at its last box we continue its constant-velocity
motion model so the rendered object glides to where it is actually heading
rather than stalling and snapping. The tracking module owns one filter per
track; real detections ``update`` it, coasted frames ``predict`` it. Pure
numpy, no deps.
"""
from __future__ import annotations

import numpy as np


class KalmanCV:
    """Constant-velocity Kalman on (cx, cy, w, h) + (vx, vy). dt=1/frame."""

    def __init__(self, box: tuple[float, float, float, float]) -> None:
        self.x = self._init_state(box)
        self.P = np.eye(6) * 20.0
        self.P[4:, 4:] *= 5.0  # velocity prior less certain -> learns fast
        self.F = np.eye(6)
        self.F[0, 4] = 1.0
        self.F[1, 5] = 1.0
        self.H = np.zeros((4, 6))
        self.H[:4, :4] = np.eye(4)
        self.R = np.eye(4) * 5.0
        self.Q = np.eye(6)
        self.Q[:4, :4] *= 1.0
        self.Q[4:, 4:] *= 0.1

    @staticmethod
    def _init_state(box: tuple[float, float, float, float]) -> np.ndarray:
        return np.concatenate([KalmanCV._state(box), np.zeros(2)])

    @staticmethod
    def _state(box: tuple[float, float, float, float]) -> np.ndarray:
        cx = (box[0] + box[2]) / 2.0
        cy = (box[1] + box[3]) / 2.0
        return np.array([cx, cy, max(box[2] - box[0], 1e-3), max(box[3] - box[1], 1e-3)], dtype=np.float64)

    def update(self, box: tuple[float, float, float, float]) -> None:
        """Absorb a fresh measurement (Kalman gain blend)."""
        z = self._state(box)
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ (z - self.H @ self.x)
        self.P = (np.eye(6) - K @ self.H) @ self.P

    def predict(self) -> tuple[float, float, float, float]:
        """Advance the motion model one frame, return predicted box."""
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        return self.box

    @property
    def box(self) -> tuple[float, float, float, float]:
        cx, cy, w, h = float(self.x[0]), float(self.x[1]), float(self.x[2]), float(self.x[3])
        return (cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0)