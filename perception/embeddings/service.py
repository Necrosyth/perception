"""Async embedding service — CLIP runs OFF the per-frame hot path.

``process()`` only crops tiny patches and enqueues them; a single daemon worker
owns the encoder, batches up to ``batch_size`` crops per CLIP forward, encodes
the thumbnails to JPEG/base64, and hands finished rows back to the module via
``drain()`` for the persistence sink. A bounded queue means embedding work can
never wedge the detection loop: overflow drops (with a throttled warning).
"""
from __future__ import annotations

import base64
import io
import logging
import queue
import threading
import time

import numpy as np

from .crop import crop_patch
from .embedder import Embedder, EmbeddingError

logger = logging.getLogger("aina.embeddings.service")


def _to_jpeg_b64(patch: np.ndarray, quality: int = 80) -> str | None:
    try:
        import cv2
    except ImportError:  # pragma: no cover - cv2 ships with the runtime; tests may lack it
        return None
    ok, buf = cv2.imencode(".jpg", patch, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        return None
    return base64.b64encode(buf.tobytes()).decode("ascii")


class EmbeddingService:
    """One encoder + worker queue + per-track best-thumbnail policy."""

    def __init__(
        self,
        embedder: Embedder,
        *,
        batch_size: int = 8,
        max_queue: int = 512,
        refresh_seconds: float = 10.0,
        confidence_eps: float = 0.02,
        thumbnail_size: int = 96,
    ) -> None:
        self.embedder = embedder
        self._batch_size = max(1, batch_size)
        self._max_queue = max(8, max_queue)
        self._refresh_seconds = max(0.0, refresh_seconds)
        self._confidence_eps = max(0.0, confidence_eps)
        self._thumbnail_size = max(32, thumbnail_size)
        # (source, gid) -> {best_conf, last_embedded_conf, last_embedded_ts}
        self._state: dict[tuple[str, int], dict[str, float]] = {}
        self._seen_at: dict[tuple[str, int], float] = {}
        self._jobs: queue.Queue = queue.Queue(maxsize=self._max_queue)
        self._out: queue.Queue = queue.Queue()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.dropped = 0
        self.embedded = 0

    # -- lifecycle ------------------------------------------------------ #
    def start(self) -> None:
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="aina-embeddings", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5.0)
            self._thread = None

    # -- hot path: cheap decision + tiny crop, never the encoder --------- #
    def suggest(
        self,
        image,
        source: str,
        track_id: int,
        class_id: int,
        class_name: str,
        confidence: float,
        xyxy: tuple[float, float, float, float],
        now: float,
    ) -> None:
        key = (source, track_id)
        st = self._state.get(key)
        if st is None:
            st = self._state[key] = {"best_conf": -1.0, "last_embedded_conf": -1.0, "last_embedded_ts": 0.0}
        if confidence >= st["best_conf"]:
            st["best_conf"] = float(confidence)
        self._seen_at[key] = now

        improved = confidence - st["last_embedded_conf"] >= self._confidence_eps
        stale = now - st["last_embedded_ts"] >= self._refresh_seconds
        if not (improved or stale):
            return

        patch = crop_patch(image, xyxy, self._thumbnail_size)
        if patch is None:
            return
        job = {
            "patch": patch,
            "meta": {
                "class_name": class_name,
                "class_id": int(class_id),
                "confidence": float(round(confidence, 4)),
                "xyxy": [float(round(v, 2)) for v in xyxy],
                "captured_at": now,
            },
            "key": key,
        }
        try:
            self._jobs.put_nowait(job)
            st["last_embedded_conf"] = float(confidence)
            st["last_embedded_ts"] = now
        except queue.Full:
            self.dropped += 1
            if self.dropped % 200 == 1:
                logger.warning("embedding queue full — dropped %d crops", self.dropped)
        self._prune(now)

    def drain(self) -> list[dict]:
        rows: list[dict] = []
        while True:
            try:
                rows.append(self._out.get_nowait())
            except queue.Empty:
                break
        return rows

    # -- encoder thread -------------------------------------------------- #
    def _run(self) -> None:
        batch: list[dict] = []
        while not self._stop.is_set():
            try:
                job = self._jobs.get(timeout=0.5)
            except queue.Empty:
                self._encode(batch)
                batch = []
                continue
            batch.append(job)
            if len(batch) >= self._batch_size:
                self._encode(batch)
                batch = []
        if batch:
            self._encode(batch)

    def _encode(self, batch: list[dict]) -> None:
        if not batch:
            return
        patches = [job["patch"] for job in batch]
        try:
            vectors = self.embedder.encode(patches)
        except Exception as exc:  # noqa: BLE001 - encoder trouble != pipeline trouble
            logger.warning("embedding encode failed (%s) — dropping %d crops", exc, len(batch))
            return
        vectors = np.asarray(vectors)
        for idx, job in enumerate(batch):
            if idx >= len(vectors):
                break
            meta = dict(job["meta"])
            meta["thumbnail_b64"] = _to_jpeg_b64(patches[idx])
            source, gid = job["key"]
            self._out.put(
                {
                    "camera": source,
                    "track_id": gid,
                    "model": self.embedder.name,
                    "vector": [float(v) for v in vectors[idx]],
                    "meta": meta,
                }
            )
            self.embedded += 1

    # -- text query embedding (RPC path, synchronous) -------------------- #
    def embed_text(self, text: str) -> list[float]:
        vec = self.embedder.encode_text(text)
        return [float(v) for v in vec]

    # -- bookkeeping ----------------------------------------------------- #
    def _prune(self, now: float) -> None:
        if len(self._seen_at) < 1000:
            return
        for key in [k for k, t in self._seen_at.items() if now - t > 300]:
            self._seen_at.pop(key, None)
            self._state.pop(key, None)