"""Stage 2b: config contract — loading, validation, implicit dependency resolution."""
from __future__ import annotations

import pytest

from perception.config_schema import (
    ConfigError,
    build_config,
    load_config,
    resolve_enabled,
)

VALID = {
    "deployment": {"target": "edge", "gpu": True},
    "cameras": [
        {
            "name": "loading_dock",
            "source": "rtsp://u:p@host:554/stream1",
            "zones": [{"name": "dock_entry", "polygon": [[0, 0], [100, 0], [100, 100], [0, 100]]}],
        }
    ],
    "capabilities": {"object_detection": {"enabled": True, "model": "yolo26s"}},
    "smoothing": {"one_euro_filter": True},
}


def test_loads_valid_yaml(tmp_path):
    p = tmp_path / "aina.yaml"
    p.write_text("deployment:\n  target: aws\n  gpu: false\n")
    cfg = load_config(str(p))
    assert cfg.deployment_target == "aws"
    assert cfg.gpu is False


def test_valid_config_shapes():
    cfg = build_config(VALID)
    assert cfg.deployment_target == "edge"
    assert len(cfg.cameras) == 1
    cam = cfg.cameras[0]
    assert cam.name == "loading_dock"
    assert cam.zones[0].polygon[0] == [0.0, 0.0]
    assert cfg.capabilities["object_detection"].enabled is True
    assert cfg.capabilities["object_detection"].params["model"] == "yolo26s"
    assert cfg.smoothing["one_euro_filter"] is True


def test_rejects_unknown_deployment_target():
    with pytest.raises(ConfigError, match="deployment.target"):
        build_config({"deployment": {"target": "metal"}})


def test_camera_needs_name_and_source():
    with pytest.raises(ConfigError, match="name"):
        build_config({"cameras": [{"source": "rtsp://x"}]})
    with pytest.raises(ConfigError, match="source"):
        build_config({"cameras": [{"name": "dock", "source": ""}]})


def test_zone_polygon_min_three_vertices():
    with pytest.raises(ConfigError, match="polygon"):
        build_config(
            {
                "cameras": [
                    {"name": "c", "source": "rtsp://x", "zones": [{"name": "z", "polygon": [[0, 0], [1, 1]]}]}
                ]
            }
        )


def test_behavior_flattens_to_module_keys():
    raw = {
        "capabilities": {
            "behavior": {
                "loitering": {"enabled": True},
                "tailgating": {"enabled": False},
            }
        }
    }
    caps = build_config(raw).capabilities
    assert caps["behavior_loitering"].enabled is True
    assert caps["behavior_tailgating"].enabled is False


def test_bad_device_head_rejected():
    with pytest.raises(ConfigError, match="device_head"):
        build_config({"capabilities": {"object_detection": {"enabled": True, "device_head": "tri_head"}}})


REQ = {
    "object_detection": [],
    "tracking": ["detections"],
    "zones": ["tracks"],
    "behavior_loitering": ["tracks", "zone_membership"],
    "semantic_search": ["tracks"],
}
PRODUCES = {
    "detections": ["object_detection"],
    "tracking_results": ["tracking"],
    "tracks": ["tracking"],
    "zone_membership": ["zones"],
    "events": ["behavior_loitering", "behavior_tailgating"],
    "embeddings": ["semantic_search"],
}
ORDER = ["object_detection", "tracking", "zones", "behavior_loitering", "behavior_tailgating", "semantic_search"]


def resolve(*requested):
    return resolve_enabled(set(requested), requires_of=lambda n: REQ[n], produces_by_key=PRODUCES, order=ORDER)


def test_minimal_auto_enable_chain():
    enabled, auto = resolve("behavior_loitering")
    assert set(enabled) == {"object_detection", "tracking", "zones", "behavior_loitering"}
    assert auto["tracking"] == "required by 'behavior_loitering' via capability 'tracks'"
    assert auto["zones"] == "required by 'behavior_loitering' via capability 'zone_membership'"
    assert auto["object_detection"] == "required by 'tracking' via capability 'detections'"
    # and it is NOT the maximum chain: no face / tailgating / search stubs leak in
    assert {"face_recognition", "behavior_tailgating", "semantic_search"} & set(enabled) == set()


def test_resolution_preserves_execution_order():
    enabled, _ = resolve("behavior_loitering")
    assert enabled == ["object_detection", "tracking", "zones", "behavior_loitering"]


def test_missing_capability_fails_fast():
    with pytest.raises(ConfigError, match="no registered module produces it"):
        resolve_enabled({"detector"}, requires_of=lambda n: ["photon_beams"], produces_by_key={"photon_beams": []})


def test_disabled_module_taken_out_without_reaching_others():
    with_both, _ = resolve("behavior_loitering", "semantic_search")
    with_loitering_only, _ = resolve("behavior_loitering")
    assert "semantic_search" in with_both
    assert "semantic_search" not in with_loitering_only
    assert set(with_loitering_only) < set(with_both)