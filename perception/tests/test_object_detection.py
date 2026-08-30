"""Stage 3b: object_detection module — detector-agnostic, config-driven."""
from __future__ import annotations

from perception.config_schema import build_config
from perception.detectors import DetectorBackend, DetectorRegistry
from perception.detectors.base import Detections
from perception.modules import Frame
from perception.modules import object_detection as od_module
from perception.modules.object_detection import ObjectDetection
from perception.orchestrator import Orchestrator


class CountingBackend(DetectorBackend):
    framework_id = "fake_counted"
    device_heads = ("one_to_one", "one_to_many")

    def __init__(self):
        super().__init__()
        self.inferences = 0
        self.started = 0
        self.stopped = 0

    def _load(self) -> None:
        self.started += 1

    def infer(self, image):
        self.inferences += 1
        return Detections(
            xyxy=[[0, 0, 10, 10]],
            confidence=[0.9],
            class_id=[0],
            data={"class_names": {0: "forklift"}},
        )

    def _close(self) -> None:
        self.stopped += 1


def _register(backend_cls):
    DetectorRegistry.register(backend_cls)


_register(CountingBackend)


def test_module_produces_detections_lifecycle():
    mod = ObjectDetection()
    mod.configure({"framework": "fake_counted", "model": "whatever"})
    mod.start()
    try:
        out = mod.process(Frame(source="dock", frame_id=1, image="bgr-hint"), {})
        assert len(out["detections"]) == 1
        assert out["detections"].data["class_names"] == {0: "forklift"}
        assert mod.backend.inferences == 1
    finally:
        mod.stop()
    assert mod.backend is None  # closed and detached


def test_swap_frameworks_is_a_config_change(monkeypatch):
    # Backend selection comes only from params.framework — swapping detectors
    # (rfdetr, yolo26, yolo13, yolov8) never touches module code.
    calls: list[str] = []
    backend = CountingBackend()
    backend._load = lambda: None  # avoid double load bookkeeping
    monkeypatch.setattr(od_module.DetectorRegistry, "create", lambda params: (calls.append(params["framework"]), backend.configure(params), backend)[2])
    mod = ObjectDetection()
    mod.configure({"framework": "rfdetr", "model": "rfdetr-plus"})
    mod.start()
    assert calls == ["rfdetr"]


def test_empty_image_short_circuits_without_inference():
    mod = ObjectDetection()
    mod.configure({"framework": "fake_counted"})
    mod.start()
    try:
        assert mod.process(Frame(source="x", frame_id=0, image=None), {})["detections"] == []
        assert mod.backend.inferences == 0
    finally:
        mod.stop()


def test_module_runs_inside_orchestrator_graph():
    cfg = build_config(
        {
            "deployment": {"target": "edge"},
            "capabilities": {"object_detection": {"enabled": True, "framework": "fake_counted"}},
        }
    )
    orch = Orchestrator(cfg, overrides={"object_detection": ObjectDetection()})
    assert orch._modules["object_detection"].params["framework"] == "fake_counted"
    orch._modules["object_detection"].start()
    out = orch.process_frame(Frame(source="dock", frame_id=5, image="px"))
    assert list(out.keys()) == ["detections"]
    assert len(out["detections"]) == 1