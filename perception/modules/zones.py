"""zones module — Stage 4.

Consumes ``tracks``, produces ``zone_membership``: which zones each tracked
object currently stands in, per camera.

Zone polygons come from ``config/aina.yaml -> cameras[].zones[].polygon``
(coordinates in the camera's pixel space) and are injected by the orchestrator
as ``params["_zones_by_source"] = {source: [(name, polygon), ...]}``. Using the
track's *feet point* (bottom-center of its box — where the object meets the
floor, hence where it "is") for point-in-polygon membership keeps big bounding
boxes from falsely straddling a zone that the person is merely walking past.

Pure geometry + numpy — no ML deps, unit-testable on the host.
"""
from __future__ import annotations

import logging
from typing import Any

from .base import CAP, Frame, PerceptionModule
from .tracking import Track, Tracks

logger = logging.getLogger("aina.modules.zones")


class ZoneError(Exception):
    """Zone config is malformed for a camera."""


def point_in_polygon(x: float, y: float, polygon: list[list[float]]) -> bool:
    """Ray-casting point-in-polygon test (works for concave polygons)."""
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


class Zones(PerceptionModule):
    name = "zones"
    implemented = True

    def __init__(self) -> None:
        super().__init__()
        self._zones: dict[str, list[tuple[str, list[list[float]]]]] = {}

    def requires(self) -> list[str]:
        return [CAP["tracks"].key]

    def produces(self) -> list[str]:
        return [CAP["zone_membership"].key]

    def configure(self, params: dict[str, Any] | None = None) -> None:
        super().configure(params)
        raw = self.params.get("_zones_by_source") or {}
        for source, zones in raw.items():
            if not zones:
                continue
            if not isinstance(zones, list):
                raise ZoneError(f"zones for {source!r} must be a list of {name, polygon}")
            parsed = []
            for zone in zones:
                if isinstance(zone, dict):
                    name = zone.get("name")
                    polygon = zone.get("polygon")
                elif isinstance(zone, (list, tuple)) and len(zone) == 2:
                    name, polygon = zone[0], zone[1]
                else:
                    raise ZoneError(f"zone entry for {source!r} must be {{name, polygon}}")
                if not name or not isinstance(polygon, list) or len(polygon) < 3:
                    raise ZoneError(f"zone {name!r} for {source!r} needs a name and >= 3 polygon vertices")
                parsed.append((str(name), [[float(v[0]), float(v[1])] for v in polygon]))
            self._zones[str(source)] = parsed
        if self._zones:
            total = sum(len(v) for v in self._zones.values())
            logger.info("zones configured: %d zone(s) across %d camera(s)", total, len(self._zones))

    def process(self, frame: Frame, upstream: dict[str, list[Any]]) -> dict[str, Any]:
        memberships: dict[tuple[str, int], list[str]] = {}
        for payload in upstream.get(CAP["tracks"].key, []):
            for track in _iter_tracks(payload):
                source_zones = self._zones.get(track.source)
                if not source_zones:
                    continue
                names = [
                    name
                    for name, polygon in source_zones
                    if point_in_polygon(_feet_x(track.xyxy), _feet_y(track.xyxy), polygon)
                ]
                memberships[(track.source, track.track_id)] = sorted(names)
        return {
            CAP["zone_membership"].key: {
                "memberships": memberships,
                "zone_defs": {source: [n for n, _ in zones] for source, zones in self._zones.items()},
                "frame_idx": frame.frame_id,
                "timestamp": frame.timestamp,
            }
        }


def _iter_tracks(payload: Any):
    if isinstance(payload, Tracks):
        return payload.tracks
    if isinstance(payload, dict):
        return dict(payload).get("tracks", [])
    raise ZoneError(f"unexpected tracks payload type {type(payload).__name__}")


def _feet_x(box: tuple[float, float, float, float]) -> float:
    return (box[0] + box[2]) / 2.0


def _feet_y(box: tuple[float, float, float, float]) -> float:
    return box[3]