"""Pluggable multi-object trackers (the ``trackers`` package).

Mirrors detectors/: the tracking module asks a TrackerRegistry for whatever
``capabilities.tracking.backend`` names (``bytetrack`` default, ``iou``
alternate) and each backend owns identity, matching and motion prediction.
The tracking *module* owns everything temporal that is config-tunable: the
track-buffer time->frames conversion, coasting rules and the smoothing stack.
Swap bytetrack for iou (or a future crate) with a config change only.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("aina.trackers")


class TrackerError(Exception):
    """Tracker configuration or runtime problem (fail fast, never mid-run)."""


@dataclass
class TrackState:
    """One backend track identity update for a single frame.

    ``raw_xyxy`` is the freshly matched detection box for this frame, or
    ``None`` when the tracker coasted the track (no detection matched it).
    ``predicted_xyxy`` is the backend motion model's prior (bytetrack kalman);
    IoU tracking leaves it ``None``. The module decides what actually renders.
    """

    track_id: int
    class_id: int
    confidence: float
    raw_xyxy: tuple[float, float, float, float] | None
    predicted_xyxy: tuple[float, float, float, float] | None = None
    lost_count: int = 0
    age_frames: int = 1
    data: dict[str, Any] = field(default_factory=dict)


def compute_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    if union <= 0.0:
        return 0.0
    return inter / union


def linear_sum_assignment(cost: Any) -> tuple[list[int], list[int]]:
    """Min-cost bipartite matching (Hungarian algorithm), scipy-free.

    Returns (row_indices, col_indices) of the min-cost full matching. Vendored
    here instead of importing scipy so the tracker unit-tests stay runnable on a
    host without the ML extras — same semantics as
    ``scipy.optimize.linear_sum_assignment`` for the (rectangular) cases we use.
    """
    import numpy as np

    c = np.asarray(cost, dtype=np.float64)
    n, m = c.shape
    if n == 0 or m == 0:
        return [], []
    if n <= m:
        return list(range(n)), _hungarian_rows_to_cols(c, n, m)
    rows = _hungarian_rows_to_cols(c.T, m, n)
    return rows, list(range(m))


def _hungarian_rows_to_cols(a: Any, n: int, m: int) -> list[int]:
    """Assign every one of n rows (n<=m) to a column; returns col per row.

    Standard e-maxx Hungarian with potentials, O(n^2 m).
    """
    INF = float("inf")
    u = [0.0] * (n + 1)
    v = [0.0] * (m + 1)
    p = [0] * (m + 1)
    way = [0] * (m + 1)

    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [INF] * (m + 1)
        used = [False] * (m + 1)
        while True:
            used[j0] = True
            i0 = p[j0]
            delta = INF
            j1 = 0
            for j in range(1, m + 1):
                if used[j]:
                    continue
                cur = a[i0 - 1, j - 1] - u[i0 - 1] - v[j - 1]
                if cur < minv[j]:
                    minv[j] = cur
                    way[j] = j0
                if minv[j] < delta:
                    delta = minv[j]
                    j1 = j
            for j in range(m + 1):
                if used[j]:
                    u[p[j] - 1] += delta
                    v[j - 1] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break

    assoc = {p[j] - 1: j - 1 for j in range(1, m + 1) if p[j] != 0}
    return [assoc[r] for r in range(n)]


class TrackerBackend(ABC):
    """Adapter for one tracking algorithm. ``framework_id`` selects it."""

    framework_id: str = ""

    def __init__(self) -> None:
        self.params: dict[str, Any] = {}
        self.max_lost_frames: int = 10

    def configure(self, params: dict[str, Any] | None = None) -> None:
        self.params = dict(params or {})

    def set_max_lost_frames(self, frames: int) -> None:
        """Track-buffer is time-based in config; the module converts to frames."""
        frames = max(1, int(frames))
        if frames != self.max_lost_frames:
            logger.debug("%s track buffer -> %s frames", self.framework_id, frames)
            self.max_lost_frames = frames

    @abstractmethod
    def update(
        self,
        frame_idx: int,
        timestamp: float,
        xyxy: Any,
        confidence: Any,
        class_id: Any,
    ) -> list[TrackState]:
        """Advance identity + motion state with this frame's detections.

        Arrays are supervision-style (N,4) / (N,) and may be for many classes.
        Returns one TrackState per still-active track.

        Backends must drop tracks whose ``lost_count`` exceeds
        ``max_lost_frames`` (they are gone, not invisible).
        """

    def describe(self) -> str:  # pragma: no cover - convenience
        return f"{type(self).__name__}(backend={self.framework_id})"

    def close(self) -> None:  # pragma: no cover - optional hook
        pass


# --------------------------------------------------------------------------- #
# Registry (detector-style plug-play)
# --------------------------------------------------------------------------- #


class TrackerRegistry:
    _backends: dict[str, type[TrackerBackend]] = {}

    @classmethod
    def register(cls, backend: type[TrackerBackend]) -> type[TrackerBackend]:
        cls._backends[backend.framework_id] = backend
        logger.info("registered tracker backend %r", backend.framework_id)
        return backend

    @classmethod
    def create(cls, params: dict[str, Any] | None) -> TrackerBackend:
        params = dict(params or {})
        backend = params.get("backend", "bytetrack")
        backend_cls = cls._backends.get(backend)
        if backend_cls is None:
            raise TrackerError(
                f"no tracker backend named {backend!r}; available: "
                f"{sorted(cls._backends)} (set tracking.backend in aina.yaml)"
            )
        instance = backend_cls()
        instance.configure(params)
        return instance