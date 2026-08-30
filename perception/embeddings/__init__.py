"""swappable local CLIP-style encoder + async embedding service (Stage 7).

The interface is encoder-agnostic (`Embedder` protocol), so the operator can
pick another local model without touching the module or the sink; the model
shortlist is config (`semantic_search.embedding_model`) and maps here.
Backends ship their tree-of-life deps as deferred imports so hosts/tests
without the ``semantic`` extra stay importable (same pattern as psycopg).
"""
from __future__ import annotations

from .crop import crop_patch
from .embedder import Embedder, EmbeddingError, get_embedder
from .rpc import EmbedRPC
from .service import EmbeddingService

__all__ = [
    "Embedder",
    "EmbeddingError",
    "EmbeddingService",
    "EmbedRPC",
    "crop_patch",
    "get_embedder",
]