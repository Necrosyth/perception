"""Surveillance Intelligence Lab config contract.

Loads + validates config/aina.yaml and resolves the perception module graph's
implicit dependencies (auto-enables upstream modules a user did not explicitly
request, logging each decision). Ship this shape; extend, don't restructure.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

import yaml

logger = logging.getLogger("aina.config")

VALID_TARGETS = ("edge", "aws")
VALID_DEVICE_HEADS = ("one_to_one", "one_to_many")
VALID_TRACKING_BACKENDS = ("bytetrack", "iou")


class ConfigError(Exception):
    """Raised when aina.yaml is invalid or a capability cannot be satisfied."""


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #


@dataclass
class CameraZone:
    name: str
    polygon: list[list[float]]


@dataclass
class Camera:
    name: str
    source: str
    zones: list[CameraZone] = field(default_factory=list)


@dataclass
class CapabilityConfig:
    name: str
    enabled: bool = False
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class AinaConfig:
    deployment_target: str = "edge"
    gpu: bool = True
    cameras: list[Camera] = field(default_factory=list)
    capabilities: dict[str, CapabilityConfig] = field(default_factory=dict)
    smoothing: dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Loading
# --------------------------------------------------------------------------- #


def load_config(path: str) -> AinaConfig:
    with open(path, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return build_config(raw)


def build_config(raw: dict[str, Any]) -> AinaConfig:
    dep = raw.get("deployment") or {}
    target = str(dep.get("target", "edge")).lower()
    if target not in VALID_TARGETS:
        raise ConfigError(
            f"deployment.target must be one of {VALID_TARGETS}, got {target!r}"
        )

    cameras: list[Camera] = []
    for cam in raw.get("cameras") or []:
        name = str(cam.get("name", "")).strip()
        if not name:
            raise ConfigError("every camera needs a non-empty 'name'")
        if not str(cam.get("source", "")).strip():
            raise ConfigError(f"camera {name!r} needs a non-empty 'source'")
        zones = [
            CameraZone(name=str(z["name"]), polygon=_validate_polygon(z.get("polygon"), name))
            for z in cam.get("zones") or []
        ]
        cameras.append(Camera(name=name, source=str(cam["source"]), zones=zones))

    capabilities = _flatten_capabilities(raw.get("capabilities") or {})
    smoothing = _validate_smoothing(raw.get("smoothing") or {})
    return AinaConfig(
        deployment_target=target,
        gpu=bool(dep.get("gpu", True)),
        cameras=cameras,
        capabilities=capabilities,
        smoothing=smoothing,
    )


def _validate_smoothing(raw: dict[str, Any]) -> dict[str, Any]:
    """Smoothing stack toggles — each independently debuggable, so validate."""
    if not isinstance(raw, dict):
        raise ConfigError("smoothing must be a mapping")
    for toggle in ("detection_smoother", "one_euro_filter", "render_interpolation"):
        if toggle in raw and not isinstance(raw[toggle], bool):
            raise ConfigError(f"smoothing.{toggle} must be a boolean")
    for param in ("min_cutoff", "beta", "d_cutoff"):
        if param in raw:
            value = raw[param]
            if not (isinstance(value, (int, float)) and value > 0):
                raise ConfigError(f"smoothing.{param} must be a positive number")
    return dict(raw)


def _validate_polygon(poly: Any, camera: str) -> list[list[float]]:
    if not isinstance(poly, list) or len(poly) < 3:
        raise ConfigError(f"camera {camera!r}: zone polygon must have >= 3 vertex pairs")
    out: list[list[float]] = []
    for v in poly:
        if not isinstance(v, (list, tuple)) or len(v) != 2:
            raise ConfigError(f"camera {camera!r}: zone polygon vertex must be [x, y]")
        out.append([float(v[0]), float(v[1])])
    return out


def _flatten_capabilities(raw: dict[str, Any]) -> dict[str, CapabilityConfig]:
    """Turn the nested YAML shape into a flat module-name -> CapabilityConfig map.

    ``behavior: {loitering: {...}, tailgating: {...}}`` maps to module keys
    ``behavior_loitering`` / ``behavior_tailgating``.
    """
    out: dict[str, CapabilityConfig] = {}
    for name, cfg in raw.items():
        if name == "behavior":
            for behavior, b_cfg in (cfg or {}).items():
                key = f"behavior_{behavior}"
                out[key] = CapabilityConfig(name=key, enabled=bool(b_cfg.get("enabled", False)), params=b_cfg)
            continue
        if not isinstance(cfg, dict):
            raise ConfigError(f"capability {name!r} must be a mapping, got {type(cfg).__name__}")
        out[name] = CapabilityConfig(name=name, enabled=bool(cfg.get("enabled", False)), params=cfg)

    # per-module param validation
    for name, cc in out.items():
        p = cc.params
        if name == "object_detection":
            if p.get("device_head", "one_to_one") not in VALID_DEVICE_HEADS:
                raise ConfigError("object_detection.device_head must be one_to_one or one_to_many")
        if name == "tracking":
            buf = p.get("track_buffer_seconds")
            if buf is not None and not (isinstance(buf, (int, float)) and buf > 0):
                raise ConfigError("tracking.track_buffer_seconds must be a positive number of seconds")
            backend = p.get("backend", "bytetrack")
            if backend not in VALID_TRACKING_BACKENDS:
                raise ConfigError(
                    f"tracking.backend must be one of {sorted(VALID_TRACKING_BACKENDS)}, got {backend!r}"
                )
            iou = p.get("iou_threshold")
            if iou is not None and not (isinstance(iou, (int, float)) and 0 < iou <= 1):
                raise ConfigError("tracking.iou_threshold must be in (0, 1]")
            thresh = p.get("track_thresh")
            if thresh is not None and not (isinstance(thresh, (int, float)) and 0 < thresh <= 1):
                raise ConfigError("tracking.track_thresh must be in (0, 1]")
        if name == "behavior_loitering":
            dwell = p.get("dwell_threshold_seconds")
            if dwell is not None and not (isinstance(dwell, (int, float)) and dwell >= 0):
                raise ConfigError("behavior.loitering.dwell_threshold_seconds must be >= 0")
        if name == "semantic_search":
            model = p.get("embedding_model")
            if model is not None and not isinstance(model, str):
                raise ConfigError("semantic_search.embedding_model must be a model name string")
            port = p.get("rpc_port")
            if port is not None and not (isinstance(port, int) and 1 <= port <= 65535):
                raise ConfigError("semantic_search.rpc_port must be an integer in 1..65535")
            for key in ("refresh_seconds", "confidence_eps", "thumbnail_size", "batch_size", "max_queue"):
                value = p.get(key)
                if value is not None and (not isinstance(value, (int, float)) or value <= 0):
                    raise ConfigError(f"semantic_search.{key} must be a positive number")
            device = p.get("device")
            if device is not None and str(device) not in ("auto", "cpu", "cuda", "gpu"):
                raise ConfigError("semantic_search.device must be auto|cpu|cuda")
        if name == "persistence":
            sampling = p.get("detection_sampling", 1)
            if not isinstance(sampling, int) or sampling < 1:
                raise ConfigError("persistence.detection_sampling must be a positive integer")
            timeout = p.get("finalize_timeout_s", 5.0)
            if timeout is not None and not (isinstance(timeout, (int, float)) and timeout >= 0):
                raise ConfigError("persistence.finalize_timeout_s must be >= 0")
            db = p.get("database")
            if db is not None and not isinstance(db, dict):
                raise ConfigError("persistence.database must be a mapping of postgres connection params")
    return out


# --------------------------------------------------------------------------- #
# Implicit dependency resolution
# --------------------------------------------------------------------------- #


ModuleSpec = Callable[[str], list[str]]


def resolve_enabled(
    requested: set[str],
    requires_of: ModuleSpec,
    produces_by_key: dict[str, list[str]],
    order: list[str] | None = None,
) -> tuple[list[str], dict[str, str]]:
    """Auto-enable the minimum upstream dependency chain.

    Returns (enabled_modules_in_execution_order, auto_enable_reasons).
    Raises ConfigError if a requested module needs a capability that no known
    module produces → fail fast at startup, never mid-run.
    """
    order = order or [m for m in produces_by_key_flat(produces_by_key) if m]
    rank = {m: i for i, m in enumerate(order)}

    def _first_producer(key: str) -> str | None:
        cands = produces_by_key.get(key, [])
        if not cands:
            return None
        return min(cands, key=lambda p: rank.get(p, 1_000_000))

    enabled = set(requested)
    auto: dict[str, str] = {}
    changed = True
    while changed:
        changed = False
        for member in sorted(enabled, key=lambda m: rank.get(m, 1_000_000)):
            for key in requires_of(member):
                producer = _first_producer(key)
                if producer is None:
                    raise ConfigError(
                        f"module {member!r} requires capability {key!r} but no "
                        "registered module produces it. Enable or add a producer."
                    )
                if producer not in enabled:
                    auto[producer] = f"required by {member!r} via capability {key!r}"
                    enabled.add(producer)
                    changed = True
    exec_order = [m for m in order if m in enabled]
    leftover = [m for m in enabled if m not in exec_order]
    exec_order.extend(sorted(leftover))
    return exec_order, auto


def produces_by_key_flat(produces_by_key: dict[str, list[str]]) -> list[str]:
    all_names = [m for names in produces_by_key.values() for m in names]
    seen: set[str] = set()
    out = []
    for n in all_names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


# --------------------------------------------------------------------------- #
# Typed helpers for the orchestrator
# --------------------------------------------------------------------------- #


def capability_enabled(cfg: AinaConfig, module: str) -> bool:
    cc = cfg.capabilities.get(module)
    return bool(cc and cc.enabled)


def auto_enable_log(auto: dict[str, str]) -> None:
    for module, reason in auto.items():
        logger.info("auto-enabled module %r (%s)", module, reason)