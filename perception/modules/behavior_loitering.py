"""behavior_loitering module — Stage 6.

Consumes ``tracks`` + ``zone_membership``, produces ``events``. Pure dwell-time
logic (numpy-free, timestamp-based): a track that stays inside a configured zone
for at least ``dwell_threshold_seconds`` generates one ``loitering`` event per
episode. Debounce is keyed by ``(event_type, tracker_id)`` (AINA_AGENT_BUILD_PROMPT
§8), so a track that keeps standing in a zone fires exactly once — never once
per frame past the threshold. An episode ends when the track leaves every zone;
re-entering later starts a fresh episode and may fire again.

Why no library reuse here: surveyed in-container (supervision 0.30.1,
ultralytics 8.4.x) — no dwell/loitering/time-in-zone primitive exists. supervision
ships only ``PolygonZone``/``LineZone`` membership primitives and roboflow's
``examples/time_in_zone`` is example project code, not an importable package.
The one reusable primitive in play — point-in-zone membership — is consumed as
the ``zone_membership`` capability (produced by the zones module); no geometry
is recomputed here, and nothing from object_detection/tracking module code is
imported or reached into.

Event contract (the ``events`` capability payload is a list of these dicts):

    {"camera": source, "track_id": gid, "zone": zone_name,
     "event_type": "loitering", "started_at": epoch, "ended_at": None | epoch,
     "severity": "alert",
     "data": {"dwell_seconds": float, "threshold_seconds": float}}

``ended_at is None`` opens a row (threshold crossed); a float closes the open
row (episode over). The persistence module sinks them to the ``events`` table
as ``insert_event`` / ``end_event`` ops — the kind column accepts ``loitering``
per migration 001 (no schema change).
"""
from __future__ import annotations

import logging
from typing import Any

from .base import CAP, Frame, PerceptionModule

logger = logging.getLogger("aina.modules.behavior_loitering")


class BehaviorLoitering(PerceptionModule):
    name = "behavior_loitering"
    implemented = True
    EVENT_TYPE = "loitering"
    SEVERITY = "alert"

    def __init__(self) -> None:
        super().__init__()
        self._threshold_s = 600.0
        # (source, track_id) -> {zone: entered_at_epoch}; a zone's clock starts
        # the first frame we see the track inside it.
        self._in_zone: dict[tuple[str, int], dict[str, float]] = {}
        # (source, track_id) -> (fired_zone, started_at); one open event per
        # episode, cleared when the track leaves every zone.
        self._fired: dict[tuple[str, int], tuple[str, float]] = {}

    def requires(self) -> list[str]:
        return [CAP["tracks"].key, CAP["zone_membership"].key]

    def produces(self) -> list[str]:
        return [CAP["events"].key]

    def configure(self, params: dict[str, Any] | None = None) -> None:
        super().configure(params)
        threshold = self.params.get("dwell_threshold_seconds", 600.0)
        if not (isinstance(threshold, (int, float)) and threshold >= 0):
            raise ValueError("behavior.loitering.dwell_threshold_seconds must be >= 0")
        self._threshold_s = float(threshold)

    def process(self, frame: Frame, upstream: dict[str, list[Any]]) -> dict[str, Any]:
        now = frame.timestamp
        events: list[dict[str, Any]] = []

        memberships = _memberships(upstream.get(CAP["zone_membership"].key))
        # zone_membership's memberships may span sources; this frame belongs to
        # exactly one camera, so only its tracks are advanced (mirrors how the
        # persistence module filters by frame.source).
        cur = {key: zones for key, zones in memberships.items() if key[0] == frame.source}

        for key, zones in sorted(cur.items()):
            if not zones:
                continue  # visible but in no zone — the close pass below ends any open episode
            prev = self._in_zone.get(key)
            entered = {z: prev.get(z, now) for z in zones} if prev else {z: now for z in zones}
            self._in_zone[key] = entered
            if key in self._fired:
                continue  # debounce: already fired this episode
            started_at = min(entered.values())
            dwell = now - started_at
            if dwell >= self._threshold_s:
                zone = zones[0]
                self._fired[key] = (zone, started_at)
                events.append(self._row(key, zone, started_at, None, dwell))
                logger.info("loitering: track %s in zone %r on %s for %.1fs", key[1], zone, key[0], dwell)

        for key in list(self._in_zone):
            if key[0] != frame.source:
                continue
            if key in cur and cur[key]:
                continue
            fired = self._fired.pop(key, None)
            del self._in_zone[key]
            if fired is not None:
                zone, started_at = fired
                events.append(self._row(key, zone, started_at, now, now - started_at))

        return {CAP["events"].key: events}

    def _row(
        self,
        key: tuple[str, int],
        zone: str,
        started_at: float,
        ended_at: float | None,
        dwell: float,
    ) -> dict[str, Any]:
        source, gid = key
        return {
            "camera": source,
            "track_id": gid,
            "zone": zone,
            "event_type": self.EVENT_TYPE,
            "started_at": float(started_at),
            "ended_at": None if ended_at is None else float(ended_at),
            "severity": self.SEVERITY,
            "data": {
                "dwell_seconds": round(float(dwell), 3),
                "threshold_seconds": round(self._threshold_s, 3),
            },
        }


# --------------------------------------------------------------------------- #
# payload decoder (module never imports other modules; mirrors persistence.py)
# --------------------------------------------------------------------------- #


def _memberships(values: list[Any]) -> dict[tuple[str, int], list[str]]:
    out: dict[tuple[str, int], list[str]] = {}
    for value in values:
        if isinstance(value, dict):
            memberships = value.get("memberships") or {}
            for (src, gid), names in memberships.items():
                out[(src, int(gid))] = sorted(names)
    return out