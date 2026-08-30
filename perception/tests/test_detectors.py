"""Stage 3a: pluggable DetectorRegistry + weights resolution (no torch needed)."""
from __future__ import annotations

import pytest

from perception.detectors import (
    DetectorBackend,
    DetectorError,
    DetectorRegistry,
    UltralyticsBackend,
    resolve_model_path,
)


class FakeBackend(DetectorBackend):
    """Minimal backend for module tests; framework id is config-settable."""

    framework_id = "fake"

    def __init__(self):
        super().__init__()
        self.loaded = 0
        self.closed = 0

    def _load(self) -> None:
        self.loaded += 1

    def infer(self, image):
        return image

    def _close(self) -> None:
        self.closed += 1


DetectorRegistry.register(FakeBackend)


def test_default_framework_is_ultralytics():
    backend = DetectorRegistry.create({"model": "yolo26s"})
    assert isinstance(backend, UltralyticsBackend)
    assert backend.params["model"] == "yolo26s"


def test_framework_selection_is_pluggable_params_driven():
    backend = DetectorRegistry.create({"framework": "fake", "model": "x"})
    assert isinstance(backend, FakeBackend)
    assert backend.params["model"] == "x"


def test_unknown_framework_fails_fast():
    with pytest.raises(DetectorError, match="no detector framework"):
        DetectorRegistry.create({"framework": "hadouken"})


def test_unsupported_device_head_rejected_at_configure():
    with pytest.raises(DetectorError, match="device_head"):
        # ultralytics only exposes one-to-one (post-NMS)
        DetectorRegistry.create({"framework": "ultralytics", "device_head": "one_to_many"})


def test_backend_load_is_idempotent_and_closable():
    backend = DetectorRegistry.create({"framework": "fake"})
    backend.load()
    backend.load()
    assert backend.loaded == 1
    backend.close()
    assert backend.closed == 1
    backend.load()
    assert backend.loaded == 2  # reload after close


def test_resolve_model_path(tmp_path):
    (tmp_path / "my_det.pt").write_bytes(b"weights")
    assert resolve_model_path("my_det.pt", str(tmp_path)) == str(tmp_path / "my_det.pt")
    assert resolve_model_path("missing.pt", str(tmp_path)) is None
    abs_file = tmp_path / "abs.pt"
    abs_file.write_bytes(b"weights")
    assert resolve_model_path(str(abs_file)) == str(abs_file)
    assert resolve_model_path(str(tmp_path / "nope.pt")) is None
    assert resolve_model_path("yolo26s") is None  # built-in id → local miss allowed