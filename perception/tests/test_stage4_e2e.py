"""Stage 4c: end-to-end object_detection -> tracking -> zones over Orchestrator.

Brings the boot gate into focus: only the *implemented* chain survives resolution;
stubs (behavior_loitering, semantic_search) still refuse to boot when enabled.
"""
from __future__ import annotations

import numpy as np
import pytest

from perception.config_schema import ConfigError, build_config
from perception.detectors import DetectorBackend
from perception.detectors.base import Detections
from perception.modules import Frame, PerceptionModule
from perception.modules.zones import Zones
from perception.orchestrator import Orchestrator


class FakeDetector(DetectorBackend):
    framework_id = "stage4_fake"
    device_heads = ("one_to_one",)

    def __init__(self):
        super().__init__()
        self.inferences = 0

    def _load(self) -> None:
        pass

    def infer(self, image):
        self.inferences += 1
        return Detections(
            xyxy=[[40, 30, 80, 90]],  # feet (60, 90) inside dock_entry
            confidence=[0.95],
            class_id=[0],
        )

    def _close(self) -> None:
        pass


def _config(*enabled, cameras=True, extra_caps=None):
    caps = {n: {"enabled": True} for n in enabled}
    caps.update(extra_caps or {})
    raw = {
        "deployment": {"target": "edge", "gpu": True},
        "capabilities": caps,
        "smoothing": {"one_euro_filter": False, "render_interpolation": False, "detection_smoother": False},
    }
    if cameras:
        raw["cameras"] = [
            {"name": "loading_dock", "source": "rtsp://x/stream1",
             "zones": [{"name": "dock_entry", "polygon": [[0, 0], [120, 0], [120, 120], [0, 120]]}]}
        ]
    return build_config(raw)


def _detections_override():
    return {"object_detection": FakeDetector()}


class _DetectorModule(PerceptionModule):
    """Bridge: module-shaped fake detector so Orchestrator gets a PerceptionModule."""

    implemented = True
    name = "object_detection"

    def __init__(self, detections_factory):
        super().__init__()
        self.detections_factory = detections_factory
        self.calls = 0

    def requires(self) -> list[str]:
        return []

    def produces(self) -> list[str]:
        return ["detections"]

    def process(self, frame: Frame, upstream: dict[str, list]) -> dict[str, list]:
        self.calls += 1
        return {"detections": self.detections_factory(frame)}


def _detections_factory(frame):
    if frame.frame_id > 3:  # object disappears mid-run
        return []
    return [
        Detections(xyxy=[[40 + frame.frame_id * 2, 30, 80 + frame.frame_id * 2, 90]],
                   confidence=[0.95], class_id=[0])
    ]


def test_end_to_end_chain_produces_all_capabilities_once():
    det = _DetectorModule(_detections_factory)
    cfg = _config("object_detection", "tracking", "zones")
    orch = Orchestrator(cfg, overrides={"object_detection": det})

    # execution order: detector -> tracking -> zones
    names = [n.name for n in orch.schedule]
    assert names == ["object_detection", "tracking", "zones"]

    results = None
    for frame_id in range(6):
        results = orch.process_frame(Frame(source="loading_dock", frame_id=frame_id, timestamp=frame_id * 0.1, image="x"))

    assert det.calls == 6
    assert len(results["detections"]) == 1
    assert len(results["tracks"]) == 1
    assert len(results["zone_membership"]) == 1

    tracks = results["tracks"][0].tracks
    # after detections stop (frame 3+), we still coasted within the 1.0 s buffer
    assert len(tracks) == 1
    assert tracks[0].source == "loading_dock"

    zones_payload = results["zone_membership"][0]
    assert zones_payload["memberships"][("loading_dock", tracks[0].track_id)] == ["dock_entry"]
    assert len({t.track_id for t in results["tracks"] and results["tracks"][0].tracks}) == 1


def test_zones_receive_polygons_from_cameras_config():
    cfg = _config("object_detection", "tracking", "zones")
    orch = Orchestrator(cfg, overrides={"object_detection": _DetectorModule(_detections_factory)})
    zones = next(n.module for n in orch.schedule if isinstance(n.module, Zones))
    assert zones.params["_zones_by_source"] == {
        "loading_dock": [{"name": "dock_entry", "polygon": [[0, 0], [120, 0], [120, 120], [0, 120]]}]
    }
    assert zones.smoothing == cfg.smoothing


def test_boot_still_blocked_by_stubs_when_enabled():
    with pytest.raises(ConfigError, match="behavior_loitering"):
        Orchestrator(_config("object_detection", "behavior_loitering"), overrides={})
    with pytest.raises(ConfigError, match="semantic_search"):
        Orchestrator(_config("object_detection", "semantic_search"), overrides={})


def test_loitering_stub_gate_message_lists_only_unimplemented():
    cfg = _config("object_detection", "behavior_loitering")
    with pytest.raises(ConfigError) as exc:
        Orchestrator(cfg, overrides={})
    # tracking/zones are implemented now and must NOT appear in the gate message
    assert "tracking" not in str(exc.value)
    assert "zones" not in str(exc.value)