"""Stage 5 persistence module tests — pure logic, no database.

The sink's contract (upsert tracks, sample detections, emit zone enter/leave
events, finalize stale tracks) is asserted against a recording fake writer.
DatabaseWriter's op->params mapping and uuid determinism are also unit-tested;
the actual Postgres is exercised by the integration/bench path, not here.
"""
from __future__ import annotations

import pytest

from perception.modules.base import CAP, Frame
from perception.modules.embeddings import SemanticEmbeddings
from perception.modules.persistence import Persistence
from perception.modules.tracking import Track, Tracks
from perception.persistence import (
    DatabaseWriter,
    behavior_event_id,
    camera_id,
    embedding_id,
    event_id,
    track_uuid,
    zone_id,
)


class FakeWriter:
    def __init__(self, ops: list[dict]) -> None:
        self.ops: list[dict] = ops

    def start(self) -> None:
        pass

    def stop(self, flush_timeout: float = 10.0) -> None:
        pass

    def submit(self, op: dict) -> None:
        self.ops.append(op)


def zone_key() -> str:
    return CAP["zone_membership"].key


def _detection(value):
    class Marker:
        def __init__(self, data) -> None:
            self.data = data

    return Marker(value)


def _detections(class_names: dict | None = None):
    return [_detection({"class_names": class_names or {}})]


def _track(source="loading_dock", gid=1, class_id=0, conf=0.9, coasted=False, ts=1000.0, box=(0, 0, 10, 20)):
    return Track(
        track_id=gid,
        source=source,
        class_id=class_id,
        confidence=conf,
        xyxy=box,
        raw_xyxy=None if coasted else box,
        lost_count=0 if not coasted else 1,
        age_frames=1,
        coasted=coasted,
        last_frame_idx=1,
        last_timestamp=ts,
    )


def _membership(source, gid, zones):
    return {"memberships": {(source, gid): sorted(zones)}}


def _make_module(fake: FakeWriter) -> Persistence:
    module = Persistence()
    module._writer = fake
    module._camera_uid = {"loading_dock": camera_id("loading_dock")}
    module.configure({"detection_sampling": 1, "finalize_timeout_s": 5.0, "database": {"host": "test"}})
    return module


def _frame(idx=1, ts=1000.0) -> Frame:
    return Frame(source="loading_dock", frame_id=idx, timestamp=ts)


def _tracks(*tracks: Track, frame_idx=1) -> Tracks:
    return Tracks(tracks=list(tracks), frame_idx=frame_idx, timestamp=1000.0)


def _payload(*tracks: Track, zones=(1, []), frame_idx=1) -> dict:
    gid, zone_names = zones
    return {
        "detections": _detections(),
        "tracks": [_tracks(*tracks, frame_idx=frame_idx)],
        zone_key(): [_membership("loading_dock", gid, zone_names)],
    }


class TestModuleLogic:
    def _camera_defs(self):
        return [
            {
                "name": "loading_dock",
                "source": "/srv/video/sample.mp4",
                "want_fps": 10.0,
                "zones": [{"name": "dock_entry", "polygon": [[0, 550], [400, 550], [400, 720]]}],
            }
        ]

    def test_start_upserts_cameras_and_zones(self, monkeypatch):
        ops: list[dict] = []
        factory = lambda *a, **k: FakeWriter(ops)  # noqa: E731
        monkeypatch.setattr("perception.modules.persistence.DatabaseWriter", factory)

        module = Persistence()
        module.configure(
            {
                "detection_sampling": 1,
                "finalize_timeout_s": 5.0,
                "database": {"host": "test"},
                "_camera_defs": self._camera_defs(),
            }
        )
        module.start()

        kinds = [op["op"] for op in ops]
        assert kinds == ["upsert_camera", "upsert_zone"]
        assert ops[0]["name"] == "loading_dock"
        assert ops[0]["want_fps"] == 10.0
        assert ops[1]["name"] == "dock_entry"
        assert ops[1]["zone_uid"] == zone_id("loading_dock", "dock_entry")

    def test_unknown_camera_ignored(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))
        frame = Frame(source="other_cam", frame_id=1, timestamp=1000.0)
        module.process(
            frame,
            {
                "detections": _detections(),
                "tracks": [_tracks(_track(source="other_cam", gid=1))],
                zone_key(): [_membership("other_cam", 1, [])],
            },
        )
        assert ops == []

    def test_process_upserts_track_and_inserts_detection(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))
        dets = _detections({0: "person"})
        module.process(
            _frame(),
            {
                "detections": dets,
                "tracks": [_tracks(_track(gid=1, class_id=0, conf=0.9, box=(0, 0, 10, 20)))],
                zone_key(): [_membership("loading_dock", 1, [])],
            },
        )

        kinds = [op["op"] for op in ops]
        assert kinds.count("upsert_track") == 1
        assert kinds.count("insert_detection") == 1
        det = next(op for op in ops if op["op"] == "insert_detection")
        assert det["track_uid"] == track_uuid("loading_dock", 1)
        assert det["class_name"] == "person"
        assert det["frame_idx"] == 1
        up = next(op for op in ops if op["op"] == "upsert_track")
        assert up["class_name"] == "person"
        assert up["frames_delta"] == 1
        assert up["coasted_delta"] == 0

    def test_coasted_track_no_detection_row(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))
        module.process(_frame(), _payload(_track(gid=1, coasted=True)))

        kinds = [op["op"] for op in ops]
        assert "insert_detection" not in kinds
        up = next(op for op in ops if op["op"] == "upsert_track")
        assert up["frames_delta"] == 0
        assert up["coasted_delta"] == 1

    def test_tracker_backend_flows_from_config(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))
        # default (no injection) stays bytetrack
        module.process(_frame(), _payload(_track(gid=1)))
        assert next(op for op in ops if op["op"] == "upsert_track")["tracker_backend"] == "bytetrack"

        ops.clear()
        module.configure({"_tracking_backend": "iou"})
        module.process(_frame(), _payload(_track(gid=1)))
        assert next(op for op in ops if op["op"] == "upsert_track")["tracker_backend"] == "iou"

    def test_detection_sampling(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))
        module._sampling = 2
        for idx in (1, 2, 3, 4):
            module.process(
                _frame(idx=idx),
                _payload(_track(gid=1, box=(0, 0, 10, 20)), zones=(1, []), frame_idx=idx),
            )
        dets = [op for op in ops if op["op"] == "insert_detection"]
        assert [d["frame_idx"] for d in dets] == [2, 4]

    def test_enter_and_leave_zone_events(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))

        module.process(_frame(ts=1000.0), _payload(_track(gid=1), zones=(1, ["dock_entry"])))
        module.process(_frame(ts=1010.0), _payload(_track(gid=1), zones=(1, [])))

        kinds = [op["op"] for op in ops]
        assert kinds.count("enter_zone") == 1
        assert kinds.count("end_zone") == 1
        enter = next(op for op in ops if op["op"] == "enter_zone")
        assert enter["zone_uid"] == zone_id("loading_dock", "dock_entry")
        assert enter["track_uid"] == track_uuid("loading_dock", 1)
        # timestamps come from the frame, not wall-clock persist time
        assert enter["started_at"].timestamp() == 1000.0
        end = next(op for op in ops if op["op"] == "end_zone")
        assert end["zone_uid"] == zone_id("loading_dock", "dock_entry")
        assert end["ended_at"].timestamp() == 1010.0

    def test_track_finalized_after_timeout(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))

        module.process(_frame(ts=1000.0), _payload(_track(gid=1, ts=1000.0), zones=(1, [])))
        module.process(_frame(ts=1006.0), _payload(zones=(9, [])), )  # single trailing comma

        finals = [op for op in ops if op["op"] == "finalize_track"]
        assert len(finals) == 1
        assert finals[0]["track_uid"] == track_uuid("loading_dock", 1)
        assert finals[0]["ended_at"].timestamp() == 1006.0

    def test_behavior_event_rows_are_sunk(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))
        module.configure({"_behavior_events": ["behavior_loitering"]})

        rows = [
            {
                "camera": "loading_dock",
                "track_id": 1,
                "zone": "dock_entry",
                "event_type": "loitering",
                "started_at": 1000.0,
                "ended_at": None,
                "severity": "alert",
                "data": {"dwell_seconds": 5.0, "threshold_seconds": 5.0},
            },
            {
                "camera": "loading_dock",
                "track_id": 1,
                "zone": "dock_entry",
                "event_type": "loitering",
                "started_at": 1000.0,
                "ended_at": 1006.0,
                "severity": "alert",
                "data": {"dwell_seconds": 6.0, "threshold_seconds": 5.0},
            },
        ]
        payload = {"events": rows}
        module.process(
            _frame(),
            {
                "detections": _detections(),
                "tracks": [_tracks()],
                zone_key(): [_membership("loading_dock", 1, [])],
                CAP["events"].key: [payload],
            },
        )

        kinds = [op["op"] for op in ops]
        assert kinds.count("insert_event") == 1
        assert kinds.count("end_event") == 1
        ins = next(op for op in ops if op["op"] == "insert_event")
        assert ins["camera_uid"] == camera_id("loading_dock")
        assert ins["track_uid"] == track_uuid("loading_dock", 1)
        assert ins["zone_uid"] == zone_id("loading_dock", "dock_entry")
        assert ins["event_uid"] == behavior_event_id("loitering", "loading_dock", "dock_entry", 1, 1000.0)
        assert ins["severity"] == "alert"
        from datetime import datetime, timezone

        assert ins["started_at"] == datetime.fromtimestamp(1000.0, tz=timezone.utc)
        end = next(op for op in ops if op["op"] == "end_event")
        assert end["track_uid"] == track_uuid("loading_dock", 1)
        assert end["ended_at"] == datetime.fromtimestamp(1006.0, tz=timezone.utc)
        assert end["event_type"] == "loitering"

    def test_behavior_sink_ignored_when_no_behavior_enabled(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))  # default: _sink_events False
        payload = {"events": [{"camera": "loading_dock", "track_id": 1, "event_type": "loitering",
                               "started_at": 1000.0, "ended_at": None}]}
        module.process(
            _frame(),
            {
                "detections": _detections(),
                "tracks": [_tracks()],
                zone_key(): [_membership("loading_dock", 1, [])],
                CAP["events"].key: [payload],
            },
        )
        assert all(op["op"] != "insert_event" for op in ops)

    def test_behavior_sink_ignores_unknown_camera(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))
        module.configure({"_behavior_events": ["behavior_loitering"]})
        payload = {"events": [{"camera": "ghost_cam", "track_id": 9, "event_type": "loitering",
                               "started_at": 1.0, "ended_at": None}]}
        module.process(
            _frame(),
            {
                "detections": _detections(),
                "tracks": [_tracks()],
                zone_key(): [_membership("loading_dock", 1, [])],
                CAP["events"].key: [payload],
            },
        )
        assert ops == []

    def _embedding_rows(self):
        return [
            {
                "camera": "loading_dock",
                "track_id": 1,
                "model": "open_clip",
                "vector": [0.1, 0.2, 0.3],
                "meta": {"class_name": "person", "class_id": 0, "confidence": 0.9,
                         "xyxy": [40.0, 30.0, 80.0, 90.0], "captured_at": 1000.0},
            },
            {
                "camera": "loading_dock",
                "track_id": 2,
                "model": "open_clip",
                "vector": [0.4, 0.5, 0.6],
                "meta": {"class_name": "car", "class_id": 2, "confidence": 0.8,
                         "xyxy": [50.0, 30.0, 90.0, 80.0], "captured_at": 1000.5},
            },
        ]

    def test_embedding_rows_are_sunk_via_carrier_and_dict(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))
        module.configure({"_embedding_sinks": ["semantic_search"]})

        # one carrier payload + one bare dict payload exercise both decoders
        carrier = SemanticEmbeddings(self._embedding_rows())
        bare = {"embeddings": self._embedding_rows()}
        module.process(
            _frame(),
            {
                "detections": _detections(),
                "tracks": [_tracks(_track(gid=1), _track(gid=2, class_id=2))],
                zone_key(): [_membership("loading_dock", 1, [])],
                CAP["embeddings"].key: [carrier, bare],
            },
        )

        inserts = [op for op in ops if op["op"] == "insert_embedding"]
        assert len(inserts) == 4  # 2 rows x 2 payloads (carrier + bare dict)
        first = inserts[0]
        assert first["embedding_uid"] == embedding_id("loading_dock", 1, "open_clip", 1000.0)
        assert first["track_uid"] == track_uuid("loading_dock", 1)
        assert first["model"] == "open_clip"
        assert first["vector"] == [0.1, 0.2, 0.3]
        assert first["meta"]["captured_at"] == 1000.0

    def test_embedding_sink_ignored_when_no_producer_enabled(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))  # default: _sink_embeddings False
        module.process(
            _frame(),
            {
                "detections": _detections(),
                "tracks": [_tracks(_track(gid=1))],
                zone_key(): [_membership("loading_dock", 1, [])],
                CAP["embeddings"].key: [{"embeddings": self._embedding_rows()}],
            },
        )
        assert all(op["op"] != "insert_embedding" for op in ops)

    def test_embedding_sink_ignores_unknown_camera(self):
        ops: list[dict] = []
        module = _make_module(FakeWriter(ops=ops))
        module.configure({"_embedding_sinks": ["semantic_search"]})
        module.process(
            _frame(),
            {
                "detections": _detections(),
                "tracks": [_tracks(_track(gid=1))],
                zone_key(): [_membership("loading_dock", 1, [])],
                CAP["embeddings"].key: [[{"camera": "ghost_cam", "track_id": 1, "model": "open_clip",
                                          "vector": [0.1], "meta": {"captured_at": 1.0}}]],
            },
        )
        assert all(op["op"] != "insert_embedding" for op in ops)


class TestWriterOps:
    def _params(self, op: dict):
        from perception.persistence import _params_for

        return _params_for(op)

    def test_id_determinism(self):
        a = (camera_id("loading_dock"), zone_id("loading_dock", "d"), track_uuid("loading_dock", 7))
        b = (camera_id("loading_dock"), zone_id("loading_dock", "d"), track_uuid("loading_dock", 7))
        assert a == b
        assert track_uuid("loading_dock", 7) != track_uuid("parking", 7)
        assert event_id("loading_dock", "d", 7, 1000.0) == event_id("loading_dock", "d", 7, 1000.0)

    def test_camera_params(self):
        p = self._params(
            {"op": "upsert_camera", "camera_uid": camera_id("c"), "name": "c", "source": "rtsp://x", "want_fps": 10.0}
        )
        assert p[0] == camera_id("c")
        assert p[1] == "c" and p[2] == "rtsp://x" and p[3] is True and p[4] == 10.0

    def test_zone_params_json(self):
        p = self._params(
            {
                "op": "upsert_zone",
                "zone_uid": zone_id("c", "z"),
                "camera_uid": camera_id("c"),
                "name": "z",
                "polygon": [[0, 0], [2, 2]],
            }
        )
        assert p[0] == zone_id("c", "z") and p[2] == "z" and p[3] == '[[0, 0], [2, 2]]'

    def test_track_params(self):
        p = self._params(
            {
                "op": "upsert_track",
                "track_uid": track_uuid("c", 1),
                "camera_uid": camera_id("c"),
                "global_track_id": 1,
                "tracker_backend": "bytetrack",
                "class_id": 0,
                "class_name": "person",
                "first_seen": 1000.0,
                "last_seen": 1001.0,
                "frames_delta": 1,
                "coasted_delta": 0,
                "peak_confidence": 0.9,
                "last_box": [1.0, 2.0, 3.0, 4.0],
            }
        )
        assert p[0] == track_uuid("c", 1)
        assert p[2] == 1 and p[4] == 0 and p[5] == "person" and p[10] == 0.9 and p[11] == "[1.0, 2.0, 3.0, 4.0]"

    def test_enter_zone_params(self):
        p = self._params(
            {
                "op": "enter_zone",
                "event_uid": event_id("c", "z", 1, 1.0),
                "camera_uid": camera_id("c"),
                "track_uid": track_uuid("c", 1),
                "zone_uid": zone_id("c", "z"),
                "started_at": 1000.0,
                "data": {},
            }
        )
        # (event_uid, camera_uid, track_uid, zone_uid, started_at, data_json)
        assert p[0] == event_id("c", "z", 1, 1.0)
        assert p[4] == 1000.0 and p[5] == "{}"

    def test_insert_event_params(self):
        p = self._params(
            {
                "op": "insert_event",
                "event_uid": behavior_event_id("loitering", "c", "z", 1, 1000.0),
                "camera_uid": camera_id("c"),
                "track_uid": track_uuid("c", 1),
                "zone_uid": zone_id("c", "z"),
                "event_type": "loitering",
                "started_at": 1000.0,
                "severity": "alert",
                "data": {"dwell_seconds": 5.0, "threshold_seconds": 5.0},
            }
        )
        # (event_uid, camera_uid, track_uid, zone_uid, event_type, started_at, severity, data_json)
        assert p[0] == behavior_event_id("loitering", "c", "z", 1, 1000.0)
        assert p[4] == "loitering" and p[5] == 1000.0 and p[6] == "alert"
        assert p[7] == '{"dwell_seconds": 5.0, "threshold_seconds": 5.0}'

    def test_insert_event_nullable_zone_and_track(self):
        p = self._params(
            {
                "op": "insert_event",
                "event_uid": behavior_event_id("tailgating", "c", None, 2, 1.0),
                "camera_uid": camera_id("c"),
                "event_type": "tailgating",
                "started_at": 1.0,
            }
        )
        assert p[2] is None and p[3] is None  # track_id/zone_id nullable FKs

    def test_end_event_params(self):
        p = self._params(
            {"op": "end_event", "track_uid": track_uuid("c", 1), "ended_at": 1006.0, "event_type": "loitering"}
        )
        assert p == (1006.0, track_uuid("c", 1), "loitering")

    def test_behavior_event_id_is_deterministic_and_distinct(self):
        a = behavior_event_id("loitering", "c", "z", 1, 1000.0)
        b = behavior_event_id("loitering", "c", "z", 1, 1000.0)
        assert a == b
        assert a != behavior_event_id("loitering", "c", "z", 1, 1000.5)

    def test_embedding_id_is_deterministic_and_model_scoped(self):
        a = embedding_id("c", 7, "open_clip", 1000.0)
        b = embedding_id("c", 7, "open_clip", 1000.0)
        assert a == b
        assert a != embedding_id("c", 7, "open_clip", 1000.5)
        assert a != embedding_id("c", 7, "jina_clip", 1000.0)
        assert a != embedding_id("d", 7, "open_clip", 1000.0)
        # never collides with entered_zone (event_id) or behavior rows
        assert a != event_id("c", "z", 1, 1000.0)
        assert a != behavior_event_id("loitering", "c", "z", 1, 1000.0)

    def test_insert_embedding_params(self):
        p = self._params(
            {
                "op": "insert_embedding",
                "embedding_uid": embedding_id("c", 7, "open_clip", 1000.0),
                "track_uid": track_uuid("c", 7),
                "model": "open_clip",
                "vector": [0.1234567, -0.2, 0.0],
                "meta": {"captured_at": 1000.0, "class_name": "person"},
            }
        )
        # (embedding_uid, track_uid, model, vector_str ::vector, meta_json ::jsonb)
        assert p[0] == embedding_id("c", 7, "open_clip", 1000.0)
        assert p[1] == track_uuid("c", 7)
        assert p[2] == "open_clip"
        assert p[3] == "[0.123457,-0.200000,0.000000]"
        assert p[4] == '{"captured_at": 1000.0, "class_name": "person"}'

    def test_unknown_op_raises(self):
        from perception.persistence import _params_for

        with pytest.raises(ValueError):
            _params_for({"op": "nope"})


def _det_op() -> dict:
    return {
        "op": "insert_detection",
        "camera_uid": camera_id("c"),
        "track_uid": track_uuid("c", 1),
        "ts": 1000.0,
        "frame_idx": 3,
        "x1": 0.0,
        "y1": 1.0,
        "x2": 10.0,
        "y2": 20.0,
        "confidence": 0.9,
        "class_id": 0,
        "class_name": "person",
    }


def _camera_op() -> dict:
    return {
        "op": "upsert_camera",
        "camera_uid": camera_id("c"),
        "name": "c",
        "source": "rtsp://x",
        "want_fps": 10.0,
    }


class TestWriterResilience:
    def test_db_down_does_not_crash_writer(self):
        def boom():
            raise RuntimeError("db down")

        writer = DatabaseWriter(connect=boom, max_queue=100)
        writer.start()
        for _ in range(20):
            writer.submit(_camera_op())
        writer.stop(flush_timeout=5.0)
        assert writer._thread is None or not writer._thread.is_alive()
        assert writer.dropped >= 1
        assert writer.written == 0

    def test_flush_with_no_conn_drops_batch(self):
        writer = DatabaseWriter(connect=lambda: None, max_queue=100)
        writer._flush([_det_op()])
        assert writer.dropped == 1

    def test_commit_ordered_preserves_order_and_commits_once(self):
        from perception.persistence import _pending_count
        from perception.persistence import (
            _MANY,
            _detection_row,
            _params_for,
            _sql_for,
        )

        executed = []

        class Cursor:
            def __init__(self) -> None:
                self.calls: list[tuple[str, tuple]] = []
                self.multi = 0

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def execute(self, sql, params):
                self.calls.append((sql, params))
                return self

            def executemany(self, sql, rows):
                self.multi += len(rows)
                return self

        class Conn:
            def __init__(self):
                self.cursor_ref = Cursor()

            def cursor(self):
                return self.cursor_ref

            def commit(self):
                executed.append("commit")

        conn = Conn()
        writer = DatabaseWriter(connect=lambda: conn, max_queue=100)
        writer._conn = conn

        track_op = {
            "op": "upsert_track",
            "track_uid": track_uuid("c", 1),
            "camera_uid": camera_id("c"),
            "global_track_id": 1,
            "tracker_backend": "bytetrack",
            "class_id": 0,
            "class_name": "person",
            "first_seen": 1000.0,
            "last_seen": 1001.0,
            "frames_delta": 1,
            "coasted_delta": 0,
            "peak_confidence": 0.9,
            "last_box": [1.0, 2.0, 3.0, 4.0],
        }
        zone_op = {
            "op": "enter_zone",
            "event_uid": event_id("c", "z", 1, 1.0),
            "camera_uid": camera_id("c"),
            "track_uid": track_uuid("c", 1),
            "zone_uid": zone_id("c", "z"),
            "started_at": 1000.0,
            "data": {"entered_at": 1000.0},
        }
        pending = [(_sql_for(o), _params_for(o)) for o in (track_op, zone_op)]
        pending.append((_MANY, _sql_for(_det_op()), [_detection_row(_det_op()), _detection_row(_det_op())]))

        writer._commit_ordered(pending)

        cur = conn.cursor_ref
        assert executed == ["commit"]
        assert cur.multi == 2
        assert len(cur.calls) == 2
        # order preserved: track upsert (INSERT ... tracks) before enter_zone event
        assert "INTO tracks" in cur.calls[0][0]
        assert "INTO events" in cur.calls[1][0]
        assert _pending_count([(1,), (1,), (1, 1)]) == 3
        assert writer.written == 4