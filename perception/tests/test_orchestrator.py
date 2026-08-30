"""Stage 2: orchestrator graph runner — constraint enforcement tests.

Proves the structural guarantees of AINA_AGENT_BUILD_PROMPT §0.1 / §0.2 at the
orchestrator boundary: single compute for shared results, one pass per module
per frame, modules only ever see their own requires(), fail-fast startup.
"""
from __future__ import annotations

import pytest

from perception.config_schema import ConfigError, build_config
from perception.modules import Frame, PerceptionModule
from perception.orchestrator import DependencyError, Orchestrator


class Dummy(PerceptionModule):
    """Configurable test module; each process() call is recorded."""

    implemented = True

    def __init__(self, name: str, requires=(), produces=()):
        self.name = name
        self._requires = list(requires)
        self._produces = list(produces)
        self.calls: list[tuple[int, frozenset[str]]] = []
        self.starts = 0
        self.stops = 0

    def requires(self) -> list[str]:
        return self._requires

    def produces(self) -> list[str]:
        return self._produces

    def process(self, frame: Frame, upstream: dict[str, list]):
        assert set(upstream) == set(self._requires)
        self.calls.append((frame.frame_id, frozenset(upstream)))
        return {k: f"{self.name}:{k}:{frame.frame_id}" for k in self._produces}

    def start(self) -> None:
        self.starts += 1

    def stop(self) -> None:
        self.stops += 1


def fine_grain_graph():
    """detector -> {tracker, alpha, beta}; no zones in play."""
    return {
        "detector": Dummy("detector", produces=["detections"]),
        "tracker": Dummy("tracker", requires=["detections"], produces=["tracks"]),
        "alpha": Dummy("alpha", requires=["detections", "tracks"], produces=["events"]),
        "beta": Dummy("beta", requires=["detections", "tracks"], produces=["insights"]),
    }


def zoned_graph():
    return {
        "object_detection": Dummy("object_detection", produces=["detections"]),
        "tracking": Dummy("tracking", requires=["detections"], produces=["tracks"]),
        "zones": Dummy("zones", requires=["tracks"], produces=["zone_membership"]),
        "behavior_loitering": Dummy("behavior_loitering", requires=["tracks", "zone_membership"], produces=["events"]),
    }


def config(*enabled_names: str):
    caps = {n: {"enabled": True} for n in enabled_names}
    return build_config({"deployment": {"target": "edge"}, "capabilities": caps})


def test_shared_upstream_computed_once_and_consumed_by_many():
    mods = fine_grain_graph()
    orch = Orchestrator(config("detector", "tracker", "alpha", "beta"), overrides=mods)
    out = orch.process_frame(Frame(source="dock", frame_id=1))

    assert len(out["detections"]) == 1  # 3 consumers, one compute
    assert mods["detector"].calls == [(1, frozenset())]
    assert mods["tracker"].calls == [(1, frozenset({"detections"}))]
    assert mods["alpha"].calls == [(1, frozenset({"detections", "tracks"}))]
    assert mods["beta"].calls == [(1, frozenset({"detections", "tracks"}))]


def test_each_module_runs_once_per_frame_in_order():
    mods = fine_grain_graph()
    orch = Orchestrator(config("detector", "tracker", "alpha", "beta"), overrides=mods)
    for fid in range(1, 4):
        orch.process_frame(Frame(source="dock", frame_id=fid))

    assert mods["detector"].calls == [(1, frozenset()), (2, frozenset()), (3, frozenset())]
    total = sum(len(m.calls) for m in mods.values())
    assert total == 3 * 4  # 3 frames x 4 modules, no module ran twice
    order = [n.name for n in orch.schedule]
    assert order.index("detector") < order.index("tracker") < order.index("alpha")


def test_modules_never_see_keys_outside_their_requires():
    mods = fine_grain_graph()
    Orchestrator(config("detector", "tracker", "alpha"), overrides=mods).process_frame(
        Frame(source="dock", frame_id=7)
    )
    # a module demanding a capability nobody produces dies at startup, not mid-run
    with pytest.raises(ConfigError):
        Orchestrator(config("detector"), overrides={"detector": Dummy("detector", requires=["ghost"])})


def test_multi_producer_broadcast_runs_each_once():
    mods = fine_grain_graph()
    mods["second_detector"] = Dummy("second_detector", produces=["detections"])
    orch = Orchestrator(config("detector", "second_detector", "tracker"), overrides=mods)
    out = orch.process_frame(Frame(source="dock", frame_id=2))
    assert len(out["detections"]) == 2
    assert len(mods["second_detector"].calls) == 1
    assert mods["tracker"].calls == [(2, frozenset({"detections"}))]


def test_stub_gate_refuses_to_start_with_unimplemented_modules():
    with pytest.raises(ConfigError, match="not implemented yet"):
        Orchestrator(config("object_detection", "text_ocr"))  # text_ocr is still a stub


def test_unknown_capability_in_config_rejected():
    mods = fine_grain_graph()
    with pytest.raises(ConfigError, match="unknown capability"):
        Orchestrator(config("detector", "not_a_module"), overrides=mods)


def test_missing_upstream_capability_fails_fast():
    with pytest.raises(ConfigError, match="no registered module produces it"):
        Orchestrator(
            config("alpha"),
            overrides={"alpha": Dummy("alpha", requires=["photon_beams"], produces=["events"])},
        )


def test_dependency_cycle_detected():
    a = Dummy("a", requires=["b"], produces=["a"])
    b = Dummy("b", requires=["a"], produces=["b"])
    with pytest.raises(DependencyError, match="cycle"):
        Orchestrator(config("a", "b"), overrides={"a": a, "b": b})


def test_lifecycle_hooks_called_in_dependency_order():
    mods = {
        "detector": Dummy("detector", produces=["detections"]),
        "tracker": Dummy("tracker", requires=["detections"], produces=["tracks"]),
    }
    orch = Orchestrator(config("detector", "tracker"), overrides=mods)
    assert mods["detector"].starts == 1 and mods["tracker"].starts == 1
    assert [n.name for n in orch.schedule] == ["detector", "tracker"]
    for node in orch.schedule:
        node.module.stop()
    assert mods["detector"].stops == 1 and mods["tracker"].stops == 1


def test_auto_enabled_zones_present_in_schedule_and_runs():
    mods = zoned_graph()
    orch = Orchestrator(config("behavior_loitering", "object_detection"), overrides=mods)
    names = [n.name for n in orch.schedule]
    assert names == ["object_detection", "tracking", "zones", "behavior_loitering"]
    orch.process_frame(Frame(source="dock", frame_id=9))
    assert mods["zones"].calls == [(9, frozenset({"tracks"}))]
    # e.g. a downstream consumer reads sonar-free namespaces only
    assert mods["behavior_loitering"].calls == [(9, frozenset({"tracks", "zone_membership"}))]