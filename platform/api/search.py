"""Retrieval layer for Stage 7 semantic search.

Pipeline per the build prompt: structured filters are applied FIRST
(camera / zone / label / event-kind / time window), then pgvector cosine KNN
runs inside that narrowed set. Query text is embedded by the *same* local CLIP
model that embedded the thumbnails, via the perception container's tiny embed
RPC ("one home for the model") — the API image never installs torch.

The query vector is inlined into SQL as a float-only literal (never user text),
so `%s` placeholder ordering can never drift between SELECT/WHERE/ORDER BY.
Same psycopg3 style as main.py — no ORM.
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger("aina.api.search")

RPC_URL = os.environ.get("AINA_PERCEPTION_RPC_URL", "http://perception:5055")
_RPC_TIMEOUT = 20.0
_RPC_CACHE: dict[str, tuple[float, list[float]]] = {}  # text -> (ts, vector)
_RPC_CACHE_TTL = 300.0
_RPC_CACHE_MAX = 64

# COCO 80 (YOLO) label table — used when a camera's sink doesn't populate
# text class names (observed live: tracks.class_name can be '' while class_id
# is always set).
COCO80 = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
    "truck", "boat", "traffic light", "fire hydrant", "stop sign",
    "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag",
    "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana",
    "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza",
    "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table",
    "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
    "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock",
    "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
]

LABEL_ALIASES = {
    "vehicle": "car", "automobile": "car", "pedestrian": "person", "man": "person",
    "woman": "person", "people": "person", "bike": "bicycle", "cyclist": "bicycle",
    "lorry": "truck", "van": "truck", "motorbike": "motorcycle", "crate": "box",
}


def coco_class_name(class_id: Any) -> str:
    if class_id is None:
        return ""
    try:
        idx = int(class_id)
    except (TypeError, ValueError):
        return ""
    return COCO80[idx] if 0 <= idx < len(COCO80) else ""


def normalize_label(label: str) -> str | None:
    label = str(label).strip().lower()
    return None if not label else LABEL_ALIASES.get(label, label)


def class_id_set(label: str) -> list[int]:
    name = normalize_label(label) or label
    return [i for i, cand in enumerate(COCO80) if cand == name]


def _vector_str(vector: list[float]) -> str:
    return "[{}]".format(",".join(f"{float(v):.6f}" for v in vector))


# --------------------------------------------------------------------------- #
# Query-text embedding via the perception embed RPC
# --------------------------------------------------------------------------- #
def embed_query_text(text: str) -> list[float] | None:
    """Embed NL query text with the live model; None when the RPC is down."""
    if not text.strip():
        return None
    cached = _RPC_CACHE.get(text)
    if cached and time.time() - cached[0] < _RPC_CACHE_TTL:
        return cached[1]
    req = urllib.request.Request(
        f"{RPC_URL}/embed",
        data=json.dumps({"text": text}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_RPC_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        vector = [float(v) for v in payload["vector"]]
    except (urllib.error.URLError, KeyError, ValueError, TimeoutError) as exc:
        logger.warning("embed RPC unavailable (%s: %s) — semantic part skipped", type(exc).__name__, exc)
        vector = None
    if vector:
        _RPC_CACHE[text] = (time.time(), vector)
        if len(_RPC_CACHE) > _RPC_CACHE_MAX:
            oldest = min(_RPC_CACHE, key=lambda k: _RPC_CACHE[k][0])
            _RPC_CACHE.pop(oldest, None)
    return vector


# --------------------------------------------------------------------------- #
# Search SQL builder
# --------------------------------------------------------------------------- #
def search_embeddings(
    conn,
    *,
    camera: str | None = None,
    zone: str | None = None,
    label: str | None = None,
    event_type: str | None = None,
    time_from: Any = None,
    time_to: Any = None,
    query_vector: list[float] | None = None,
    similar_id: str | None = None,
    sort: str = "relevance",
    limit: int = 24,
) -> dict:
    """KNN-within-filters over the embeddings pool."""
    where, params, query_vector, similar_found = _prepare(
        conn, camera, zone, label, event_type, time_from, time_to, query_vector, similar_id
    )
    if similar_id and not similar_found:
        return {"results": [], "count": 0}

    vec_literal = _vector_str(query_vector) if query_vector is not None else None
    dist_expr = f"e.vector <=> '{vec_literal}'::vector" if vec_literal else "NULL::float8"
    if vec_literal is not None and sort != "date":
        order = f"{dist_expr} ASC"
    else:
        order = "e.created_at DESC"

    sql = f"""
        SELECT e.id, c.name AS camera, t.global_track_id, t.class_id,
               zq.zone_name, (e.meta->>'confidence')::float8 AS confidence,
               e.created_at, (e.meta->>'captured_at')::float8 AS captured_at,
               {dist_expr} AS dist,
               e.meta->>'thumbnail_b64' AS thumb, e.model
        FROM embeddings e
        JOIN tracks t ON t.id = e.track_id
        JOIN cameras c ON c.id = t.camera_id
        LEFT JOIN LATERAL (
            SELECT z.name AS zone_name
            FROM events ev JOIN zones z ON z.id = ev.zone_id
            WHERE ev.track_id = t.id AND ev.event_type = 'entered_zone'
            ORDER BY ev.started_at DESC LIMIT 1
        ) zq ON true
        WHERE {(" AND ".join(where)) if where else "1=1"}
        ORDER BY {order}
        LIMIT %s
    """
    params = params + [max(1, min(int(limit), 200))]
    rows = conn.cursor().execute(sql, params).fetchall()
    return _rows_to_dict(rows)


def _prepare(conn, camera, zone, label, event_type, time_from, time_to, query_vector, similar_id):
    where: list[str] = []
    params: list[Any] = []
    similar_found = True

    if similar_id:
        row = conn.cursor().execute(
            "SELECT vector::text FROM embeddings WHERE id = %s::uuid", [similar_id]
        ).fetchone()
        if row is None or not row[0]:
            similar_found = False
        else:
            query_vector = _parse_vector(row[0])
            where.append("e.id <> %s::uuid")
            params.append(similar_id)

    if camera:
        where.append("c.name = %s")
        params.append(camera)
    if zone:
        where.append("zq.zone_name = %s")
        params.append(zone)
    if label:
        ids = class_id_set(label)
        name = normalize_label(label) or label
        if ids:
            # Match by COCO class_id OR the stored text name — real cameras can
            # carry non-COCO class_id values (observed: early sinks recorded
            # the global_track_id there while class_name stayed correct).
            where.append("(t.class_id::int = ANY(%s::int[]) OR lower(t.class_name) = lower(%s))")
            params.append(ids)
            params.append(name)
        else:
            where.append("lower(t.class_name) = lower(%s)")
            params.append(name)
    if event_type:
        where.append(
            "EXISTS (SELECT 1 FROM events ev2 WHERE ev2.track_id = t.id AND ev2.event_type = %s)"
        )
        params.append(event_type)
    if time_from is not None:
        where.append("(e.meta->>'captured_at')::float8 >= %s")
        params.append(_epoch(time_from))
    if time_to is not None:
        where.append("(e.meta->>'captured_at')::float8 <= %s")
        params.append(_epoch(time_to))
    return where, params, query_vector, similar_found


def _parse_vector(text: str) -> list[float]:
    return [float(v) for v in json.loads(text)]


def _rows_to_dict(rows: list[tuple[Any, ...]]) -> dict:
    results = []
    for row in rows:
        (_id, camera, gid, class_id, zone, conf, created_at, captured, dist, thumb, model) = row
        results.append(
            {
                "embedding_id": str(_id),
                "track_id": gid,
                "camera": camera,
                "zone": zone,
                "label": coco_class_name(class_id),
                "confidence": round(conf, 4) if conf is not None else None,
                "captured_at": captured,
                "similarity": round(max(0.0, 1.0 - dist), 4) if dist is not None else None,
                "thumbnail": ("data:image/jpeg;base64," + thumb) if thumb else None,
                "model": model,
            }
        )
    return {"results": results, "count": len(results)}


def summary(conn) -> dict:
    """Label -> embedding count for the Explore landing view."""
    rows = conn.cursor().execute(
        "SELECT t.class_id, count(*) FROM embeddings e JOIN tracks t ON t.id = e.track_id "
        "GROUP BY t.class_id ORDER BY 2 DESC"
    ).fetchall()
    labels = [
        {"label": coco_class_name(class_id) or f"class-{class_id}", "count": int(count)}
        for class_id, count in rows
    ]
    return {"summary": labels}


def _epoch(dt) -> float:
    if dt.tzinfo is None:
        from datetime import timezone

        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()