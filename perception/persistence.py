"""Stage 5 persistence — async Postgres writer for the perception hot path.

The pipeline must never block on the database: ``process()`` paths only encode
lightweight op records onto a bounded queue, and a single background consumer
thread owns the connection and executes them in FIFO order (per-op insert,
retry-once on connection loss, drop-with-warning under sustained outage so a
down DB can never wedge a 24/7 camera feed).

Everything here is deferred-imported behind psycopg, so hosts/tests without the
``db`` extra stay importable. Ids are deterministic uuid5 values derived from
camera/zone/track names so upserts need no lookups and are conflict-free.
"""
from __future__ import annotations

import logging
import queue
import threading
import uuid
from typing import Any, Callable

logger = logging.getLogger("aina.persistence")

AINA_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "aina-sentinel.hypotenuse.ai")

DETECTION_BATCH = 200
RECONNECT_RETRIES = 3
COMMIT_EVERY = 200  # statements per commit; keeps raw per-track upserts off the commit hot path
_MANY = "__executemany__"


def camera_id(name: str) -> uuid.UUID:
    return uuid.uuid5(AINA_NAMESPACE, f"camera:{name}")


def zone_id(camera: str, zone: str) -> uuid.UUID:
    return uuid.uuid5(AINA_NAMESPACE, f"zone:{camera}:{zone}")


def track_uuid(camera: str, global_track_id: int) -> uuid.UUID:
    return uuid.uuid5(AINA_NAMESPACE, f"track:{camera}:{global_track_id}")


def event_id(camera: str, zone: str, global_track_id: int, started_ts: float) -> uuid.UUID:
    return uuid.uuid5(AINA_NAMESPACE, f"enter:{camera}:{zone}:{global_track_id}:{started_ts:.6f}")


def behavior_event_id(event_type: str, camera: str, zone: str | None, global_track_id: int, started_ts: float) -> uuid.UUID:
    """Deterministic uuid for a behavior-module event row.

    Includes ``event_type`` so loitering/tailgating/etc. never collide with the
    ``entered_zone`` rows that ``event_id()`` names, and so replaying the same
    episode is an idempotent no-op (INSERT ... ON CONFLICT DO NOTHING).
    """
    return uuid.uuid5(AINA_NAMESPACE, f"event:{event_type}:{camera}:{zone}:{global_track_id}:{started_ts:.6f}")


def embedding_id(camera: str, global_track_id: int, model: str, captured_ts: float) -> uuid.UUID:
    """Deterministic uuid for an embeddings row.

    Keyed on the named model + capture timestamp so re-encoding the same crop is
    an idempotent no-op and a track re-embedded at a later moment is a new row
    (same pair of objects can meaningfully have several embeddings over time).
    """
    return uuid.uuid5(AINA_NAMESPACE, f"embed:{camera}:{global_track_id}:{model}:{captured_ts:.6f}")


def segment_id(camera: str, global_track_id: int, started_ts: float) -> uuid.UUID:
    """Deterministic uuid for a ``segments`` row.

    Keyed on camera + global_track_id + the track's first-seen time so each
    finalized track lifecycle maps to exactly one review segment, and replaying
    the same window is an idempotent INSERT ... ON CONFLICT DO NOTHING.
    """
    return uuid.uuid5(AINA_NAMESPACE, f"segment:{camera}:{global_track_id}:{started_ts:.6f}")


class _Ops:
    """SQL templates; each submitted op is a dict keyed by these op names."""

    UPSERT_CAMERA = (
        "INSERT INTO cameras (id, name, source, enabled, want_fps) VALUES (%s, %s, %s, %s, %s) "
        "ON CONFLICT (name) DO UPDATE SET source = EXCLUDED.source, "
        "enabled = EXCLUDED.enabled, want_fps = EXCLUDED.want_fps"
    )
    UPSERT_ZONE = (
        "INSERT INTO zones (id, camera_id, name, polygon, enabled) VALUES (%s, %s, %s, %s::jsonb, true) "
        "ON CONFLICT (camera_id, name) DO UPDATE SET polygon = EXCLUDED.polygon, enabled = true"
    )
    UPSERT_TRACK = (
        "INSERT INTO tracks (id, camera_id, global_track_id, tracker_backend, class_id, class_name, "
        "first_seen_at, last_seen_at, frames_seen, coasted_frames, peak_confidence, last_box) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb) "
        "ON CONFLICT (camera_id, global_track_id) DO UPDATE SET "
        "last_seen_at = EXCLUDED.last_seen_at, "
        "frames_seen = tracks.frames_seen + EXCLUDED.frames_seen, "
        "coasted_frames = tracks.coasted_frames + EXCLUDED.coasted_frames, "
        "peak_confidence = GREATEST(tracks.peak_confidence, EXCLUDED.peak_confidence), "
        "last_box = EXCLUDED.last_box, class_name = EXCLUDED.class_name, ended_at = NULL"
    )
    FINALIZE_TRACK = "UPDATE tracks SET ended_at = %s WHERE id = %s AND ended_at IS NULL"
    INSERT_DETECTION = (
        "INSERT INTO detections (camera_id, track_id, ts, frame_idx, x1, y1, x2, y2, "
        "confidence, class_id, class_name) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
    )
    ENTER_ZONE = (
        "INSERT INTO events (id, camera_id, track_id, zone_id, event_type, started_at, severity, data) "
        "VALUES (%s, %s, %s, %s, 'entered_zone', %s, 'detection', %s::jsonb) ON CONFLICT DO NOTHING"
    )
    END_ZONE = (
        "UPDATE events SET ended_at = %s "
        "WHERE track_id = %s AND zone_id = %s AND event_type = 'entered_zone' AND ended_at IS NULL"
    )
    SELECT_EVENT_OPEN = (
        "SELECT ended_at IS NULL FROM events WHERE track_id = %s AND zone_id = %s "
        "AND event_type = 'entered_zone' AND ended_at IS NULL LIMIT 1"
    )
    INSERT_EVENT = (
        "INSERT INTO events (id, camera_id, track_id, zone_id, event_type, started_at, severity, data) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb) ON CONFLICT DO NOTHING"
    )
    END_EVENT = (
        "UPDATE events SET ended_at = %s "
        "WHERE track_id = %s AND event_type = %s AND ended_at IS NULL"
    )
    INSERT_EMBEDDING = (
        "INSERT INTO embeddings (id, track_id, model, vector, meta) "
        "VALUES (%s, %s, %s, %s::vector, %s::jsonb) ON CONFLICT DO NOTHING"
    )
    INSERT_SEGMENT = (
        "INSERT INTO segments (id, camera_id, started_at, ended_at, labels, severity, thumbnail) "
        "VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s::jsonb) ON CONFLICT DO NOTHING"
    )


class DatabaseWriter:
    """Async, lossy-but-safe Postgres writer used by the persistence module.

    ``submit(op_record, cursor=...)`` is never blocking and never raises while
    the DB is down. Op order is preserved per submission sequence (FIFO queue,
    single consumer), which keeps enter/leave zone ordering correct.
    """

    def __init__(
        self,
        connect: Callable[[], Any],
        max_queue: int = 20_000,
        connect_timeout: float = 5.0,
    ) -> None:
        self._connect = connect
        self._max_queue = max_queue
        self._connect_timeout = connect_timeout
        self._queue: queue.Queue = queue.Queue(maxsize=max_queue)
        self._stop = threading.Event()
        self._conn: Any = None
        self._thread: threading.Thread | None = None
        self.dropped = 0
        self.written = 0

    # -- lifecycle ------------------------------------------------------ #
    def start(self) -> None:
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="aina-persistence", daemon=True)
        self._thread.start()

    def stop(self, flush_timeout: float = 10.0) -> None:
        if self._thread is None:
            return
        self.submit({"op": "_flush"})
        self._stop.set()
        self._thread.join(timeout=flush_timeout)
        self._thread = None
        self._close_conn()

    # -- submission ----------------------------------------------------- #
    def submit(self, op: dict[str, Any]) -> None:
        try:
            self._queue.put_nowait(op)
        except queue.Full:
            self.dropped += 1
            if self.dropped % 1000 == 1:
                logger.warning("persistence queue full — dropped %d ops", self.dropped)

    # -- consumer ------------------------------------------------------- #
    def _run(self) -> None:
        """Single-ordering consumer.

        Ops that back the hot path (``upsert_track`` ~1/frame/track) are held in
        one ordered transaction and committed every ``COMMIT_EVERY`` statements,
        so a 24/7 feed (~500 track-mutations/sec) degrades to a few commits/sec
        instead of per-op round trips. Statement order inside a transaction is
        preserved, which keeps enter(a)..end(a) and track-before-event correct.
        """
        pending: list[Any] = []

        def flush() -> None:
            if pending:
                self._commit_ordered(pending)
                pending.clear()

        while True:
            try:
                item = self._queue.get(timeout=0.5)
            except queue.Empty:
                flush()
                if self._stop.is_set() and self._queue.empty():
                    break
                continue

            if item["op"] == "_flush":
                flush()
                continue
            if item["op"] == "insert_detection":
                pending.append((_MANY, _Ops.INSERT_DETECTION, [_detection_row(item)]))
            else:
                sql = _sql_for(item)
                if sql is None:
                    continue
                pending.append((sql, _params_for(item)))
            if len(pending) >= COMMIT_EVERY:
                flush()

    def _commit_ordered(self, pending: list[Any]) -> None:
        conn = self._ensure_conn()
        count = _pending_count(pending)
        if conn is None:
            self.dropped += count
            logger.warning("persistence: %d ops dropped (no db)", count)
            return
        try:
            with conn.cursor() as cur:
                for item in pending:
                    if item[0] == _MANY:
                        _, sql, rows = item
                        cur.executemany(sql, rows)
                    else:
                        sql, params = item
                        cur.execute(sql, params)
            conn.commit()
            self.written += count
        except Exception as exc:  # noqa: BLE001 - db is a moving part, never crash the thread
            self._drop(exc, count)

    def _flush(self, batch: list[dict[str, Any]]) -> None:
        if not batch:
            return
        self._commit_ordered([(_MANY, _Ops.INSERT_DETECTION, [_detection_row(op) for op in batch])])

    def _drop(self, exc: Exception, n: int) -> None:
        self.dropped += n
        if self.dropped % 500 == 1:
            logger.warning("persistence write failed (%s) — dropped %d ops total", exc, self.dropped)
        self._close_conn()

    def _ensure_conn(self) -> Any:
        if self._conn is not None:
            return self._conn
        for attempt in range(RECONNECT_RETRIES):
            try:
                self._conn = self._connect()
                return self._conn
            except Exception as exc:  # noqa: BLE001
                if attempt == 0:
                    logger.warning("persistence connect failed (%s) — retrying", exc)
        return None

    def _close_conn(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:  # noqa: BLE001
                pass
            self._conn = None


def _pending_count(pending: list[Any]) -> int:
    return sum(len(item[2]) if item[0] == _MANY else 1 for item in pending)


def _detection_row(op: dict[str, Any]) -> tuple[Any, ...]:
    return (
        op["camera_uid"],
        op.get("track_uid"),
        op["ts"],
        op["frame_idx"],
        op["x1"],
        op["y1"],
        op["x2"],
        op["y2"],
        op["confidence"],
        op["class_id"],
        op.get("class_name", ""),
    )


def _sql_for(op: dict[str, Any]) -> str | None:
    return {
        "upsert_camera": _Ops.UPSERT_CAMERA,
        "upsert_zone": _Ops.UPSERT_ZONE,
        "upsert_track": _Ops.UPSERT_TRACK,
        "finalize_track": _Ops.FINALIZE_TRACK,
        "insert_detection": _Ops.INSERT_DETECTION,
        "enter_zone": _Ops.ENTER_ZONE,
        "end_zone": _Ops.END_ZONE,
        "insert_event": _Ops.INSERT_EVENT,
        "end_event": _Ops.END_EVENT,
        "insert_embedding": _Ops.INSERT_EMBEDDING,
        "insert_segment": _Ops.INSERT_SEGMENT,
    }.get(op["op"])


def _params_for(op: dict[str, Any]) -> tuple[Any, ...]:
    kind = op["op"]
    if kind == "upsert_camera":
        return (op["camera_uid"], op["name"], op.get("source", ""), True, op.get("want_fps", 0.0))
    if kind == "upsert_zone":
        return (op["zone_uid"], op["camera_uid"], op["name"], json_dumps(op["polygon"]))
    if kind == "upsert_track":
        return (
            op["track_uid"],
            op["camera_uid"],
            op["global_track_id"],
            op.get("tracker_backend", "bytetrack"),
            op["class_id"],
            op.get("class_name", ""),
            op["first_seen"],
            op["last_seen"],
            op.get("frames_delta", 1),
            op.get("coasted_delta", 0),
            op["peak_confidence"],
            json_dumps(op["last_box"]),
        )
    if kind == "finalize_track":
        return (op["ended_at"], op["track_uid"])
    if kind == "enter_zone":
        return (
            op["event_uid"],
            op["camera_uid"],
            op["track_uid"],
            op["zone_uid"],
            op["started_at"],
            json_dumps(op.get("data", {})),
        )
    if kind == "end_zone":
        return (op["ended_at"], op["track_uid"], op["zone_uid"])
    if kind == "insert_event":
        return (
            op["event_uid"],
            op["camera_uid"],
            op.get("track_uid"),
            op.get("zone_uid"),
            op["event_type"],
            op["started_at"],
            op.get("severity", "detection"),
            json_dumps(op.get("data", {})),
        )
    if kind == "end_event":
        return (op["ended_at"], op["track_uid"], op["event_type"])
    if kind == "insert_embedding":
        return (
            op["embedding_uid"],
            op.get("track_uid"),
            op["model"],
            _vector_str(op["vector"]),
            json_dumps(op.get("meta", {})),
        )
    if kind == "insert_segment":
        return (
            op["segment_uid"],
            op["camera_uid"],
            op["started_at"],
            op["ended_at"],
            json_dumps(op["labels"]),
            op.get("severity", "detection"),
            json_dumps({"b64": op["thumbnail"]}) if op.get("thumbnail") else json_dumps({}),
        )
    raise ValueError(f"persistence op {kind!r} has no params mapping")


def _vector_str(vector: Any) -> str:
    """psycopg adapts a Python str fine; pgvector parses '[v0, v1, ...]'."""
    return "[{}]".format(",".join(f"{float(v):.6f}" for v in vector))


def json_dumps(value: Any) -> str:
    import json

    return json.dumps(value)