"""OpenCLIP backend (the shipped local CLIP-style encoder).

Model: OpenCLIP ``ViT-H-14`` — its text and image embeddings are exactly 1024
dimensions, matching ``embeddings.vector vector(1024)`` from the Stage 5 spec.
Pretrained weights are downloaded to the local model cache on first build
(local-only; no cloud API call). The heavy imports live behind the ``semantic``
extra and are deferred so a host without them can still import the package.
"""
from __future__ import annotations

import logging
from typing import Any

import numpy as np

from ..embedder import Embedder, EmbeddingError

logger = logging.getLogger("aina.embeddings.openclip")

MODEL_NAME = "open_clip"
TARGET_DIM = 1024
# Valid pretrained tags for ViT-H-14 in current OpenCLIP (queried live); the
# ignored old "openai" tag is gone upstream and only produced a noisy root-log
# error on top of the real load failure.
PRETRAINED_ORDER = ("laion2b_s32b_b79k", "metaclip_fullcc")


def _device_for(device: str, _cuda: bool):
    if device in ("cuda", "gpu"):
        return "cuda" if _cuda else "cpu"
    if device == "cpu":
        return "cpu"
    return "cuda" if _cuda else "cpu"  # auto


def _as_images(patches: list[np.ndarray]) -> list[Any]:
    """Wrap RGB HWC uint8 patches as PIL Images.

    crop_patch hands us ndarrays, but the OpenCLIP preprocess pipeline is
    torchvision v1 and rejects raw ndarrays ("Unexpected type") — it wants
    PIL Images (or tensors).
    """
    from PIL import Image

    return [Image.fromarray(p) for p in patches]


class OpenClipEmbedder:
    """OpenCLIP ViT-H/14 encoder wrapped behind the Embedder protocol."""

    def __init__(self, device: str = "auto") -> None:
        self._device = "cpu"
        self._model = None
        self._preprocess = None
        self._cuda = False
        self.available = False
        try:
            import open_clip
            import torch  # noqa: F401 - probe torch presence for the device
        except Exception as exc:  # noqa: BLE001 - missing deps degrade loudly
            logger.warning(
                "open_clip backend unavailable (%s: %s) — semantic_search is "
                "pass-through; install the 'semantic' extra to arm it",
                type(exc).__name__,
                exc,
            )
            return
        self._load(open_clip, device)

    def _load(self, open_clip: Any, device: str) -> None:
        cuda = _cuda_available()
        self._cuda = cuda
        self._device = _device_for(device, cuda)
        last_error: Exception | None = None
        for pretrained in PRETRAINED_ORDER:
            try:
                # Build in fp32 on CPU, then halve and move to GPU in one step so
                # the GPU peak is just the fp16 weights (~1.3 GB). Loading with
                # `device="cuda"` materializes fp32 on the GPU first (~2.5 GB),
                # which blows past a desktop-shared 6 GB card when YOLO is up.
                self._model, _, self._preprocess = open_clip.create_model_and_transforms(
                    "ViT-H-14", pretrained=pretrained, device="cpu"
                )
                if self._device == "cuda":
                    self._model = self._model.half().cuda()
                self._model.eval()
                last_error = None
                break
            except Exception as exc:  # noqa: BLE001 - try the next pretrained source
                last_error = exc
                self._model = None
                logger.warning("open_clip %r weights load failed (%s) — trying next", pretrained, exc)
        if last_error is not None or self._model is None:
            raise EmbeddingError(
                f"open_clip ViT-H-14 weights could not be loaded: {last_error}"
            )
        self.available = True
        logger.info(
            "open_clip embedder ready: ViT-H-14 (dim=%d) on %s",
            self.dim,
            self._device,
        )

    # -- Embedder protocol ---------------------------------------------- #
    @property
    def name(self) -> str:
        return MODEL_NAME

    @property
    def dim(self) -> int:
        return TARGET_DIM

    def encode(self, patches: list[np.ndarray]) -> np.ndarray:
        import numpy as np
        import open_clip
        import torch
        from PIL import Image

        patches = [p for p in patches if p is not None and p.size]
        if not patches:
            return np.zeros((0, self.dim), dtype=np.float32)
        imgs = _as_images(patches)
        tensors = torch.stack([self._preprocess(img) for img in imgs]).to(self._device)
        with torch.no_grad():
            if self._device == "cuda":
                tensors = tensors.half()
                with torch.autocast("cuda", dtype=torch.float16):
                    feats = self._model.encode_image(tensors)
            else:
                feats = self._model.encode_image(tensors)
        feats = torch.nn.functional.normalize(feats.float(), dim=-1).cpu().numpy()
        return np.asarray(feats, dtype=np.float32)

    def encode_text(self, text: str) -> np.ndarray:
        import numpy as np
        import open_clip
        import torch

        tokens = open_clip.tokenize([text]).to(self._device)
        with torch.no_grad():
            if self._device == "cuda":
                with torch.autocast("cuda", dtype=torch.float16):
                    feats = self._model.encode_text(tokens)
            else:
                feats = self._model.encode_text(tokens)
        feats = torch.nn.functional.normalize(feats.float(), dim=-1).cpu().numpy()
        return np.asarray(feats[0], dtype=np.float32)


def _cuda_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:  # noqa: BLE001
        return False