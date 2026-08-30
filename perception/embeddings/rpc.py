"""Micro JSON RPC exposing the loaded encoder to the query API.

The API container must embed *query text* with the same model that embedded the
thumbnails, but it must not install a second copy of torch/CLIP. This tiny
threaded HTTP endpoint on the perception side ("one home for the model")
answers ``POST /embed`` (text -> vector) and ``GET /ping``. It is a service
detail, not a new module capability.
"""
from __future__ import annotations

import json
import logging
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable

logger = logging.getLogger("aina.embeddings.rpc")


class _Handler(BaseHTTPRequestHandler):
    embed_text: Callable[[str], list[float]] | None = None
    model_name = ""
    dim = 0

    # -- BaseHTTPRequestHandler ------------------------------------------ #
    def log_message(self, fmt, *args) -> None:  # noqa: A003 - one log line
        logger.debug("embed-rpc %s", fmt % args)

    def do_GET(self) -> None:  # noqa: N802 - http.server naming
        if self.path.split("?")[0] != "/ping":
            return self._json(404, {"error": "not found"})
        self._json(
            200,
            {
                "model": self.model_name,
                "dim": self.dim,
                "available": self.embed_text is not None,
            },
        )

    def do_POST(self) -> None:  # noqa: N802 - http.server naming
        if self.path.split("?")[0] != "/embed":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            text = str(body.get("text", "")).strip()
        except Exception as exc:  # noqa: BLE001 - malformed request -> 400
            return self._json(400, {"error": f"bad request: {exc}"})
        if not text:
            return self._json(400, {"error": "text is required"})
        if self.embed_text is None:
            return self._json(503, {"error": "encoder unavailable"})
        try:
            vector = self.embed_text(text)
        except Exception as exc:  # noqa: BLE001 - encode failure -> 500
            return self._json(500, {"error": f"encode failed: {exc}"})
        self._json(200, {"vector": vector, "model": self.model_name, "dim": self.dim})

    # -- helpers --------------------------------------------------------- #
    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class EmbedRPC:
    """Threaded JSON RPC bindable to a port; started/stopped by the module."""

    def __init__(self, embed_text: Callable[[str], list[float]], model_name: str, dim: int) -> None:
        self._embed_text = embed_text
        _Handler.embed_text = embed_text
        _Handler.model_name = model_name
        _Handler.dim = dim
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self.port: int | None = None

    def start(self, port: int, host: str = "0.0.0.0") -> None:
        self._server = ThreadingHTTPServer((host, port), _Handler)
        self.port = self._server.server_address[1]
        self._thread = threading.Thread(target=self._server.serve_forever, name="aina-embed-rpc", daemon=True)
        self._thread.start()
        logger.info("embed RPC listening on %s:%s", host, self.port)

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
            self._thread = None