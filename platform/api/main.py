"""Surveillance Intelligence Lab API — Stage 5 data layer.

Boots the Postgres schema (``platform/migrations``) on startup and serves the
catalog + the Stage-5 reconstruction query: "which tracks were active in zone X
between time A and B" (``GET /api/tracks?zone=&from=&to=``). Health reports DB
reachability; a down database degrades scores rather than failing the API.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Query

import db
import nl
import search

APP_NAME = "Surveillance Intelligence Lab"
APP_VERSION = "0.1.0-alpha"

logger = logging.getLogger("aina.api")

_CONN = None


def get_conn():
    """Long-lived connection with automatic reset; None until first use."""
    global _CONN
    try:
        if _CONN is None:
            _CONN = db.connect()
        _CONN.cursor().execute("SELECT 1")
        return _CONN
    except Exception:  # noqa: BLE001 - health must never 500
        if _CONN is not None:
            try:
                _CONN.close()
            except Exception:  # noqa: BLE001
                pass
            _CONN = None
        return None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    try:
        applied = db.migrate()
        if applied:
            logger.info("schema migrations applied: %s", applied)
    except Exception as exc:  # noqa: BLE001 - api stays up; perception + health report state
        logger.error("schema migration failed: %s", exc)
    yield


app = FastAPI(
    title=f"{APP_NAME} API",
    version=APP_VERSION,
    description="Hypotenuse Analytics — Predict. Protect. Verify.",
    lifespan=lifespan,
)

from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {"product": APP_NAME, "company": "Hypotenuse Analytics", "version": APP_VERSION}


@app.get("/health")
def health() -> dict:
    conn = get_conn()
    db_ok = conn is not None
    return {"status": "ok", "database": "ok" if db_ok else "unreachable"}


@app.get("/config")
def config() -> dict:
    """Echo the deployment target — proves the container saw the env config."""
    return {
        "deployment_target": os.environ.get("DEPLOYMENT_TARGET", "edge"),
        "config_path": "/etc/aina/aina.yaml",
    }


# --------------------------------------------------------------------------- #
# Stage 5 catalog + reconstruction endpoints
# --------------------------------------------------------------------------- #


def _dt(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _require_db():
    conn = get_conn()
    if conn is None:
        raise _DbUnavailable()
    return conn


class _DbUnavailable(Exception):
    pass


@app.exception_handler(_DbUnavailable)
async def _db_down(_request, exc):  # noqa: ANN001
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=503, content={"detail": "database unreachable"})


@app.get("/api/cameras")
def list_cameras() -> dict:
    conn = _require_db()
    rows = conn.cursor().execute(
        "SELECT id, name, source, enabled FROM cameras ORDER BY name"
    ).fetchall()
    return {
        "cameras": [
            {"id": str(row[0]), "name": row[1], "source": row[2], "enabled": row[3]}
            for row in rows
        ]
    }


@app.get("/api/zones")
def list_zones() -> dict:
    conn = _require_db()
    rows = conn.cursor().execute(
        "SELECT z.id, c.name, z.name, z.polygon FROM zones z "
        "JOIN cameras c ON c.id = z.camera_id ORDER BY c.name, z.name"
    ).fetchall()
    return {
        "zones": [
            {"id": str(row[0]), "camera": row[1], "name": row[2], "polygon": row[3]}
            for row in rows
        ]
    }


@app.get("/api/tracks")
def tracks_in_window(
    camera: str = Query(..., description="camera name"),
    zone: str | None = Query(None, description="zone name"),
    from_: str = Query(..., alias="from", description="window start (ISO-8601)"),
    to: str = Query(..., description="window end (ISO-8601)"),
) -> dict:
    """Stage 5 reconstruction: tracks active in a camera/zone between two times.

    Zone membership intervals come from the `events` table (entered_zone rows
    closed by a left_zone update); pass no `zone` to get everything in the
    window. Interval overlap uses ``tstzrange &&``.
    """
    conn = _require_db()
    start, end = _dt(from_), _dt(to)
    params: list = []
    where = "e.event_type = 'entered_zone' AND c.name = %s AND tstzrange(e.started_at, e.ended_at) && tstzrange(%s, %s)"
    params += [camera, start, end]
    if zone:
        where += " AND z.name = %s"
        params.append(zone)
    rows = conn.cursor().execute(
        f"SELECT c.name, z.name, t.global_track_id, t.class_name, e.started_at, e.ended_at, "
        f"t.last_box, t.peak_confidence "
        f"FROM events e JOIN tracks t ON t.id = e.track_id "
        f"JOIN cameras c ON c.id = e.camera_id "
        f"LEFT JOIN zones z ON z.id = e.zone_id "
        f"WHERE {where} ORDER BY e.started_at",
        params,
    ).fetchall()
    return {
        "window": {"from": start, "to": end},
        "tracks": [
            {
                "camera": row[0],
                "zone": row[1],
                "global_track_id": row[2],
                "class_name": row[3],
                "entered_at": row[4],
                "left_at": row[5],
                "last_box": row[6],
                "peak_confidence": row[7],
            }
            for row in rows
        ],
    }


@app.get("/api/events")
def list_events(
    camera: str | None = Query(None),
    since: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
) -> dict:
    conn = _require_db()
    params: list = []
    where = "1=1"
    if camera:
        where += " AND c.name = %s"
        params.append(camera)
    if since:
        where += " AND e.started_at >= %s"
        params.append(_dt(since))
    rows = conn.cursor().execute(
        f"SELECT c.name, z.name, t.global_track_id, e.event_type, e.started_at, e.ended_at, e.severity "
        f"FROM events e JOIN cameras c ON c.id = e.camera_id "
        f"LEFT JOIN zones z ON z.id = e.zone_id "
        f"LEFT JOIN tracks t ON t.id = e.track_id "
        f"WHERE {where} ORDER BY e.started_at DESC LIMIT %s",
        [*params, limit],
    ).fetchall()
    return {
        "events": [
            {
                "camera": row[0],
                "zone": row[1],
                "global_track_id": row[2],
                "event_type": row[3],
                "started_at": row[4],
                "ended_at": row[5],
                "severity": row[6],
            }
            for row in rows
        ]
    }


# --------------------------------------------------------------------------- #
# Stage 7 — semantic search endpoints
# --------------------------------------------------------------------------- #


def _catalogs() -> nl.Catalogs:
    conn = get_conn()
    cameras, zones = [], []
    if conn is not None:
        cameras = [row[0] for row in conn.cursor().execute("SELECT name FROM cameras ORDER BY name")]
        zones = [row[0] for row in conn.cursor().execute("SELECT name FROM zones ORDER BY name")]
    return nl.Catalogs(cameras=cameras, zones=zones, labels=list(search.COCO80))


@app.get("/api/search")
def semantic_search(
    q: str | None = Query(None, description="NL query; parsed into structured filters + semantic text"),
    camera: str | None = Query(None),
    zone: str | None = Query(None),
    label: str | None = Query(None),
    event: str | None = Query(None),
    from_: str | None = Query(None, alias="from", description="ISO-8601 window start"),
    to: str | None = Query(None, description="ISO-8601 window end"),
    similar: str | None = Query(None, description="embedding id to find similar thumbnails to"),
    sort: str = Query("relevance", pattern="^(relevance|date)$", description="relevance (KNN) or date (newest first)"),
    limit: int = Query(24, ge=1, le=200),
) -> dict:
    """Apply structured filters first, then pgvector KNN inside that set.

    Query text is embedded by the perception container's CLIP RPC when a
    semantic remainder exists; without one (or when the RPC is down) results
    fall back to the newest embeddings in the filtered set.
    """
    conn = _require_db()
    cats = _catalogs()
    parsed = nl.parse_nl(q, cats) if q else None

    if similar:
        results = search.search_embeddings(
            conn,
            camera=camera,
            zone=zone,
            label=label,
            event_type=event,
            time_from=_dt(from_) if from_ else None,
            time_to=_dt(to) if to else None,
            similar_id=similar,
            sort=sort,
            limit=limit,
        )
        semantic = True
    else:
        camera = camera or (parsed.camera if parsed else None)
        zone = zone or (parsed.zone if parsed else None)
        label = label or (parsed.label if parsed else None)
        event = event or (parsed.event_type if parsed else None)
        t_from = _dt(from_) if from_ else (parsed.time_from if parsed else None)
        t_to = _dt(to) if to else (parsed.time_to if parsed else None)
        query_vector = None
        if parsed and parsed.semantic_text:
            query_vector = search.embed_query_text(parsed.semantic_text)
        results = search.search_embeddings(
            conn,
            camera=camera,
            zone=zone,
            label=label,
            event_type=event,
            time_from=t_from,
            time_to=t_to,
            query_vector=query_vector,
            sort=sort,
            limit=limit,
        )
        semantic = query_vector is not None

    return {
        "query": q or "",
        "semantic": semantic,
        "filters": (parsed.json() if parsed else {}) | {
            "camera": camera,
            "zone": zone,
            "label": label,
            "event": event,
        },
        "results": results["results"],
        "count": results["count"],
    }


@app.get("/api/explore/summary")
def explore_summary() -> dict:
    """Label -> embedding counts for the Explore landing grid."""
    conn = _require_db()
    return search.summary(conn)