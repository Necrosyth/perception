"""IoU + Hungarian-assignment tracker (``backend: iou``).

Detector-agnostic identity tracker: matches each frame's detections to active
tracks class-aware via the Hungarian algorithm gated on IoU, coasts unmatched
tracks by reusing their last box, and finishes tracks once lost past the track
buffer. No motion model — coasting means "stayed where it was" (good for slow
or stationary subjects, e.g. a resting forklift in the yard).
"""
from __future__ import annotations

from typing import Any

import numpy as np

from .base import TrackState, TrackerBackend, compute_iou


class IoUTrackerBackend(TrackerBackend):
    framework_id = "iou"

    def __init__(self) -> None:
        super().__init__()
        self.iou_threshold = 0.3
        self._next_id = 1
        # track_id -> {state..., last_box, lost_count, age}
        self._tracks: dict[int, dict[str, Any]] = {}

    def configure(self, params: dict[str, Any] | None = None) -> None:
        super().configure(params)
        threshold = self.params.get("iou_threshold", 0.3)
        if not (0.0 < threshold <= 1.0):
            raise ValueError(f"tracking.iou_threshold must be in (0, 1], got {threshold!r}")
        self.iou_threshold = float(threshold)

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

        if not self._tracks and not boxes:
            return []

        candidates = [
            (tuple(float(v) for v in box[:4]), float(c), int(k))
            for box, c, k in zip(boxes, confs, cls)
        ]

        matched_tids: set[int] = set()
        matched_det_idx: set[int] = set()
        if self._tracks and candidates:
            matched_tids, matched_det_idx = self._match(timestamp, frame_idx, candidates)

        states: list[TrackState] = []
        for tid in list(self._tracks):
            track = self._tracks[tid]
            if tid in matched_tids:
                track["lost_count"] = 0
                track["age"] += 1
                states.append(
                    TrackState(
                        track_id=tid,
                        class_id=track["class_id"],
                        confidence=track["confidence"],
                        raw_xyxy=tuple(track["last_box"]),
                        lost_count=0,
                        age_frames=track["age"],
                    )
                )
            else:
                track["lost_count"] += 1
                track["age"] += 1
                if track["lost_count"] > self.max_lost_frames:
                    del self._tracks[tid]
                    continue
                states.append(
                    TrackState(
                        track_id=tid,
                        class_id=track["class_id"],
                        confidence=0.0,
                        raw_xyxy=None,
                        predicted_xyxy=tuple(track["last_box"]),
                        lost_count=track["lost_count"],
                        age_frames=track["age"],
                        data={"coasted": True},
                    )
                )

        for det_idx, (box, c, cls_id) in enumerate(candidates):
            if det_idx not in matched_det_idx:
                self._tracks[self._next_id] = {
                    "last_box": box,
                    "class_id": cls_id,
                    "confidence": c,
                    "lost_count": 0,
                    "age": 1,
                }
                states.append(
                    TrackState(
                        track_id=self._next_id,
                        class_id=cls_id,
                        confidence=c,
                        raw_xyxy=box,
                        lost_count=0,
                        age_frames=1,
                    )
                )
                self._next_id += 1

        return states

    def _match(self, timestamp: float, frame_idx: int, candidates: list[tuple]) -> tuple[set[int], set[int]]:
        from .base import linear_sum_assignment

        track_ids = [tid for tid, t in self._tracks.items()]
        rows, cols = len(track_ids), len(candidates)
        iou_matrix = np.zeros((rows, cols))
        for r, tid in enumerate(track_ids):
            track = self._tracks[tid]
            for c, (box, _, cls_id) in enumerate(candidates):
                iou_matrix[r, c] = compute_iou(track["last_box"], box) if track["class_id"] == cls_id else 0.0

        if rows == 0 or cols == 0:
            return set(), set()

        row_ind, col_ind = linear_sum_assignment(1.0 - iou_matrix)
        matched_tids: set[int] = set()
        matched_dets: set[int] = set()
        for r, c in zip(row_ind, col_ind):
            if iou_matrix[r, c] >= self.iou_threshold:
                tid = track_ids[r]
                track = self._tracks[tid]
                box, conf, cls_id = candidates[c]
                track["last_box"] = box
                track["class_id"] = cls_id
                track["confidence"] = conf
                matched_tids.add(tid)
                matched_dets.add(c)
        return matched_tids, matched_dets

    def describe(self) -> str:
        return (
            f"IoUTrackerBackend(backend=iou, iou_threshold={self.iou_threshold}, "
            f"max_lost_frames={self.max_lost_frames})"
        )