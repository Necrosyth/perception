"""Registry of perception capabilities.

The real modules declare the same `requires()`/`produces()` contract; stubs that
remain raise NotImplementedError and set `implemented = False` so the orchestrator
refuses to boot with them enabled. Implemented so far:

- object_detection    -> Stage 3 (pluggable detector backends)
- tracking            -> Stage 4 (trackers package; time-scaled params)
- zones               -> Stage 4 (zone membership from tracks)

Remaining stages:

- behavior_loitering-> Stage 6
- semantic_search   -> Stage 7 (local CLIP embeddings, off hot path)
- anpr              -> Stage 8
"""
from __future__ import annotations

from typing import Any

from .base import CAP, Frame, PerceptionModule
from .object_detection import ObjectDetection
from .persistence import Persistence
from .tracking import Tracking
from .zones import Zones

REGISTRY_ORDER: list[str] = [
    "object_detection",
    "text_ocr",
    "tracking",
    "zones",
    "face_recognition",
    "anpr",
    "behavior_loitering",
    "behavior_tailgating",
    "semantic_search",
    "persistence",
]


class _Stub(PerceptionModule):
    """Base for registry stubs — process() must be implemented by real modules."""

    implemented = False

    def process(self, frame: Frame, upstream: dict[str, list[Any]]) -> dict[str, Any]:
        raise NotImplementedError(
            f"'{self.name}' is registered but not implemented yet; "
            "it must not be reached by a production run."
        )


class TextOCRStub(_Stub):
    name = "text_ocr"

    def requires(self) -> list[str]:
        return []

    def produces(self) -> list[str]:
        return [CAP["text_regions"].key]


class TrackingStub(_Stub):
    """Legacy alias kept for tests/tools that still reference the stub."""

    name = "tracking"

    def requires(self) -> list[str]:
        return [CAP["detections"].key]

    def produces(self) -> list[str]:
        return [CAP["tracks"].key]


class ZonesStub(_Stub):
    """Legacy alias kept for tests/tools that still reference the stub."""

    name = "zones"

    def requires(self) -> list[str]:
        return [CAP["tracks"].key]

    def produces(self) -> list[str]:
        return [CAP["zone_membership"].key]


class FaceRecognitionStub(_Stub):
    name = "face_recognition"

    def requires(self) -> list[str]:
        return [CAP["detections"].key]

    def produces(self) -> list[str]:
        return [CAP["faces"].key]


class ANPRStub(_Stub):
    name = "anpr"

    def requires(self) -> list[str]:
        return [CAP["detections"].key]

    def produces(self) -> list[str]:
        return [CAP["plates"].key]


class BehaviorLoiteringStub(_Stub):
    name = "behavior_loitering"

    def requires(self) -> list[str]:
        return [CAP["tracks"].key, CAP["zone_membership"].key]

    def produces(self) -> list[str]:
        return [CAP["events"].key]


class BehaviorTailgatingStub(_Stub):
    name = "behavior_tailgating"

    def requires(self) -> list[str]:
        return [CAP["tracks"].key, CAP["zone_membership"].key]

    def produces(self) -> list[str]:
        return [CAP["events"].key]


class SemanticSearchStub(_Stub):
    name = "semantic_search"

    def requires(self) -> list[str]:
        return [CAP["tracks"].key]

    def produces(self) -> list[str]:
        return [CAP["embeddings"].key]


REGISTRY: dict[str, type[PerceptionModule]] = {
    "object_detection": ObjectDetection,
    "text_ocr": TextOCRStub,
    "tracking": Tracking,
    "zones": Zones,
    "face_recognition": FaceRecognitionStub,
    "anpr": ANPRStub,
    "behavior_loitering": BehaviorLoiteringStub,
    "behavior_tailgating": BehaviorTailgatingStub,
    "semantic_search": SemanticSearchStub,
    "persistence": Persistence,
}


def producer_keys() -> dict[str, list[str]]:
    """capability key -> module names producing it, in registry order."""
    out: dict[str, list[str]] = {}
    for name in REGISTRY_ORDER:
        if name not in REGISTRY:
            continue
        for k in REGISTRY[name]().produces():
            out.setdefault(k, []).append(name)
    return out


def capability_of(module_name: str) -> list[str]:
    return REGISTRY[module_name]().requires()