"""ByteTrack tracker (``backend: bytetrack``) — from the ``trackers`` package.

Port of the classic ByteTrack two-stage association (Apache-2.0): *every*
detection is fed to the tracker, not just confident ones.

- Stage 1: high-confidence detections (>=-track_thresh) match every active/lost
  track via class-aware IoU + Hungarian, gated at iou_threshold.
- Stage 2: low-confidence detections (>= 0.1, < track_thresh) get a second
  chance at the tracks stage 1 missed — this is what keeps identity through
  occlusion/flicker.
- Every track runs a constant-velocity box Kalman filter; coasted frames report
  the predicted prior so render interpolation has a real motion model.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from .base import TrackState, TrackerBackend, compute_iou, linear_sum_assignment

LOW_SCORE_FLOOR = 0.1


class _KalmanBox:
    """Constant-velocity box Kalman filter (state: cx, cy, w, h, vx, vy)."""

    def __init__(self, box: tuple[float, float, float, float]) -> None:
        self.x = np.concatenate([self._to_state(box), np.zeros(2)])
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

    def predict(self) -> None:
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q

    def update(self, box: tuple[float, float, float, float]) -> None:
        z = self._to_state(box)
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ (z - self.H @ self.x)
        self.P = (np.eye(6) - K @ self.H) @ self.P

    @staticmethod
    def _to_state(box: tuple[float, float, float, float]) -> np.ndarray:
        cx, cy = (box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0
        return np.array([cx, cy, max(box[2] - box[0], 1e-3), max(box[3] - box[1], 1e-3)], dtype=np.float64)

    @staticmethod
    def _from_state(x: np.ndarray) -> tuple[float, float, float, float]:
        cx, cy, w, h = float(x[0]), float(x[1]), float(x[2]), float(x[3])
        return (cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0)

    @property
    def prior_box(self) -> tuple[float, float, float, float]:
        return self._from_state(self.x)

    @property
    def box(self) -> tuple[float, float, float, float]:
        return self._from_state(self.x)


class ByteTrackBackend(TrackerBackend):
    framework_id = "bytetrack"

    def __init__(self) -> None:
        super().__init__()
        self.iou_threshold = 0.3
        self.track_thresh = 0.5
        self._next_id = 1
        # track_id -> {kf, class_id, confidence, lost_count, age}
        self._tracks: dict[int, dict[str, Any]] = {}

    def configure(self, params: dict[str, Any] | None = None) -> None:
        super().configure(params)
        iou = self.params.get("iou_threshold", 0.3)
        if not (0.0 < iou <= 1.0):
            raise ValueError(f"tracking.iou_threshold must be in (0, 1], got {iou!r}")
        self.iou_threshold = float(iou)
        thresh = self.params.get("track_thresh", 0.5)
        if not (LOW_SCORE_FLOOR < thresh <= 1.0):
            raise ValueError(f"tracking.track_thresh must be in ({LOW_SCORE_FLOOR}, 1], got {thresh!r}")
        self.track_thresh = float(thresh)

    def update(
        self,
        frame_idx: int,
        timestamp: float,
        xyxy: Any,
        confidence: Any,
        class_id: Any,
    ) -> list[TrackState]:
        boxes = [] if xyxy is None else list(xyxy)
        confs = [] if confidence is None else list(confidence)
        cls = [] if class_id is None else list(class_id)
        detections = [
            (tuple(float(v) for v in box[:4]), float(c), int(k))
            for box, c, k in zip(boxes, confs, cls)
        ]

        # 0. Advance every track's motion model to "now".
        for track in self._tracks.values():
            track["kf"].predict()

        high = {i: d for i, d in enumerate(detections) if d[1] >= self.track_thresh}
        low = {i: d for i, d in enumerate(detections) if LOW_SCORE_FLOOR <= d[1] < self.track_thresh}

        # 1. High-score detections match all tracks — identity is precious.
        high_matches, matched_first, matched_high_dets = self._associate(self._tracks, high)

        # 2. Low-score detections get the tracks stage 1 missed.
        leftovers = {tid: t for tid, t in self._tracks.items() if tid not in matched_first}
        low_matches, _, _ = self._associate(leftovers, low)

        all_matches = {**high_matches, **low_matches}
        states = []
        for tid in list(self._tracks):
            track = self._tracks[tid]
            if tid in all_matches:
                box, conf, cls = all_matches[tid]
                track["kf"].update(box)
                track["class_id"] = cls
                track["confidence"] = conf
                track["lost_count"] = 0
                track["age"] += 1
                states.append(
                    TrackState(track_id=tid, class_id=cls, confidence=conf, raw_xyxy=box,
                               lost_count=0, age_frames=track["age"])
                )
                continue
            track["lost_count"] += 1
            track["age"] += 1
            if track["lost_count"] > self.max_lost_frames:
                del self._tracks[tid]
                continue
            states.append(
                TrackState(track_id=tid, class_id=track["class_id"], confidence=0.0,
                           raw_xyxy=None, predicted_xyxy=track["kf"].prior_box,
                           lost_count=track["lost_count"], age_frames=track["age"],
                           data={"coasted": True})
            )

        # 3. Unmatched high detections open new tracks.
        for idx, (box, conf, cls_id) in high.items():
            if idx not in matched_high_dets:
                self._tracks[self._next_id] = {
                    "kf": _KalmanBox(box), "class_id": cls_id, "confidence": conf,
                    "lost_count": 0, "age": 1,
                }
                states.append(
                    TrackState(track_id=self._next_id, class_id=cls_id, confidence=conf,
                               raw_xyxy=box, lost_count=0, age_frames=1)
                )
                self._next_id += 1

        return states

    def _associate(
        self, pool: dict[int, dict[str, Any]], dets: dict[int, tuple]
    ) -> tuple[dict[int, tuple], set[int], set[int]]:
        """Hungarian match of pool tracks (priors) vs detections, IoU-gated.

        Returns ``{track_id: detection_pair}`` for gated matches plus the sets
        of matched track ids and matched detection keys. Class-aware: a track
        only ever matches detections of its own class.
        """
        from .base import linear_sum_assignment as _lsa

        tids = list(pool)
        dids = list(dets)
        if not tids or not dids:
            return {}, set(), set()
        iou_matrix = np.zeros((len(tids), len(dids)))
        for r, tid in enumerate(tids):
            track = pool[tid]
            prior = track["kf"].prior_box
            for c, did in enumerate(dids):
                box, _, cls = dets[did]
                iou_matrix[r, c] = compute_iou(prior, box) if track["class_id"] == cls else 0.0
        row_ind, col_ind = _lsa(1.0 - iou_matrix)
        matches: dict[int, tuple] = {}
        matched_rows: set[int] = set()
        matched_cols: set[int] = set()
        for r, c in zip(row_ind, col_ind):
            if iou_matrix[r, c] >= self.iou_threshold:
                matches[tids[r]] = dets[dids[c]]
                matched_rows.add(tids[r])
                matched_cols.add(dids[c])
        return matches, matched_rows, matched_cols

    def describe(self) -> str:
        return (
            f"ByteTrackBackend(backend=bytetrack, iou_threshold={self.iou_threshold}, "
            f"track_thresh={self.track_thresh}, max_lost_frames={self.max_lost_frames})"
        )