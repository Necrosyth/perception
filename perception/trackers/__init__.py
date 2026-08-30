"""Trackers package: plug-play backends (bytetrack | iou) + registry."""

from .base import (
    TrackState,
    TrackerBackend,
    TrackerError,
    TrackerRegistry,
    compute_iou,
)
from .byte_track import ByteTrackBackend
from .iou_tracker import IoUTrackerBackend

# Register backends at import so TrackerRegistry.create() can find them.
TrackerRegistry.register(ByteTrackBackend)
TrackerRegistry.register(IoUTrackerBackend)

__all__ = [
    "TrackState",
    "TrackerBackend",
    "TrackerError",
    "TrackerRegistry",
    "compute_iou",
    "ByteTrackBackend",
    "IoUTrackerBackend",
]