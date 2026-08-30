"""tracking module — Stage 4.

Consumes ``detections``, produces ``tracks``. Detector-agnostic (consumes
supervision-style arrays) and backend-pluggable: ``tracking.backend`` picks
bytetrack (default) or iou from the trackers package.

The module owns everything temporally configurable:

- **track buffer is time-based**: ``track_buffer_seconds`` is converted to a
  frame count using a per-source measured FPS (EMA over wall-clock deltas),
  so a 1.0 s buffer behaves identically at 5 or 30 pipeline FPS.
- **smoothing stack** (`config/aina.yaml -> smoothing`, each toggleable and
  independently debuggable): `render_interpolation` keeps a constant-velocity
  Kalman per track so coasted objects glide toward where they are heading
  instead of freezing; `one_euro_filter` de-jitters the final render box per
  track; `detection_smoother` is applied upstream in object_detection.
- track ids are **globally unique across cameras** (sources); each camera runs
  its own backend instance but ids are namespaced by source.

No module imports another module — only capabilities (see base.py docstring).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from ..smoothing import BoxOneEuro, KalmanCV
from ..trackers import TrackState, TrackerBackend, TrackerError, TrackerRegistry
from .base import CAP, Frame, PerceptionModule

logger = logging.getLogger("aina.modules.tracking")

DEFAULT_FPS = 10.0
MAX_FPS = 60.0


@dataclass
class Track:
    """One live object identity, rendered for this frame.

    ``xyxy`` is the render box — the smoothed/interpolated state the dashboard
    draws. ``raw_xyxy`` is the fresh detection box this frame, or None when the
    track was coasted (no detection matched it).
    """

    track_id: int
    source: str
    class_id: int
    confidence: float
    xyxy: tuple[float, float, float, float]
    raw_xyxy: tuple[float, float, float, float] | None
    lost_count: int
    age_frames: int
    coasted: bool
    last_frame_idx: int
    last_timestamp: float
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Tracks:
    """The ``tracks`` capability payload for one frame (all cameras)."""

    tracks: list[Track]
    frame_idx: int
    timestamp: float
    measured_fps: dict[str, float] = field(default_factory=dict)


class Tracking(PerceptionModule):
    name = "tracking"
    implemented = True

    def __init__(self) -> None:
        super().__init__()
        self._backends: dict[str, TrackerBackend] = {}
        self._kalmans: dict[tuple[str, int], KalmanCV] = {}
        self._euros: dict[tuple[str, int], BoxOneEuro] = {}
        self._last_render: dict[tuple[str, int], tuple[float, float, float, float]] = {}
        self._gids: dict[tuple[str, int], int] = {}
        self._next_gid = 1
        self._fps: dict[str, float] = {}
        self._last_frame_t: dict[str, float] = {}
        self._buffer_seconds = 1.0
        self._sm = {"detection_smoother": True, "one_euro_filter": True, "render_interpolation": True}

    def requires(self) -> list[str]:
        return [CAP["detections"].key]

    def produces(self) -> list[str]:
        return [CAP["tracks"].key]

    def configure(self, params: dict[str, Any] | None = None) -> None:
        super().configure(params)
        self._buffer_seconds = max(float(self.params.get("track_buffer_seconds", 1.0)), 0.05)
        logger.info("tracking buffer configured: %.2fs -> frames at runtime FPS", self._buffer_seconds)

    def start(self) -> None:
        # Reset temporal state (idempotent relaunch), then pre-create backends
        # for every camera the config declares so boot failures are loud.
        self._backends = {cam_name: TrackerRegistry.create(self.params) for cam_name in self._configured_sources()}
        for backend in self._backends.values():
            backend.set_max_lost_frames(max(1, round(self._buffer_seconds * DEFAULT_FPS)))
            logger.info("tracking backend ready: %s", backend.describe())

    def _configured_sources(self) -> list[str]:
        return list(self.params.get("_sources", []))

    def process(self, frame: Frame, upstream: dict[str, list[Any]]) -> dict[str, Any]:
        self._sm = dict(self.smoothing or {})
        merged = _merge_detections(upstream.get(CAP["detections"].key, []))
        fps = self._measure_fps(frame)
        max_lost = max(1, round(self._buffer_seconds * fps))
        backend = self._backend_for(frame.source)
        backend.set_max_lost_frames(max_lost)

        states = backend.update(
            frame.frame_id,
            frame.timestamp,
            merged.xyxy,
            merged.confidence,
            merged.class_id,
        )

        tracks: list[Track] = []
        for st in states:
            tracks.append(self._to_track(frame, st))
        self._prune(frame.source, states)

        return {
            CAP["tracks"].key: Tracks(
                tracks=tracks, frame_idx=frame.frame_id, timestamp=frame.timestamp, measured_fps=dict(self._fps)
            )
        }

    # ------------------------------------------------------------------ #
    def _backend_for(self, source: str) -> TrackerBackend:
        backend = self._backends.get(source)
        if backend is None:
            backend = TrackerRegistry.create(self.params)
            backend.set_max_lost_frames(max(1, round(self._buffer_seconds * DEFAULT_FPS)))
            self._backends[source] = backend
            logger.info("tracking backend ready for %r: %s", source, backend.describe())
        return backend

    def _measure_fps(self, frame: Frame) -> float:
        now = frame.timestamp
        prev = self._last_frame_t.get(frame.source)
        if prev is not None and now > prev:
            inst = 1.0 / max(now - prev, 1e-6)
            ema = self._fps.get(frame.source, inst)
            self._fps[frame.source] = min(MAX_FPS, max(1.0, 0.9 * ema + 0.1 * inst))
        self._last_frame_t[frame.source] = now
        return self._fps.get(frame.source, DEFAULT_FPS)

    def _to_track(self, frame: Frame, st: TrackState) -> Track:
        gid = self._gid_for(frame.source, st.track_id)
        coasted = st.raw_xyxy is None
        if coasted:
            box = self._coast(frame, gid, st)
        else:
            box = st.raw_xyxy
            if self._interpolating():
                # time step into this frame, then absorb the measurement, so a
                # coasted frame can continue the velocity we just learned
                kf = self._kalmans.get((frame.source, gid))
                if kf is None:
                    kf = self._kalmans.setdefault((frame.source, gid), KalmanCV(box))
                else:
                    kf.predict()
                kf.update(box)

        render = box
        if self._smoothing_on("one_euro_filter"):
            euro = self._euros.setdefault((frame.source, gid), BoxOneEuro(**self._euro_kwargs()))
            render = euro.apply(box, frame.timestamp)

        self._last_render[(frame.source, gid)] = render
        return Track(
            track_id=gid,
            source=frame.source,
            class_id=st.class_id,
            confidence=st.confidence,
            xyxy=render,
            raw_xyxy=st.raw_xyxy,
            lost_count=st.lost_count,
            age_frames=st.age_frames,
            coasted=coasted,
            last_frame_idx=frame.frame_id,
            last_timestamp=frame.timestamp,
        )

    def _coast(self, frame: Frame, gid: int, st: TrackState) -> tuple[float, float, float, float]:
        """Render box when no detection matched this frame.

        With `render_interpolation` the per-track Kalman continues its motion
        model (glide toward heading); otherwise the track stays where its last
        detection put it. Falls back to the backend's own motion prior when no
        Kalman exists yet (never None out of this method).
        """
        key = (frame.source, gid)
        if self._interpolating():
            kf = self._kalmans.get(key)
            if kf is None:
                seed = st.predicted_xyxy or self._last_render.get(key) or st.raw_xyxy
                if seed is None:
                    raise TrackerError("cannot coast a track with no history")
                kf = self._kalmans.setdefault(key, KalmanCV(seed))
            return kf.predict()
        return st.predicted_xyxy if st.predicted_xyxy is not None else self._last_render.get(key, st.raw_xyxy or (0.0, 0.0, 0.0, 0.0))

    def _gid_for(self, source: str, local: int) -> int:
        key = (source, local)
        gid = self._gids.get(key)
        if gid is None:
            gid = self._next_gid
            self._next_gid += 1
            self._gids[key] = gid
        return gid

    def _prune(self, source: str, states: list[TrackState]) -> None:
        """Drop per-track smoothers once their backend track is gone."""
        alive = {(source, st.track_id) for st in states}
        for track_key in list(self._kalmans):
            local = track_key[1]
            if (source, local) not in alive and track_key[0] == source:
                del self._kalmans[track_key]
        for track_key in list(self._euros):
            local = track_key[1]
            if (source, local) not in alive and track_key[0] == source:
                del self._euros[track_key]
        for track_key in list(self._last_render):
            if track_key not in alive and track_key[0] == source:
                del self._last_render[track_key]
        for track_key in list(self._gids):
            if track_key not in alive and track_key[0] == source:
                del self._gids[track_key]

    # -- smoothing toggles ---------------------------------------------- #
    def _sm_bool(self, key: str) -> bool:
        return bool(self._sm.get(key, True))

    def _interpolating(self) -> bool:
        return self._sm_bool("render_interpolation")

    def _smoothing_on(self, key: str) -> bool:
        return self._sm_bool(key)

    def _euro_kwargs(self) -> dict[str, float]:
        return {
            "min_cutoff": float(self._sm.get("min_cutoff", 1.0)),
            "beta": float(self._sm.get("beta", 0.007)),
            "d_cutoff": float(self._sm.get("d_cutoff", 1.0)),
            "freq": DEFAULT_FPS,
        }

    def stop(self) -> None:
        for backend in self._backends.values():
            backend.close()
        self._backends = {}
        self._kalmans = {}
        self._euros = {}
        self._last_render = {}
        self._gids = {}
        self._next_gid = 1


# --------------------------------------------------------------------------- #
# Broadcast merge: several producers may each emit "detections"
# --------------------------------------------------------------------------- #


def _arrays_from(value: Any):
    """Surface xyxy/confidence/class_id from a detections-shaped object.

    Accepts both attribute-style carriers (``sv.Detections`` / our ``Detections``)
    and plain ``{"xyxy": ..., "confidence": ..., "class_id": ...}`` dicts.
    """
    if value is None:
        return None, None, None
    if isinstance(value, dict):
        xyxy = value.get("xyxy")
        confidence = value.get("confidence")
        class_id = value.get("class_id")
    else:
        xyxy = getattr(value, "xyxy", None)
        confidence = getattr(value, "confidence", None)
        class_id = getattr(value, "class_id", None)
    if xyxy is None:
        return None, None, None
    return xyxy, confidence, class_id


def _merge_detections(values: list[Any]) -> Any:
    """Union of all broadcast detections into one supervision-style object.

    Returns a lightweight Detections carrier with concatenated arrays (or None
    arrays when nothing matched this frame). Consumes both single detections
    objects and lists-of-detections produced by the same capability.
    """
    pieces = []
    for value in values:
        if isinstance(value, (list, tuple)):
            pieces.extend(value)
        else:
            pieces.append(value)

    arrays = [_arrays_from(p) for p in pieces]
    arrays = [a for a in arrays if a[0] is not None]
    if not arrays:
        return _EmptyDetections()

    import numpy as np

    if len(arrays) == 1:
        return _arrays_as(arrays[0])

    xyxy = np.concatenate([np.asarray(a[0]) for a in arrays], axis=0)
    conf = np.concatenate([np.asarray(a[1]) if a[1] is not None else np.zeros(len(a[0])) for a in arrays]) if len(arrays) else None
    cls = np.concatenate([np.asarray(a[2]) if a[2] is not None else np.zeros(len(a[0])) for a in arrays]) if len(arrays) else None
    return _ArraysDetections(xyxy=xyxy, confidence=conf, class_id=cls)


def _arrays_as(pair) -> Any:
    xyxy, confidence, class_id = pair
    if xyxy is None:
        return _EmptyDetections()
    return _ArraysDetections(xyxy=xyxy, confidence=confidence, class_id=class_id)


class _EmptyDetections:
    """Empty carrier — xyxy/confidence/class_id are None as backends expect."""

    xyxy = None
    confidence = None
    class_id = None


class _ArraysDetections:
    __slots__ = ("xyxy", "confidence", "class_id")

    def __init__(self, xyxy, confidence, class_id) -> None:
        self.xyxy = xyxy
        self.confidence = confidence
        self.class_id = class_id