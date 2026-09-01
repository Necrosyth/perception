"""Surveillance Intelligence Lab API — Stage 5 data layer.

Boots the Postgres schema (``platform/migrations``) on startup and serves the
catalog + the Stage-5 reconstruction query: "which tracks were active in zone X
between time A and B" (``GET /api/tracks?zone=&from=&to=``). Health reports DB
reachability; a down database degrades scores rather than failing the API.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Body, FastAPI, HTTPException, Query

import db
import nl
import search

APP_NAME = "Surveillance Intelligence Lab"
APP_VERSION = "0.1.0-alpha"

logger = logging.getLogger("aina.api")

_CONN = None
_CONN_LOCK = threading.Lock()


def get_conn():
    """Long-lived connection with automatic reset; None until first use.

    Single shared psycopg connection serialized through a lock — safe for
    FastAPI's threadpool but still a single DB session by design.
    """
    global _CONN
    with _CONN_LOCK:
        try:
            if _CONN is None:
                _CONN = db.connect()
            cur = _CONN.cursor()
            try:
                cur.execute("SELECT 1")
            finally:
                cur.close()
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
# Stage 5 — review segments, zones CRUD, system, notifications
# --------------------------------------------------------------------------- #


def _seg_label(labels) -> str:
    parsed = _seg_labels(labels)
    return parsed[0] if parsed else "detection"


def _seg_labels(labels) -> list[str]:
    return labels if isinstance(labels, list) else json.loads(labels or "[]")


def _seg_thumbnail(thumb) -> str | None:
    if not thumb:
        return None
    if isinstance(thumb, str):
        data = json.loads(thumb or "{}")
    else:
        data = thumb
    b64 = data.get("b64")
    if b64:
        return "data:image/jpeg;base64," + b64
    return None


@app.get("/api/segments")
def list_segments(
    camera: str | None = Query(None),
    label: str | None = Query(None),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    reviewed: bool | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
) -> dict:
    """Real review segments written by perception (one per finalized track)."""
    conn = _require_db()
    params: list = []
    where = "1=1"
    if camera:
        where += " AND c.name = %s"
        params.append(camera)
    if from_:
        where += " AND s.ended_at >= %s"
        params.append(_dt(from_))
    if to:
        where += " AND s.started_at <= %s"
        params.append(_dt(to))
    if reviewed is not None:
        where += f" AND s.reviewed = {'true' if reviewed else 'false'}"
    if label:
        where += " AND lower(s.labels::text) LIKE %s"
        params.append(f"%{label.lower()}%")
    rows = conn.cursor().execute(
        f"SELECT s.id, c.name, c.id, s.started_at, s.ended_at, s.labels, s.severity, s.reviewed, s.thumbnail "
        f"FROM segments s JOIN cameras c ON c.id = s.camera_id "
        f"WHERE {where} ORDER BY s.started_at DESC LIMIT %s",
        [*params, limit],
    ).fetchall()
    return {
        "segments": [
            {
                "id": str(r[0]),
                "camera": r[1],
                "camera_id": str(r[2]),
                "label": _seg_label(r[5]),
                "labels": _seg_labels(r[5]),
                "started_at": r[3],
                "ended_at": r[4],
                "severity": r[6],
                "reviewed": r[7],
                "thumbnail": _seg_thumbnail(r[8]),
            }
            for r in rows
        ]
    }


@app.get("/api/segments/{segment_id}")
def get_segment(segment_id: str) -> dict:
    conn = _require_db()
    row = conn.cursor().execute(
        "SELECT s.id, c.name, c.id, s.started_at, s.ended_at, s.labels, s.severity, s.reviewed, s.thumbnail "
        "FROM segments s JOIN cameras c ON c.id = s.camera_id WHERE s.id = %s::uuid",
        [segment_id],
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="segment not found")
    return {
        "segments": [
            {
                "id": str(row[0]),
                "camera": row[1],
                "camera_id": str(row[2]),
                "label": _seg_label(row[5]),
                "labels": _seg_label(row[5]),
                "started_at": row[3],
                "ended_at": row[4],
                "severity": row[6],
                "reviewed": row[7],
                "thumbnail": _seg_thumbnail(row[8]),
            }
        ]
    }


@app.get("/api/segments/{segment_id}/play")
def play_segment(segment_id: str) -> dict:
    """Resolve the real recorded clip covering a review segment.

    Returns the mp4 source URL (relative) for the dashboard <video> tile and a
    recordings directory listing. Recordings are written continuously by the
    `recorder` service into /recordings/<camera>/ (shared volume, also mounted
    read-only here so this endpoint can enumerate the clips that overlap the
    segment's time window).
    """
    conn = _require_db()
    row = conn.cursor().execute(
        "SELECT c.name, s.started_at, s.ended_at FROM segments s "
        "JOIN cameras c ON c.id = s.camera_id WHERE s.id = %s::uuid",
        [segment_id],
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="segment not found")
    camera, start, end = row
    return {
        "segment_id": segment_id,
        "camera": camera,
        "started_at": start,
        "ended_at": end,
        "recording_dir": f"/recordings/{camera}/",
        "recordings": list_recordings(camera),
        "live_url": f"/media/api/stream.mp4?src={camera}",
    }


def list_recordings(camera: str) -> list[str]:
    """Return /recordings/<camera>/*.mp4 URLs (newest first) for the browser."""
    base = os.environ.get("RECORDING_DIR", "/recordings")
    cam_dir = os.path.join(base, camera)
    try:
        files = [(f, os.path.getmtime(os.path.join(cam_dir, f))) for f in os.listdir(cam_dir) if f.endswith(".mp4")]
    except OSError:
        return []
    files.sort(key=lambda p: p[1], reverse=True)
    return [f"/recordings/{camera}/{f}" for f, _ in files]


@app.post("/api/segments/{segment_id}/reviewed")
def mark_reviewed(segment_id: str, reviewed: bool = Query(True)) -> dict:
    conn = _require_db()
    cur = conn.cursor()
    cur.execute("UPDATE segments SET reviewed = %s WHERE id = %s::uuid", [reviewed, segment_id])
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="segment not found")
    return {"id": segment_id, "reviewed": reviewed}


@app.get("/api/cameras/{camera_id}")
def get_camera(camera_id: str) -> dict:
    conn = _require_db()
    row = conn.cursor().execute(
        "SELECT id, name, source, enabled, want_fps FROM cameras WHERE id = %s::uuid",
        [camera_id],
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="camera not found")
    return {
        "cameras": [
            {
                "id": str(row[0]),
                "name": row[1],
                "source": row[2],
                "enabled": row[3],
                "want_fps": row[4],
            }
        ]
    }


@app.post("/api/zones")
def create_zone(
    camera: str = Body(...), name: str = Body(...), polygon: list = Body(...)
) -> dict:
    """Persist a new zone polygon for a camera (same identity scheme as
    perception: zone ids are stable uuid5 values, so a resend is an upsert)."""
    conn = _require_db()
    row = conn.cursor().execute(
        "SELECT id FROM cameras WHERE name = %s", [camera]
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="camera not found")
    camera_uid = row[0]

    # ensure the zone id matches perception's identity (uuid5 namespace)
    import uuid

    AINA_NS = uuid.uuid5(uuid.NAMESPACE_DNS, "aina-sentinel.hypotenuse.ai")
    zone_uid = uuid.uuid5(AINA_NS, f"zone:{camera}:{name}")
    conn.cursor().execute(
        "INSERT INTO zones (id, camera_id, name, polygon, enabled) VALUES (%s, %s, %s, %s::jsonb, true) "
        "ON CONFLICT (camera_id, name) DO UPDATE SET polygon = EXCLUDED.polygon, enabled = true",
        [str(zone_uid), str(camera_uid), name, json.dumps(polygon)],
    )
    return {"id": str(zone_uid), "camera": camera, "name": name}


@app.delete("/api/zones/{zone_id}")
def delete_zone(zone_id: str) -> dict:
    conn = _require_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM zones WHERE id = %s::uuid", [zone_id])
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="zone not found")
    return {"deleted": True}


@app.put("/api/zones/{zone_id}")
def update_zone(
    zone_id: str,
    polygon: list = Body(default=None),
    camera: str | None = Body(default=None),
    name: str | None = Body(default=None),
) -> dict:
    conn = _require_db()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM zones WHERE id = %s::uuid", [zone_id])
    if cur.fetchone() is None:
        raise HTTPException(status_code=404, detail="zone not found")

    # revisit camera: its name becomes part of the zone's stable id, so resolve
    # the new camera and rewrite id + camera_id together on a reassignment.
    if camera is not None:
        crow = conn.cursor().execute(
            "SELECT id FROM cameras WHERE name = %s", [camera]
        ).fetchone()
        if crow is None:
            raise HTTPException(status_code=404, detail="camera not found")
        import uuid

        AINA_NS = uuid.uuid5(uuid.NAMESPACE_DNS, "aina-sentinel.hypotenuse.ai")
        cur.execute(
            "UPDATE zones SET id = %s, camera_id = %s WHERE id = %s::uuid",
            [str(uuid.uuid5(AINA_NS, f"zone:{camera}:{name or 'zone'}")), str(crow[0]), zone_id],
        )
    if polygon:
        cur.execute("UPDATE zones SET polygon = %s::jsonb WHERE id = %s::uuid", [json.dumps(polygon), zone_id])
    if name:
        cur.execute("UPDATE zones SET name = %s WHERE id = %s::uuid", [name, zone_id])
    return {"id": zone_id}


@app.get("/api/system")
def system_summary() -> dict:
    """Real system snapshot from the running deployment (best-effort)."""
    conn = get_conn()
    out: dict = {
        "camera_count": 0,
        "track_count": 0,
        "detection_count": 0,
        "event_count": 0,
        "segment_count": 0,
        "embedding_count": 0,
        "zones": [],
        "perception_rpc": rpc_status(),
    }
    if conn is not None:
        for key, sql in (
            ("camera_count", "SELECT count(*) FROM cameras"),
            ("track_count", "SELECT count(*) FROM tracks"),
            ("detection_count", "SELECT count(*) FROM detections"),
            ("event_count", "SELECT count(*) FROM events"),
            ("segment_count", "SELECT count(*) FROM segments"),
            ("embedding_count", "SELECT count(*) FROM embeddings"),
        ):
            row = conn.cursor().execute(sql).fetchone()
            out[key] = int(row[0]) if row else 0
        out["zones"] = [row[0] for row in conn.cursor().execute("SELECT z.name FROM zones z ORDER BY z.name")]
    return out


def rpc_status() -> bool:
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(search.RPC_URL + "/ping", timeout=2.0):
            return True
    except (urllib.error.URLError, TimeoutError):
        return False


@app.get("/api/notifications")
def list_notifications(limit: int = Query(20, ge=1, le=100)) -> dict:
    """Recent alert-worthy activity derived from real zone events."""
    conn = _require_db()
    rows = conn.cursor().execute(
        "SELECT c.name, z.name, e.event_type, e.started_at, e.severity "
        "FROM events e JOIN cameras c ON c.id = e.camera_id "
        "LEFT JOIN zones z ON z.id = e.zone_id "
        "WHERE e.event_type IN ('entered_zone','left_zone') "
        "ORDER BY e.started_at DESC LIMIT %s",
        [limit],
    ).fetchall()
    return {
        "notifications": [
            {
                "camera": r[0],
                "zone": r[1],
                "event_type": r[2],
                "started_at": r[3],
                "severity": r[4],
            }
            for r in rows
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