"""Stage 4c: end-to-end object_detection -> tracking -> zones over Orchestrator.

Brings the boot gate into focus: the *implemented* chain survives resolution;
the one remaining stub (anpr) still refuses to boot when enabled.
Stage 6 proves a behavior module (behavior_loitering) survives resolution and
its ``events`` reach the persistence sink only when enabled in config.
Stage 7 proves semantic_search survives resolution and its ``embeddings`` reach
the persistence sink — same gating rule — with the encoder swapped for a fake.
"""
from __future__ import annotations

import time

import numpy as np
import pytest

from perception.config_schema import ConfigError, build_config
from perception.detectors import DetectorBackend
from perception.detectors.base import Detections
from perception.modules import Frame, PerceptionModule
from perception.modules.zones import Zones
from perception.orchestrator import Orchestrator
from perception.persistence import track_uuid, zone_id


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


def _const_detections_factory(frame):
    """One person planted at feet (60, 90) inside dock_entry, forever."""
    return [Detections(xyxy=[[40, 30, 80, 90]], confidence=[0.95], class_id=[0])]


class _Recorder:
    """Fake DatabaseWriter recording submitted ops (mirrors test_persistence)."""

    def __init__(self, ops):
        self.ops = ops

    def start(self) -> None:
        pass

    def stop(self, flush_timeout: float = 10.0) -> None:
        pass

    def submit(self, op: dict) -> None:
        self.ops.append(op)


def test_boot_still_blocked_by_remaining_stub_when_enabled():
    with pytest.raises(ConfigError, match="anpr"):
        Orchestrator(_config("object_detection", "anpr"), overrides={})


def test_stub_gate_message_lists_only_unimplemented():
    cfg = _config("object_detection", "anpr")
    with pytest.raises(ConfigError) as exc:
        Orchestrator(cfg, overrides={})
    # tracking/zones/loitering/semantic_search are implemented now and must NOT appear
    assert "tracking" not in str(exc.value)
    assert "zones" not in str(exc.value)
    assert "behavior_loitering" not in str(exc.value)
    assert "semantic_search" not in str(exc.value)


def test_loitering_boots_full_chain(monkeypatch):
    ops: list[dict] = []
    monkeypatch.setattr("perception.modules.persistence.DatabaseWriter", lambda *a, **k: _Recorder(ops))
    cfg = _config("object_detection", "behavior_loitering")
    orch = Orchestrator(cfg, overrides={"object_detection": _DetectorModule(_const_detections_factory)})
    names = [n.name for n in orch.schedule]
    # detector + tracking + (auto) zones + behavior_loitering, sink last
    assert names == ["object_detection", "tracking", "zones", "behavior_loitering"]


def test_loitering_on_sinks_loitering_event_through_persistence(monkeypatch):
    ops: list[dict] = []
    monkeypatch.setattr("perception.modules.persistence.DatabaseWriter", lambda *a, **k: _Recorder(ops))
    cfg = _config("object_detection", "behavior_loitering", "persistence")
    cfg.capabilities["behavior_loitering"].params["dwell_threshold_seconds"] = 4.0
    orch = Orchestrator(cfg, overrides={"object_detection": _DetectorModule(_const_detections_factory)})

    pers = next(n.module for n in orch.schedule if n.name == "persistence")
    assert "events" in pers.requires()
    assert pers.params["_behavior_events"] == ["behavior_loitering"]

    for frame_id in range(60):  # 0.1 s frames -> 6 s > 4 s threshold
        orch.process_frame(Frame(source="loading_dock", frame_id=frame_id, timestamp=frame_id * 0.1))

    inserts = [op for op in ops if op["op"] == "insert_event"]
    assert len(inserts) == 1
    assert inserts[0]["event_type"] == "loitering"
    assert inserts[0]["zone_uid"] == zone_id("loading_dock", "dock_entry")
    assert "end_event" not in [op["op"] for op in ops]


def test_loitering_off_leaves_zero_trace_in_schedule_and_sink(monkeypatch):
    ops: list[dict] = []
    monkeypatch.setattr("perception.modules.persistence.DatabaseWriter", lambda *a, **k: _Recorder(ops))
    cfg = _config("object_detection", "persistence")
    orch = Orchestrator(cfg, overrides={"object_detection": _DetectorModule(_const_detections_factory)})

    assert "behavior_loitering" not in [n.name for n in orch.schedule]
    pers = next(n.module for n in orch.schedule if n.name == "persistence")
    assert "events" not in pers.requires()
    assert pers.params["_behavior_events"] == []

    for frame_id in range(30):
        orch.process_frame(Frame(source="loading_dock", frame_id=frame_id, timestamp=frame_id * 0.1))

    assert not any(op["op"] == "insert_event" for op in ops)


# --------------------------------------------------------------------------- #
# Stage 7 — semantic_search boots the full chain and sinks embeddings
# --------------------------------------------------------------------------- #
class _FakeEmbedder:
    name = "fake_clip"
    dim = 1024
    available = True

    def encode(self, patches):
        return np.full((len(patches), self.dim), 0.25, dtype=np.float32)

    def encode_text(self, text):
        return np.full(self.dim, 0.5, dtype=np.float32)


def _real_image_frame(frame_id, ts):
    return Frame(
        source="loading_dock",
        frame_id=frame_id,
        timestamp=ts,
        image=np.full((120, 120, 3), 128, dtype=np.uint8),  # plain grey frame, real pixels
    )


def test_semantic_search_boots_full_chain(monkeypatch):
    ops: list[dict] = []
    monkeypatch.setattr("perception.modules.persistence.DatabaseWriter", lambda *a, **k: _Recorder(ops))
    # default embedding_model local_clip on a host without open_clip -> disabled,
    # so the chain must still boot with semantic_search running pass-through
    cfg = _config(
        "object_detection",
        "semantic_search",
        extra_caps={"semantic_search": {"enabled": True, "rpc_port": 5061}},
    )
    orch = Orchestrator(cfg, overrides={"object_detection": _DetectorModule(_const_detections_factory)})

    names = [n.name for n in orch.schedule]
    assert "semantic_search" in names
    assert "tracking" in names
    results = orch.process_frame(_real_image_frame(0, 0.0))
    assert "embeddings" not in results  # disabled encoder produces nothing, but boots


def test_semantic_search_sinks_embedding_through_persistence(monkeypatch):
    ops: list[dict] = []
    monkeypatch.setattr("perception.modules.persistence.DatabaseWriter", lambda *a, **k: _Recorder(ops))
    monkeypatch.setattr("perception.modules.embeddings.get_embedder", lambda *a, **k: _FakeEmbedder())
    cfg = _config(
        "object_detection",
        "semantic_search",
        "persistence",
        extra_caps={"semantic_search": {"enabled": True, "rpc_port": 5062}},
    )
    orch = Orchestrator(cfg, overrides={"object_detection": _DetectorModule(_const_detections_factory)})

    pers = next(n.module for n in orch.schedule if n.name == "persistence")
    assert "embeddings" in pers.requires()
    assert pers.params["_embedding_sinks"] == ["semantic_search"]

    for frame_id in range(40):  # same track, same confidence -> exactly one embedding
        orch.process_frame(_real_image_frame(frame_id, frame_id * 0.1))

    deadline = time.time() + 5.0
    while time.time() < deadline and not any(op["op"] == "insert_embedding" for op in ops):
        orch.process_frame(_real_image_frame(99, 9.9))  # keep draining until the worker lands
        time.sleep(0.02)

    inserts = [op for op in ops if op["op"] == "insert_embedding"]
    assert len(inserts) == 1
    first = inserts[0]
    assert first["model"] == "fake_clip"
    assert first["track_uid"] == track_uuid("loading_dock", 1)
    assert "captured_at" in first["meta"]


def test_semantic_search_off_leaves_zero_trace_in_schedule_and_sink(monkeypatch):
    ops: list[dict] = []
    monkeypatch.setattr("perception.modules.persistence.DatabaseWriter", lambda *a, **k: _Recorder(ops))
    cfg = _config("object_detection", "persistence")
    orch = Orchestrator(cfg, overrides={"object_detection": _DetectorModule(_const_detections_factory)})

    assert "semantic_search" not in [n.name for n in orch.schedule]
    pers = next(n.module for n in orch.schedule if n.name == "persistence")
    assert "embeddings" not in pers.requires()
    assert pers.params["_embedding_sinks"] == []

    for frame_id in range(30):
        orch.process_frame(_real_image_frame(frame_id, frame_id * 0.1))

    assert not any(op["op"] == "insert_embedding" for op in ops)