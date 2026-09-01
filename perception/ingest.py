"""Frame ingestion: go2rtc restream -> Frame stream at a target FPS.

go2rtc opens each camera source exactly once (media service) and restreams it on
rtsp://<go2rtc-host>:8554/<camera-name>; every consumer — recording, detection,
review — reads THE SAME restream. The pump decodes a camera's restream with
OpenCV and feeds the orchestrator one Frame per step, throttled to the pipeline
FPS (10-12) by wall-clock time so we never out-run the GPU.

cv2 is optional at import time: the orchestrator keeps its idle boot even when
the ingestion deps are missing.
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Iterator

from .modules import Frame

logger = logging.getLogger("aina.ingest")

DEFAULT_FPS = 10.0
GO2RTC_HOST = os.environ.get("GO2RTC_HOST", "127.0.0.1")
GO2RTC_RTSP_PORT = os.environ.get("GO2RTC_RTSP_PORT", "8554")


class IngestionError(Exception):
    """Source cannot be opened or decoded."""


def go2rtc_url(camera: str) -> str:
    return f"rtsp://{GO2RTC_HOST}:{GO2RTC_RTSP_PORT}/{camera}"


@dataclass
class FramePump:
        """Yields decoded frames from one source, throttled to target_fps.

        `name` is the *logical camera name* — it becomes Frame.source, the key
        every consumer (tracking identity, zones, events) uses. `source` is the
        physical connection: a real local media file (demo/dev) or the go2rtc
        restream URL for the camera.
        """

        source: str
        target_fps: float = DEFAULT_FPS
        name: str = "camera"

        def __post_init__(self) -> None:
            self._cap = None
            self._period = 1.0 / max(0.1, float(self.target_fps))
            self._loop_media = bool(os.environ.get("AINA_MEDIA_LOOP", "1") not in ("0", "false", "no"))
            # consecutive read failures before we treat an RTSP source as dead
            self._max_fail = int(os.environ.get("AINA_INGEST_MAX_FAILURES", "30"))
            self._base_delay = max(self._period, min(float(os.environ.get("AINA_INGEST_BACKOFF", "2.0")), 30.0))

        def open(self) -> None:
            try:
                import cv2
            except ImportError as exc:
                raise IngestionError(
                    "opencv-python-headless not installed; add it via the uv-managed detection extras"
                ) from exc
            self._cap = cv2.VideoCapture(self.source)
            if not self._cap.isOpened():
                raise IngestionError(
                    f"cannot open video source {self.source!r} (local file existing? go2rtc restream up?)"
                )
            w = self._cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            h = self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            if self._is_media_file():
                logger.info("playing media file %r (%dx%d) as camera %r", self.source, w, h, self.name)
            else:
                logger.info("opened %s -> (%s, %s)", self.source, w, h)

        def _reconnect(self) -> None:
            """Release a dead RTSP capture and reopen it so a dropped stream
            recovers instead of hot-spinning on a dead handle forever."""
            import cv2

            if self._cap is not None:
                self._cap.release()
            self._cap = None
            delay = self._base_delay
            while self._cap is None:
                logger.warning("reconnecting %s (retry in %.1fs)", self.source, delay)
                time.sleep(delay)
                self._cap = cv2.VideoCapture(self.source)
                if self._cap is not None and self._cap.isOpened():
                    logger.info("reconnected %s", self.source)
                    return
                if self._cap is not None:
                    self._cap.release()
                    self._cap = None
                delay = min(delay * 2, 30.0)

        def frames(self) -> Iterator[Frame]:
            if self._cap is None:
                self.open()
            import cv2

            frame_id = 0
            fails = 0
            try:
                while self._cap is not None and self._cap.isOpened():
                    tick = time.monotonic()
                    ok, image = self._cap.read()
                    if not ok or image is None:
                        if self._is_media_file() and self._loop_media:
                            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            continue
                        fails += 1
                        if not self._is_media_file() and fails >= self._max_fail:
                            self._reconnect()
                            fails = 0
                            continue
                        # transient drop (or a genuinely lost RTSP stream before
                        # the reconnect threshold) — back off then retry
                        logger.debug("read failed on %s (%d consecutive) — retrying", self.source, fails)
                        time.sleep(self._period)
                        continue
                    fails = 0
                    h, w = image.shape[:2]
                    yield Frame(source=self.name, frame_id=frame_id, timestamp=time.time(),
                                image=image, width=w, height=h)
                    frame_id += 1
                    elapsed = time.monotonic() - tick
                    wait = self._period - elapsed
                    if wait > 0:
                        time.sleep(wait)
            finally:
                self.close()

        def close(self) -> None:
            if self._cap is not None:
                self._cap.release()
                self._cap = None

        def _is_media_file(self) -> bool:
            return os.path.isfile(self.source)


def build_pumps(cameras: list, target_fps: float = DEFAULT_FPS, url_builder=go2rtc_url) -> list[FramePump]:
    pumps = []
    for camera in cameras:
        # Real local media file (demo/dev) → read it directly; anything else is
        # an rtsp-ish source go2rtc restreams once on rtsp://<host>:8554/<name>.
        source = camera.source if os.path.isfile(camera.source) else url_builder(camera.name)
        pumps.append(FramePump(source=source, target_fps=target_fps, name=camera.name))
    if pumps and all(p._is_media_file() for p in pumps):
        logger.info(
            "all %d camera source(s) are local media files — bring-up demo mode, no go2rtc needed",
            len(pumps),
        )
    return pumps