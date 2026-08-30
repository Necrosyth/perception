"""Perception module contract.

Constraint enforcement (AINA_AGENT_BUILD_PROMPT §0.1 / §0.2) is structural:

- A module never imports another module. It declares what upstream *capability
  keys* it needs and what keys it writes; the orchestrator wires them.
- If two enabled modules need the same upstream key, the unique producer for
  that key runs exactly once per frame and both consumers read the cached value
  — duplicate compute is *impossible* by construction, see orchestrator.py.
"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Capability:
    """One typed capability key in the inter-module namespace."""

    key: str


CAP = {
    "detections": Capability("detections"),           # produced by object_detection
    "text_regions": Capability("text_regions"),       # produced by text_ocr
    "tracks": Capability("tracks"),                   # produced by tracking
    "zone_membership": Capability("zone_membership"),  # produced by zones
    "faces": Capability("faces"),                     # produced by face_recognition
    "plates": Capability("plates"),                   # produced by anpr
    "events": Capability("events"),                   # produced by behavior modules
    "embeddings": Capability("embeddings"),           # produced by semantic_search
}


@dataclass
class Frame:
    """One decoded frame flowing through the module graph.

    `image` is deliberately untyped: it is whatever the active ingestion layer
    hands us (BGR ndarray on CPU/GPU today). Modules treat it opaquely.
    """

    source: str
    frame_id: int
    timestamp: float = field(default_factory=time.time)
    image: Any = None
    width: int = 0
    height: int = 0


class PerceptionModule(ABC):
    """Base contract every perception capability implements.

    Subclasses must set `name` and implement `requires`, `produces`, `process`.
    """

    name: str = ""

    # Set False by registry stubs so a not-yet-implemented capability can never
    # silently pass as working: the orchestrator refuses to start with it enabled.
    implemented: bool = True

    def __init__(self) -> None:
        self.params: dict[str, Any] = {}
        # Cross-cutting smoothing stack from config/aina.yaml -> smoothing.
        # Set by the orchestrator for every module; modules that care read the
        # toggles they use. Each smoothing toggle is independently debuggable.
        self.smoothing: dict[str, Any] = {}

    def configure(self, params: dict[str, Any] | None = None) -> None:
        """Merge this module's CapabilityConfig.params from aina.yaml."""
        self.params = dict(params or {})

    @abstractmethod
    def requires(self) -> list[str]:
        """Capability keys this module consumes from upstream modules' outputs."""

    @abstractmethod
    def produces(self) -> list[str]:
        """Capability keys this module writes, made available to downstream modules."""

    @abstractmethod
    def process(self, frame: Frame, upstream: dict[str, list[Any]]) -> dict[str, Any]:
        """Compute on one frame.

        `upstream` maps every key in requires() to the cached values produced
        this frame (each value is a list because multiple producers may
        legitimately broadcast the same capability, e.g. several behavior
        modules each emit "events").

        Returns a dict keyed by produces(). Must not reach into other modules,
        must not import other modules.
        """

    # --- lifecycle (optional hooks, default no-ops) ---

    def start(self) -> None:  # pragma: no cover - optional hook
        """Called once after the orchestrator builds the graph."""

    def stop(self) -> None:  # pragma: no cover - optional hook
        """Called once at shutdown."""

    def __repr__(self) -> str:
        return f"<{type(self).__name__} name={self.name!r}>"