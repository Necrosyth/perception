"""Stage 7 embeddings tests — crop, service policy, RPC, module contract.

Pure-logic focus like the rest of the suite (no CLIP, no database): the real
encoder is behind the swappable Embedder protocol and everything above it is
tested against fakes. If ``open_clip`` is not installed here, the module still
boots in pass-through — that graceful path is asserted too.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.request

import numpy as np
import pytest

from perception.embeddings import EmbeddingError, EmbedRPC, EmbeddingService, crop_patch, get_embedder


class FakeEmbedder:
    name = "fake_clip"
    dim = 1024
    available = True

    def encode(self, patches):
        return np.full((len(patches), self.dim), 0.25, dtype=np.float32)

    def encode_text(self, text):
        return np.full(self.dim, 0.5, dtype=np.float32)


class _Img:
    def __init__(self, image, ts=0.0):
        self.image = image
        self.timestamp = ts


def _poll(cond, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cond():
            return True
        time.sleep(0.01)
    return False


# --------------------------------------------------------------------------- #
# crop_patch
# --------------------------------------------------------------------------- #
def _img(w=200, h=100):
    img = np.zeros((h, w, 3), dtype=np.uint8)

    def rgb(x, y, r, g, b):
        img[y, x] = [b, g, r]  # BGR storage

    for x in range(10, 30):  # red patch (RGB channels reversed in BGR)
        for y in range(20, 40):
            rgb(x, y, 255, 0, 0)
    return img


def test_crop_patch_letterboxes_and_is_rgb():
    img = _img()
    patch = crop_patch(img, (5, 15, 35, 45), side=96)
    assert patch is not None
    assert patch.shape == (96, 96, 3)
    # BGR(0,0,255) in the source red block becomes RGB (255,0,0)
    center = patch[32, 24]
    assert int(center[0]) > 200 and int(center[2]) < 50  # r high, b low


def test_crop_patch_clamps_out_of_frame():
    img = _img()
    patch = crop_patch(img, (-50, -50, 10, 10), side=96)
    assert patch is not None and patch.shape == (96, 96, 3)


def test_crop_patch_empty_when_fully_outside():
    img = _img()
    assert crop_patch(img, (900, 900, 950, 950), side=96) is None
    assert crop_patch(None, (0, 0, 10, 10)) is None


# --------------------------------------------------------------------------- #
# embedder registry
# --------------------------------------------------------------------------- #
def test_get_embedder_rejects_unknown_model():
    with pytest.raises(EmbeddingError, match="unknown embedding_model"):
        get_embedder("nonsense")


def test_get_embedder_jina_is_declared_but_not_implemented():
    with pytest.raises(EmbeddingError, match="not implemented yet"):
        get_embedder("jina_clip")


def test_openclip_backend_missing_imports_is_graceful_pass_through():
    svc = get_embedder("local_clip")  # no open_clip on this host -> available False
    assert svc.available is False


# --------------------------------------------------------------------------- #
# EmbeddingService policy + pipeline
# --------------------------------------------------------------------------- #
def test_suggests_embeds_new_track_then_skips_until_improved_or_stale():
    svc = EmbeddingService(FakeEmbedder(), refresh_seconds=10.0, confidence_eps=0.02, thumbnail_size=64)
    # NOTE: never started -> worker is off, so _jobs is a pure policy journal
    img = _img()
    box = (40, 30, 80, 90)
    svc.suggest(img, "cam", 7, 0, "person", 0.90, box, 0.0)
    assert svc._jobs.qsize() == 1
    svc.suggest(img, "cam", 7, 0, "person", 0.90, box, 0.1)  # same conf -> no
    assert svc._jobs.qsize() == 1
    svc.suggest(img, "cam", 7, 0, "person", 0.97, box, 0.2)  # improved -> yes
    assert svc._jobs.qsize() == 2
    svc.suggest(img, "cam", 7, 0, "person", 0.97, box, 0.3)  # no
    assert svc._jobs.qsize() == 2
    svc.suggest(img, "cam", 7, 0, "person", 0.90, box, 11.0)  # stale refresh
    assert svc._jobs.qsize() == 3


def test_worker_encodes_and_drains_rows():
    svc = EmbeddingService(FakeEmbedder(), batch_size=2, thumbnail_size=64)
    svc.start()
    img = _img()
    try:
        svc.suggest(img, "cam", 7, 0, "person", 0.9, (40, 30, 80, 90), 0.0)
        svc.suggest(img, "cam", 9, 2, "car", 0.8, (50, 30, 90, 80), 0.0)
        assert _poll(lambda: svc.embedded >= 2)
        rows = svc.drain()
        assert len(rows) == 2
        row = rows[0]
        assert row["camera"] == "cam"
        assert row["track_id"] in (7, 9)
        assert row["model"] == "fake_clip"
        assert len(row["vector"]) == 1024
        assert row["meta"]["captured_at"] == 0.0
        assert isinstance(row["meta"]["confidence"], float)
        assert "xyxy" in row["meta"]
    finally:
        svc.stop()


def test_overflow_drops_without_blocking():
    svc = EmbeddingService(FakeEmbedder(), max_queue=4, thumbnail_size=32)
    # never started: worker off, every suggest that passes policy lands in queue
    img = _img()
    # fill the queue with distinct tracks (all unique gids -> every suggest enqueues)
    for gid in range(400):
        svc.suggest(img, "cam", gid, 0, "person", 0.9, (40, 30, 80, 90), float(gid))
    assert svc.dropped > 0
    assert svc._jobs.qsize() == svc._max_queue  # clamps to the configured floor of 8


def test_embed_text_is_synchronous():
    svc = EmbeddingService(FakeEmbedder())
    vec = svc.embed_text("a red truck")
    assert len(vec) == 1024 and abs(sum(vec) / 1024 - 0.5) < 1e-6


# --------------------------------------------------------------------------- #
# EmbedRPC
# --------------------------------------------------------------------------- #
def test_rpc_embeds_and_pings():
    svc = EmbeddingService(FakeEmbedder())
    rpc = EmbedRPC(svc.embed_text, "fake_clip", 1024)
    try:
        rpc.start(0)  # ephemeral port
        port = rpc.port
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/ping", timeout=5) as resp:
            ping = json.loads(resp.read().decode())
        assert ping["model"] == "fake_clip" and ping["dim"] == 1024 and ping["available"]
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/embed",
            data=json.dumps({"text": "red truck"}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode())
        assert len(payload["vector"]) == 1024
    finally:
        rpc.stop()


# --------------------------------------------------------------------------- #
# openclip backend
# --------------------------------------------------------------------------- #
def test_openclip_patches_are_converted_to_pil():
    """crop_patch (ndarray) -> PIL before the torchvision v1 preprocess."""
    Image = pytest.importorskip("PIL.Image")
    from perception.embeddings.backends.openclip import _as_images, OpenClipEmbedder

    patches = [np.zeros((96, 96, 3), dtype=np.uint8), np.full((64, 32, 3), 128, dtype=np.uint8)]
    images = _as_images(patches)
    assert len(images) == 2
    assert all(isinstance(p, Image.Image) for p in images)
    assert [p.size for p in images] == [(96, 96), (32, 64)]


# --------------------------------------------------------------------------- #
# module contract
# --------------------------------------------------------------------------- #
def test_module_contract(monkeypatch):
    from perception.modules.embeddings import SemanticSearch

    monkeypatch.setattr("perception.modules.embeddings.get_embedder", lambda *a, **k: FakeEmbedder())
    module = SemanticSearch()
    assert module.name == "semantic_search"
    assert module.requires() == ["detections", "tracks"]
    assert module.produces() == ["embeddings"]
    module.configure({"embedding_model": "local_clip"})
    assert module.params["embedding_model"] == "local_clip"


def test_module_registration_present():
    from perception.modules import REGISTRY, SemanticSearch

    assert REGISTRY["semantic_search"] is SemanticSearch
    # REAL module, not a stub
    assert REGISTRY["semantic_search"]().implemented is True