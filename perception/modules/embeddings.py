"""semantic_search module — Stage 7 (embeddings & semantic search).

Produces ``embeddings`` by running the swappable local CLIP-style encoder
(``perception/embeddings``) over each tracked object's best-confidence crop,
**off** the per-frame hot path (tiny crop enqueued; encoder runs in a worker
thread). The embeddings capability is a sink contract exactly like ``events``:
the persistence module consumes it and writes real rows to pgvector.

Also hosts the text-embedding RPC the query API uses ("one home for the model"):
query text is embedded by the *same* encoder that embedded the thumbnails.

Module decoupling: consumes only capabilities (``detections`` for class names,
``tracks`` for boxes/confidence). Never imports another module.
"""
from __future__ import annotations

import logging
from typing import Any

from ..embeddings import EmbeddingService, EmbeddingError, EmbedRPC, get_embedder
from .base import CAP, Frame, PerceptionModule
from .tracking import Tracks

logger = logging.getLogger("aina.modules.semantic_search")

CAP_EMBEDDINGS = CAP["embeddings"].key


class SemanticEmbeddings:
    """The ``embeddings`` capability payload (one frame's finished rows)."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows


class SemanticSearch(PerceptionModule):
    name = "semantic_search"
    implemented = True

    def __init__(self) -> None:
        super().__init__()
        self._service: EmbeddingService | None = None
        self._rpc: EmbedRPC | None = None
        self._disabled = False
        self._class_names: dict[int, str] = {}

    def requires(self) -> list[str]:
        # "detections" is consumed only for class-name labels on the row meta.
        return [CAP["detections"].key, CAP["tracks"].key]

    def produces(self) -> list[str]:
        return [CAP_EMBEDDINGS]

    def configure(self, params: dict[str, Any] | None = None) -> None:
        super().configure(params)
        if "rpc_port" in self.params and not (1 <= int(self.params["rpc_port"]) <= 65535):
            raise ValueError("semantic_search.rpc_port must be in 1..65535")
        for key in ("refresh_seconds", "confidence_eps", "thumbnail_size"):
            if key in self.params and not (isinstance(self.params[key], (int, float)) and self.params[key] >= 0):
                raise ValueError(f"semantic_search.{key} must be >= 0")

    def start(self) -> None:
        model = str(self.params.get("embedding_model", "local_clip"))
        device = str(self.params.get("device", "auto"))
        try:
            embedder = get_embedder(model, device=device)
        except EmbeddingError as exc:
            logger.warning("semantic_search disabled: %s", exc)
            self._disabled = True
            return
        if not embedder.available:
            logger.warning("semantic_search disabled: encoder reports unavailable")
            self._disabled = True
            return
        self._service = EmbeddingService(
            embedder,
            batch_size=int(self.params.get("batch_size", 8)),
            max_queue=int(self.params.get("max_queue", 512)),
            refresh_seconds=float(self.params.get("refresh_seconds", 10.0)),
            confidence_eps=float(self.params.get("confidence_eps", 0.02)),
            thumbnail_size=int(self.params.get("thumbnail_size", 96)),
        )
        self._service.start()
        try:
            port = int(self.params.get("rpc_port", 5055))
            self._rpc = EmbedRPC(self._service.embed_text, embedder.name, embedder.dim)
            self._rpc.start(port)
        except OSError as exc:
            logger.warning("embed RPC not started (%s) — query-time text embedding will fall back", exc)
        logger.info("semantic_search ready (model=%s dim=%d)", embedder.name, embedder.dim)

    def process(self, frame: Frame, upstream: dict[str, list[Any]]) -> dict[str, Any]:
        if self._disabled or self._service is None:
            return {}
        self._class_names = _class_names(upstream.get(CAP["detections"].key))
        tracks = _tracks(upstream.get(CAP["tracks"].key))
        service = self._service
        now = frame.timestamp
        for track in tracks:
            if track.source != frame.source or track.raw_xyxy is None:
                continue
            service.suggest(
                frame.image,
                source=track.source,
                track_id=track.track_id,
                class_id=track.class_id,
                class_name=self._class_names.get(int(track.class_id), ""),
                confidence=track.confidence,
                xyxy=track.raw_xyxy,
                now=now,
            )
        rows = service.drain()
        if not rows:
            return {}
        return {CAP_EMBEDDINGS: SemanticEmbeddings(rows)}

    def stop(self) -> None:
        if self._rpc is not None:
            self._rpc.stop()
            self._rpc = None
        if self._service is not None:
            self._service.stop()
            self._service = None


# --------------------------------------------------------------------------- #
# payload decoders (module never imports other modules; mirrors tracking.py)
# --------------------------------------------------------------------------- #


def _tracks(values: list[Any]) -> list:
    for value in values:
        if isinstance(value, Tracks):
            return value.tracks
        if isinstance(value, dict):
            payload = value.get("tracks")
            if isinstance(payload, Tracks):
                return payload.tracks
            if isinstance(payload, list) and payload and isinstance(payload[0], Tracks):
                return payload[0].tracks
    return []


def _class_names(values: list[Any]) -> dict[int, str]:
    out: dict[int, str] = {}
    for value in values:
        data = getattr(value, "data", None)
        if isinstance(data, dict):
            for k, v in (data.get("class_names") or {}).items():
                out[int(k)] = str(v)
    return out