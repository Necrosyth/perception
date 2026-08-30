"""persistence module — Stage 5 (data layer sink).

Consumes ``detections`` + ``tracks`` + ``zone_membership`` and writes them (and
zone lifecycle events) to Postgres via the async ``DatabaseWriter`` — never on
the per-frame hot path and never able to crash the pipeline (a down DB warns
and drops, the camera feed keeps running).

Identity contract (Stage 5 "What tracks were active in zone X between A and B"):
every tracked object gets one row in ``tracks`` (upserted per frame), a
``detections`` row per sampled live frame, and ``events`` rows of type
``entered_zone`` / closed ``left_zone`` when a track's feet cross into/out of a
zone. The entered_zone interval (started_at..ended_at) is the source of truth
for the reconstruction SQL query.

Connection config comes from ``capabilities.persistence.database`` or falls back
to the standard ``POSTGRES_*`` environment variables (compose sets those).
"""
from __future__ import annotations

import logging
import os
from typing import Any

from ..persistence import (
    DatabaseWriter,
    camera_id,
    event_id,
    track_uuid,
    zone_id,
)
from .base import CAP, Frame, PerceptionModule
from .tracking import Tracks

logger = logging.getLogger("aina.modules.persistence")


def env_strings() -> dict[str, str]:
    out = {}
    for key, env_var in (
        ("host", "POSTGRES_HOST"),
        ("port", "POSTGRES_PORT"),
        ("user", "POSTGRES_USER"),
        ("password", "POSTGRES_PASSWORD"),
        ("dbname", "POSTGRES_DB"),
    ):
        value = os.environ.get(env_var)
        if value:
            out[key] = value
    return out


def make_connect(db: dict[str, Any]):
    """Return a psycopg connect() callable from the resolved db params."""

    def _connect():
        import psycopg

        kwargs = {
            "host": db.get("host", "localhost"),
            "port": int(db.get("port", 5432)),
            "user": db.get("user", "aina"),
            "password": db.get("password", ""),
            "dbname": db.get("dbname", "aina_sentinel"),
        }
        connect_timeout = db.get("connect_timeout")
        if connect_timeout is not None:
            kwargs["connect_timeout"] = int(connect_timeout)
        return psycopg.connect(**kwargs)

    return _connect


class Persistence(PerceptionModule):
    name = "persistence"
    implemented = True

    def __init__(self) -> None:
        super().__init__()
        self._writer: DatabaseWriter | None = None
        self._camera_uid: dict[str, Any] = {}
        self._class_names: dict[int, str] = {}
        self._sampling = 1
        self._finalize_timeout_s = 5.0
        # (camera, gid) -> {zone_name: entered_at_epoch}
        self._in_zone: dict[tuple[str, int], dict[str, float]] = {}
        # (camera, gid) -> last seen epoch (track finalization pruning)
        self._last_seen: dict[tuple[str, int], float] = {}

    def requires(self) -> list[str]:
        return [CAP["detections"].key, CAP["tracks"].key, CAP["zone_membership"].key]

    def produces(self) -> list[str]:
        return []

    def configure(self, params: dict[str, Any] | None = None) -> None:
        super().configure(params)
        sampling = self.params.get("detection_sampling", 1)
        if not isinstance(sampling, int) or sampling < 1:
            raise ValueError("persistence.detection_sampling must be a positive integer")
        self._sampling = sampling
        timeout = self.params.get("finalize_timeout_s", 5.0)
        if not (isinstance(timeout, (int, float)) and timeout >= 0):
            raise ValueError("persistence.finalize_timeout_s must be >= 0")
        self._finalize_timeout_s = float(timeout)

        db = dict(self.params.get("database") or {})
        db.update({k: v for k, v in env_strings().items() if k not in db})
        self._db = db
        # cameras/zones injected by the orchestrator under _camera_defs
        self._camera_defs = list(self.params.get("_camera_defs", []))

    def start(self) -> None:
        self._writer = DatabaseWriter(make_connect(self._db))
        self._writer.start()
        for cam in self._camera_defs:
            uid = camera_id(cam["name"])
            self._camera_uid[cam["name"]] = uid
            self._writer.submit(
                {
                    "op": "upsert_camera",
                    "camera_uid": uid,
                    "name": cam["name"],
                    "source": cam.get("source", ""),
                    "want_fps": float(cam.get("want_fps", 0.0)),
                }
            )
            for zone in cam.get("zones", []):
                self._writer.submit(
                    {
                        "op": "upsert_zone",
                        "zone_uid": zone_id(cam["name"], zone["name"]),
                        "camera_uid": uid,
                        "name": zone["name"],
                        "polygon": [[float(v[0]), float(v[1])] for v in zone["polygon"]],
                    }
                )
        logger.info("persistence writer started for cameras %s", list(self._camera_uid))

    def process(self, frame: Frame, upstream: dict[str, list[Any]]) -> dict[str, Any]:
        writer = self._writer
        if writer is None:
            return {}
        if frame.source not in self._camera_uid:
            return {}
        camera_uid = self._camera_uid[frame.source]
        now = frame.timestamp

        self._class_names = _class_names(upstream.get(CAP["detections"].key))

        zones_by_track: dict[tuple[str, int], dict[str, float]] = {}
        memberships = _memberships(upstream.get(CAP["zone_membership"].key))
        for key, zone_names in memberships.items():
            if key[0] != frame.source:
                continue
            zones_by_track[key] = {name: self._in_zone.get(key, {}).get(name, now) for name in zone_names}

        tracks_payload = _tracks_payload(upstream.get(CAP["tracks"].key))
        live: set[tuple[str, int]] = set()
        for track in tracks_payload.tracks:
            if track.source != frame.source:
                continue
            key = (track.source, track.track_id)
            live.add(key)
            self._last_seen[key] = now
            class_name = self._class_names.get(int(track.class_id), "")
            writer.submit(
                {
                    "op": "upsert_track",
                    "track_uid": track_uuid(track.source, track.track_id),
                    "camera_uid": camera_uid,
                    "global_track_id": track.track_id,
                    "tracker_backend": _backend_name(),
                    "class_id": int(track.class_id),
                    "class_name": class_name,
                    "first_seen": _dt(track.last_timestamp),
                    "last_seen": _dt(text_now()),
                    "frames_delta": 0 if track.coasted else 1,
                    "coasted_delta": 1 if track.coasted else 0,
                    "peak_confidence": float(track.confidence),
                    "last_box": [float(round(v, 2)) for v in track.xyxy],
                }
            )
            if (
                not track.coasted
                and track.raw_xyxy is not None
                and (tracks_payload.frame_idx or frame.frame_id) % self._sampling == 0
            ):
                writer.submit(
                    {
                        "op": "insert_detection",
                        "camera_uid": camera_uid,
                        "track_uid": track_uuid(track.source, track.track_id),
                        "ts": _dt(text_now()),
                        "frame_idx": int(tracks_payload.frame_idx or 0),
                        "x1": float(round(track.raw_xyxy[0], 2)),
                        "y1": float(round(track.raw_xyxy[1], 2)),
                        "x2": float(round(track.raw_xyxy[2], 2)),
                        "y2": float(round(track.raw_xyxy[3], 2)),
                        "confidence": float(round(track.confidence, 4)),
                        "class_id": int(track.class_id),
                        "class_name": class_name,
                    }
                )

        # zone transitions for tracks that changed membership this frame
        for key, entered in zones_by_track.items():
            self._apply_transitions(key, entered, now)

        # finalize tracks that have dropped off for longer than the timeout
        for key in list(self._last_seen):
            if key in live:
                continue
            if now - self._last_seen[key] > self._finalize_timeout_s:
                writer.submit({"op": "finalize_track", "track_uid": track_uuid(*key), "ended_at": _dt(text_now())})
                del self._last_seen[key]
                self._in_zone.pop(key, None)
        return {}

    def _apply_transitions(
        self, key: tuple[str, int], zones: dict[str, float], now: float
    ) -> None:
        writer = self._writer
        prev = self._in_zone.get(key, {})
        entered_zones = [z for z in zones if z not in prev]
        left_zones = [z for z in prev if z not in zones]
        for zone in entered_zones:
            writer.submit(
                {
                    "op": "enter_zone",
                    "event_uid": event_id(key[0], zone, key[1], now),
                    "camera_uid": self._camera_uid[key[0]],
                    "track_uid": track_uuid(key[0], key[1]),
                    "zone_uid": zone_id(key[0], zone),
                    "started_at": _dt(text_now()),
                    "data": {"entered_at": now},
                }
            )
        for zone in left_zones:
            writer.submit(
                {
                    "op": "end_zone",
                    "track_uid": track_uuid(key[0], key[1]),
                    "zone_uid": zone_id(key[0], zone),
                    "ended_at": _dt(text_now()),
                }
            )
        if entered_zones or left_zones:
            self._in_zone[key] = dict(zones)

    def stop(self) -> None:
        if self._writer is not None:
            self._writer.stop()
            self._writer = None


# --------------------------------------------------------------------------- #
# payload decoders (module never imports other modules; mirrors tracking.py)
# --------------------------------------------------------------------------- #


def _tracks_payload(values: list[Any]):
    for value in values:
        if isinstance(value, Tracks):
            return value
    if values:
        value = values[-1]
        if isinstance(value, dict) and "tracks" in value:
            out = value["tracks"]
            if isinstance(out, Tracks):
                return out
            if isinstance(out, list):
                for item in out:
                    if isinstance(item, Tracks):
                        return item
    raise ValueError("persistence: no Tracks payload in upstream tracks")


def _memberships(values: list[Any]) -> dict[tuple[str, int], list[str]]:
    out: dict[tuple[str, int], list[str]] = {}
    for value in values:
        if isinstance(value, dict):
            mem = value.get("memberships") or {}
            for (src, gid), names in mem.items():
                out[(src, int(gid))] = sorted(names)
    return out


def _class_names(values: list[Any]) -> dict[int, str]:
    out: dict[int, str] = {}
    for value in values:
        data = getattr(value, "data", None)
        if isinstance(data, dict):
            for k, v in (data.get("class_names") or {}).items():
                out[int(k)] = str(v)
    return out


def _backend_name() -> str:
    # Tracking backend is not a produced capability yet; keep the default
    # consistent with config so the column is meaningful, not wrong.
    return "bytetrack"


def _dt(epoch: float):
    from datetime import datetime, timezone

    return datetime.fromtimestamp(epoch, tz=timezone.utc)


def text_now() -> float:
    import time

    return time.time()