"""Stage 7 API-layer tests — NL query parsing + retrieval SQL builder.

Pure logic against fakes: the parser is fully deterministic, and the search
SQL builder is asserted through a recording fake cursor (no Postgres, no
psycopg). The embed RPC (query text -> CLIP vector) is stubbed at the
``urllib`` seam. `main.py` needs psycopg and is not exercised here.
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

import nl  # noqa: E402
import search  # noqa: E402

UTC = timezone.utc


# --------------------------------------------------------------------------- #
# NL parser — filters + semantic residue
# --------------------------------------------------------------------------- #
CATS = nl.Catalogs(cameras=["loading_dock", "parking_lot"], zones=["dock_entry", "overflow"], labels=["person", "car"])


def _at(hour, minute=0, day=None):
    day = day or datetime(2026, 8, 31, tzinfo=UTC)
    return day.replace(hour=hour, minute=minute)


NOW = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)


def test_parses_camera_zone_label_event_and_residue():
    parsed = nl.parse_nl("show me a red truck near the loading dock after 10pm loitering", CATS, now=NOW)
    assert parsed.camera == "loading_dock"
    assert parsed.label == "truck"
    assert parsed.event_type == "loitering"
    assert parsed.time_from == _at(22)
    assert "me" in parsed.semantic_text and "red" not in parsed.semantic_text


def test_zone_and_semantic_description():
    parsed = nl.parse_nl("any person in the overflow zone wearing a jacket", CATS, now=NOW)
    assert parsed.zone == "overflow"
    assert parsed.label == "person"
    assert "wearing" in parsed.semantic_text and "jacket" not in parsed.semantic_text


def test_between_window_handles_overnight():
    parsed = nl.parse_nl("vehicles between 10pm and 2am", CATS, now=NOW)
    assert parsed.time_from == _at(22)
    assert parsed.time_to == _at(2, day=datetime(2026, 9, 1, tzinfo=UTC))


def test_relative_window():
    parsed = nl.parse_nl("loitering in the last 6 hours", CATS, now=NOW)
    assert parsed.event_type == "loitering"
    assert parsed.time_from == NOW - timedelta(hours=6)
    assert parsed.time_to is None


def test_day_keyword():
    parsed = nl.parse_nl("this morning near parking_lot", CATS, now=NOW)
    assert parsed.zone is None and parsed.camera == "parking_lot"
    assert parsed.time_from == _at(6) and parsed.time_to == _at(11, 59)


def test_label_alias_and_people_plural():
    parsed = nl.parse_nl("people on bikes", CATS, now=NOW)
    assert parsed.label == "person"  # "people" hits before "bike" would matter
    assert "bikes" in parsed.semantic_text


def test_llm_backend_falls_back_to_local_on_failure(monkeypatch):
    monkeypatch.setenv("AINA_NL_PARSER", "llm")
    monkeypatch.setenv("AINA_NL_LLM_URL", "http://127.0.0.1:1/nope")  # unreachable

    def boom(*a, **k):
        raise OSError("no server")

    import urllib.request as ur

    monkeypatch.setattr(ur, "urlopen", boom)
    parsed = nl.parse_nl("a car near dock_entry", CATS, now=NOW)
    assert parsed.label == "car"
    assert parsed.zone == "dock_entry"
    assert parsed.matched  # local backend ran, not "parsed by LLM"


def test_llm_backend_used_when_available(monkeypatch):
    monkeypatch.setenv("AINA_NL_PARSER", "llm")
    monkeypatch.setenv("AINA_NL_LLM_URL", "http://127.0.0.1:9/chat")
    import urllib.request as ur

    payload = {
        "choices": [{"message": {"content": json.dumps({
            "camera": "loading_dock", "zone": None, "label": "truck",
            "event_type": None, "time_from": None, "time_to": None,
            "semantic_text": "long haul",
        })}}]
    }
    monkeypatch.setattr(ur, "urlopen", lambda *a, **k: _FakeResp(json.dumps(payload).encode()))
    parsed = nl.parse_nl("long haul truck", CATS, now=NOW)
    assert parsed.camera == "loading_dock"
    assert parsed.label == "truck"
    assert parsed.semantic_text == "long haul"


class _FakeResp:
    def __init__(self, data: bytes) -> None:
        self._data = data

    def __enter__(self):
        return self

    def __exit__(self, *a) -> None:
        return None

    def read(self):
        return self._data


# --------------------------------------------------------------------------- #
# COCO label helpers + embedding RPC cache
# --------------------------------------------------------------------------- #
def test_coco_label_helpers():
    assert search.coco_class_name(0) == "person"
    assert search.coco_class_name(7) == "truck"
    assert search.coco_class_name(999) == ""
    assert search.normalize_label("Vehicle") == "car"
    assert search.normalize_label("person") == "person"
    assert search.class_id_set("car") == [2]
    assert search.class_id_set("person") == [0]


def test_embed_query_text_caches_and_skips_empty(monkeypatch):
    search._RPC_CACHE.clear()
    vec = [0.1] * 1024
    import urllib.request as ur

    monkeypatch.setattr(ur, "urlopen", lambda *a, **k: _FakeResp(json.dumps({"vector": vec}).encode()))
    assert search.embed_query_text("") is None
    first = search.embed_query_text("red forklift")
    assert first == vec
    # served from cache now — no second RPC call
    monkeypatch.setattr(ur, "urlopen", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no RPC")))
    assert search.embed_query_text("red forklift") == vec


def test_embed_query_text_returns_None_on_rpc_failure(monkeypatch):
    search._RPC_CACHE.clear()
    import urllib.error

    class _Err:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return None

        def read(self):
            raise urllib.error.URLError("down")

    assert search.embed_query_text("nope, rpc down") is None


# --------------------------------------------------------------------------- #
# SQL builder — filters first, then KNN, placeholder order stable
# --------------------------------------------------------------------------- #
class _FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.calls: list[tuple[str, list]] = []

    def execute(self, sql, params=None):
        self.calls.append((sql, params or []))
        return self

    def fetchall(self):
        return self.rows

    def fetchone(self):
        if self.calls[-1][0].startswith("SELECT vector::text"):
            return ("[0.5, 0.5]",) if self.rows else None
        return self.rows[0] if self.rows else None


class _FakeConn:
    def __init__(self, rows=None):
        self._cur = _FakeCursor(rows or [])

    def cursor(self):
        return self._cur


def _one_db_row():
    import uuid

    return (
        str(uuid.uuid4()), "loading_dock", 7, 0, "dock_entry", 0.9,
        datetime(2026, 8, 31, tzinfo=UTC), 1785596400.0, 0.05, None, "open_clip",
    )


def test_search_sql_applies_structured_filters_first():
    conn = _FakeConn(rows=[_one_db_row()])
    out = search.search_embeddings(
        conn,
        camera="loading_dock",
        zone="dock_entry",
        label="person",
        event_type="loitering",
        time_from=datetime(2026, 8, 31, 9, tzinfo=UTC),
        query_vector=[0.1, 0.2],
        limit=10,
    )
    sql, params = conn._cur.calls[-1]
    assert "c.name = %s" in sql
    assert "zq.zone_name = %s" in sql
    assert "(t.class_id::int = ANY(%s::int[]) OR lower(t.class_name) = lower(%s))" in sql
    assert "EXISTS (SELECT 1 FROM events ev2 WHERE ev2.track_id = t.id AND ev2.event_type = %s)" in sql
    assert "(e.meta->>'captured_at')::float8 >= %s" in sql
    # 6 filter placeholders + LIMIT, all bound in one tuple, no drift
    assert len(params) == 7
    # bound params in WHERE order, then the LIMIT
    (camera, zone, ids, name, event, since, limit) = params
    assert camera == "loading_dock" and zone == "dock_entry" and ids == [0]
    assert name == "person" and event == "loitering"
    assert limit == 10
    assert out["count"] == 1
    assert out["results"][0]["label"] == "person"


def test_search_sql_none_vector_falls_back_to_newest():
    conn = _FakeConn(rows=[_one_db_row()])
    out = search.search_embeddings(conn, camera="loading_dock", sort="date", limit=5)
    sql, params = conn._cur.calls[-1]
    assert "e.created_at DESC" in sql
    assert "<=>" not in sql
    assert out["count"] == 1


def test_search_similar_loads_source_vector_and_excludes_self():
    conn = _FakeConn(rows=[_one_db_row()])
    search.search_embeddings(conn, similar_id="abc-123", sort="relevance", limit=3)
    assert conn._cur.calls[0][0].startswith("SELECT vector::text")
    sql, params = conn._cur.calls[-1]
    assert "e.id <> %s::uuid" in sql
    assert "<=> '[0.500000,0.500000]'::vector" in sql
    assert params[0] == "abc-123"


def test_search_similar_missing_source_returns_empty():
    conn = _FakeConn(rows=[])
    out = search.search_embeddings(conn, similar_id="nope", limit=3)
    assert out == {"results": [], "count": 0}
    assert len(conn._cur.calls) == 1  # prepared lookup only, no main query


def test_cosine_similarity_rounds_to_unit_clipped():
    import uuid

    row = (uuid.UUID(int=4), "c", 1, 0, None, None, None, None, 0.004, "d", "m")
    from search import _rows_to_dict  # already on sys.path via this module

    out = _rows_to_dict([row])["results"][0]
    assert out["similarity"] == pytest.approx(0.996)
    assert out["label"] == "person"