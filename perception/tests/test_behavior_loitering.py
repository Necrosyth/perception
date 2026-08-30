"""Stage 6: behavior_loitering — dwell-time debounce by (event_type, tracker_id).

Pure timestamp logic; the module reads the ``zone_membership`` capability and
never touches geometry, detection, or tracking code directly.
"""
from __future__ import annotations

import pytest

from perception.modules.base import CAP, Frame
from perception.modules.behavior_loitering import BehaviorLoitering


def _membership(source, tracks, ts):
    """zone_membership payload shaped like zones.py's output.

    ``tracks`` is {(gid, [zones])...}; memberships is keyed by (source, gid).
    An entry with an empty zone list means "tracked but standing in no zone".
    """
    return {
        "memberships": {(source, gid): sorted(zones) for gid, zones in tracks.items()},
        "zone_defs": {source: sorted({z for _, zs in tracks.items() for z in zs})},
        "frame_idx": 1,
        "timestamp": ts,
    }


def _upstream(ts, memberships, source="loading_dock"):
    return {
        CAP["tracks"].key: [{"tracks": [], "frame_idx": 1, "timestamp": ts}],
        CAP["zone_membership"].key: [memberships],
    }


def _frame(ts, source="loading_dock"):
    return Frame(source=source, frame_id=int(ts * 10), timestamp=ts)


def _run(mod, frames):
    """frames: list of (ts, memberships_dict) → flattened event rows."""
    events = []
    for ts, memberships in frames:
        out = mod.process(_frame(ts), _upstream(ts, memberships))
        events.extend(out[CAP["events"].key])
    return events


def test_contract():
    mod = BehaviorLoitering()
    assert mod.name == "behavior_loitering"
    assert mod.implemented is True
    assert mod.requires() == ["tracks", "zone_membership"]
    assert mod.produces() == ["events"]
    assert mod.EVENT_TYPE == "loitering"
    assert mod.SEVERITY == "alert"


def test_fires_once_after_threshold_is_crossed():
    mod = BehaviorLoitering()
    mod.configure({"dwell_threshold_seconds": 5.0})
    in_dock = _membership("loading_dock", {1: ["dock_entry"]}, 0.0)
    events = _run(
        mod,
        [
            (0.0, in_dock),   # enters zone; clock starts
            (2.0, in_dock),   # below threshold
            (5.0, in_dock),   # dwell == 5.0 → fires once
            (9.0, in_dock),   # still inside → debounced, no re-fire
        ],
    )

    starts = [e for e in events if e["ended_at"] is None]
    assert len(events) == 1
    assert len(starts) == 1
    row = starts[0]
    assert row["event_type"] == "loitering"
    assert row["camera"] == "loading_dock"
    assert row["track_id"] == 1
    assert row["zone"] == "dock_entry"
    assert row["started_at"] == 0.0  # whole dwell, not just the crossing frame
    assert row["ended_at"] is None
    assert row["severity"] == "alert"
    assert row["data"]["dwell_seconds"] == 5.0
    assert row["data"]["threshold_seconds"] == 5.0


def test_leaving_all_zones_closes_episode_and_reentry_fires_again():
    mod = BehaviorLoitering()
    mod.configure({"dwell_threshold_seconds": 5.0})
    in_dock = _membership("loading_dock", {1: ["dock_entry"]}, 0.0)
    out = _membership("loading_dock", {1: []}, 6.0)
    events = _run(
        mod,
        [
            (0.0, in_dock),   # enter
            (5.0, in_dock),   # dwell 5.0 → fire (episode 1)
            (6.0, out),       # left every zone → close episode 1
            (10.0, in_dock),  # re-enters → fresh episode
            (15.0, in_dock),  # dwell 5.0 → fire again (episode 2)
        ],
    )

    starts = [e for e in events if e["ended_at"] is None]
    ends = [e for e in events if e["ended_at"] is not None]
    assert len(starts) == 2, f"expected two episodes, got {len(starts)}"
    assert len(ends) == 1
    assert [s["started_at"] for s in starts] == [0.0, 10.0]
    assert ends[0]["ended_at"] == 6.0
    assert ends[0]["started_at"] == 0.0  # closes the ep-1 row


def test_absent_from_membership_closes_episode():
    mod = BehaviorLoitering()
    mod.configure({"dwell_threshold_seconds": 5.0})
    in_dock = _membership("loading_dock", {1: ["dock_entry"]}, 0.0)
    gone = _membership("loading_dock", {}, 6.0)  # track vanished entirely
    events = _run(
        mod,
        [(0.0, in_dock), (5.0, in_dock), (6.0, gone)],
    )
    assert len([e for e in events if e["ended_at"] is None]) == 1
    ends = [e for e in events if e["ended_at"] is not None]
    assert len(ends) == 1 and ends[0]["ended_at"] == 6.0


def test_below_threshold_never_fires():
    mod = BehaviorLoitering()
    mod.configure({"dwell_threshold_seconds": 10.0})
    in_dock = _membership("loading_dock", {1: ["dock_entry"]}, 0.0)
    events = _run(mod, [(0.0, in_dock), (5.0, in_dock)])
    assert events == []


def test_zero_threshold_fires_on_first_frame():
    mod = BehaviorLoitering()
    mod.configure({"dwell_threshold_seconds": 0.0})
    in_dock = _membership("loading_dock", {1: ["dock_entry"]}, 0.0)
    events = _run(mod, [(0.0, in_dock), (1.0, in_dock)])
    assert len(events) == 1 and events[0]["started_at"] == 0.0
    assert events[0]["data"]["dwell_seconds"] == 0.0


def test_no_zones_anywhere_means_no_events():
    mod = BehaviorLoitering()
    mod.configure({"dwell_threshold_seconds": 5.0})
    nowhere = _membership("loading_dock", {}, 0.0)
    events = _run(mod, [(0.0, nowhere), (9.0, nowhere)])
    assert events == []


def test_only_current_source_is_advanced():
    mod = BehaviorLoitering()
    mod.configure({"dwell_threshold_seconds": 5.0})
    in_dock = _membership("loading_dock", {1: ["dock_entry"]}, 0.0)
    yard_dwell = _membership("yard", {2: ["yard_a"]}, 0.0)
    # yard's track must not be touched while a loading_dock frame is processed
    events = _run(mod, [(0.0, in_dock), (9.0, in_dock)])
    assert len(events) == 1
    # now a yard frame arrives; the loading_dock track is untouched (no key),
    # yard track starts its own clock only when yard frames are processed
    out = mod.process(_frame(9.0, source="yard"), _upstream(9.0, yard_dwell, source="yard"))
    assert out[CAP["events"].key] == []
    out = mod.process(_frame(14.0, source="yard"), _upstream(14.0, yard_dwell, source="yard"))
    assert len(out[CAP["events"].key]) == 1
    assert out[CAP["events"].key][0]["camera"] == "yard"


def test_multiple_tracks_are_independent():
    mod = BehaviorLoitering()
    mod.configure({"dwell_threshold_seconds": 5.0})
    both = _membership("loading_dock", {1: ["dock_entry"], 2: ["dock_entry"]}, 0.0)
    events = _run(mod, [(0.0, both), (5.0, both)])
    starts = [e for e in events if e["ended_at"] is None]
    assert sorted(e["track_id"] for e in starts) == [1, 2]


def test_multi_zone_membership_fires_the_first_sorted_zone():
    mod = BehaviorLoitering()
    mod.configure({"dwell_threshold_seconds": 5.0})
    two = _membership("loading_dock", {1: ["dock_exit", "dock_entry"]}, 0.0)
    events = _run(mod, [(0.0, two), (5.0, two)])
    assert len(events) == 1
    assert events[0]["zone"] == "dock_entry"  # sorted first


def test_configure_rejects_negative_threshold():
    with pytest.raises(ValueError, match="dwell_threshold_seconds"):
        BehaviorLoitering().configure({"dwell_threshold_seconds": -1})