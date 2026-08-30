"""Encoder protocol + registry for the swappable local CLIP-style model.

This is the seam that keeps the model swappable: `get_embedder(model_name)`
returns whichever encoder implements the same `Embedder` protocol, and nothing
above (module, sink, RPC, API) imports a concrete backend.
"""
from __future__ import annotations

import logging
from typing import Protocol, runtime_checkable

import numpy as np

logger = logging.getLogger("aina.embeddings")


class EmbeddingError(Exception):
    """Raised when a requested encoder cannot be built (missing deps/weights)."""


@runtime_checkable
class Embedder(Protocol):
    """One local CLIP-style encoder. All outputs are L2-normalized.

    Both ``encode`` and ``encode_text`` return orthonormal (unit-length)
    vectors, so cosine similarity == inner product and pgvector's `<=>` cosine
    distance is a monotone re-ranking of dot-product similarity.
    """

    name: str            # stable model id stored in `embeddings.model`
    dim: int             # dimensionality of the stored vectors
    available: bool      # deps present + weights loadable right now

    def encode(self, patches: list[np.ndarray]) -> np.ndarray:
        """(N, dim) float32 normalized vectors for N RGB uint8 square patches."""

    def encode_text(self, text: str) -> np.ndarray:
        """(dim,) float32 normalized vector for one free-text query."""


_MODEL_ALIASES = {
    "local_clip": "open_clip",
    "open_clip": "open_clip",
    "jina_clip": "jina_clip",  # declared, not implemented yet — resolves loudly
}


def get_embedder(model_name: str, device: str = "auto") -> Embedder:
    """Build the configured encoder, failing fast on unknown/no-deps models.

    ``model_name`` matches the config shortlist (`semantic_search.embedding_model`).
    A model that cannot be built raises EmbeddingError; the orchestrator logs it
    and keeps the pipeline running with the module in pass-through.
    """
    alias = _MODEL_ALIASES.get(str(model_name).strip().lower(), str(model_name))
    if alias == "open_clip":
        from .backends.openclip import OpenClipEmbedder

        return OpenClipEmbedder(device=device)
    if alias == "jina_clip":
        raise EmbeddingError(
            "jina_clip is declared but not implemented yet — use embedding_model: "
            "local_clip (OpenCLIP) or implement the backend in "
            "perception/embeddings/backends/"
        )
    raise EmbeddingError(
        f"unknown embedding_model {model_name!r} (known: local_clip/open_clip)"
    )