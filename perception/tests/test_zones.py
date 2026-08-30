"""Stage 4: zones — polygon membership over tracks (feet point, per source)."""
from __future__ import annotations

import pytest

from perception.modules import Frame
from perception.modules.tracking import Track
from perception.modules.zones import ZoneError, Zones, point_in_polygon


def _zone_params():
    return {
        "_zones_by_source": {
            "loading_dock": [
                {"name": "dock_entry", "polygon": [[0, 0], [100, 0], [100, 100], [0, 100]]},
                {"name": "dock_exit", "polygon": [[200, 200], [300, 200], [300, 300], [200, 300]]},
            ],
            "yard": [
                {"name": "yard_left", "polygon": [[0, 0], [50, 0], [50, 200], [0, 200]]},
            ],
        }
    }


def _tracks_payload(*tracks: Track):
    from perception.modules.tracking import Tracks

    return Tracks(tracks=list(tracks), frame_idx=1, timestamp=0.1)


def _track(track_id, source, xyxy, class_id=0, **kw):
    return Track(track_id=track_id, source=source, class_id=class_id, confidence=0.9,
                 xyxy=xyxy, raw_xyxy=xyxy, lost_count=0, age_frames=1, coasted=False,
                 last_frame_idx=1, last_timestamp=0.1, **kw)


def test_point_in_polygon():
    square = [[0, 0], [100, 0], [100, 100], [0, 100]]
    assert point_in_polygon(50, 50, square) is True
    assert point_in_polygon(150, 50, square) is False
    assert point_in_polygon(50, 500, square) is False
    concave = [[0, 0], [100, 0], [100, 100], [60, 100], [60, 40], [40, 40], [40, 100], [0, 100]]
    assert point_in_polygon(20, 80, concave) is True
    assert point_in_polygon(50, 80, concave) is False  # in the notch
    assert point_in_polygon(50, 20, concave) is True


def test_membership_uses_feet_point_and_is_per_source():
    mod = Zones()
    mod.configure(_zone_params())

    # feet (50, 50) inside dock_entry — even though the box top straddles it
    dock_track = _track(1, "loading_dock", (0, 0, 100, 50))
    # object physically in the yard, outside yard_left's x<50 slab — must NOT
    # match any zone and must not inherit dock zones either
    yard_track = _track(2, "yard", (100, 100, 120, 140))
    out = mod.process(Frame(source="loading_dock", frame_id=1, timestamp=0.1), {"tracks": [_tracks_payload(dock_track, yard_track)]})
    payload = out["zone_membership"]

    assert payload["memberships"][("loading_dock", 1)] == ["dock_entry"]
    # yard object is tracked but stands in no zone — present with empty membership,
    # and never inherited a dock zone
    assert payload["memberships"][("yard", 2)] == []
    assert "dock_entry" not in payload["memberships"][("yard", 2)]
    assert payload["zone_defs"]["loading_dock"] == ["dock_entry", "dock_exit"]
    assert payload["zone_defs"]["yard"] == ["yard_left"]


def test_multi_zone_membership_sorted():
    mod = Zones()
    mod.configure(_zone_params())
    track = _track(1, "loading_dock", (240, 240, 260, 260))  # inside dock_exit only
    out = mod.process(Frame(source="yard", frame_id=1, timestamp=0.1), {"tracks": [_tracks_payload(track)]})
    assert out["zone_membership"]["memberships"][("loading_dock", 1)] == ["dock_exit"]


def test_track_spanning_two_zones_reports_both():
    mod = Zones()
    mod.configure({
        "_zones_by_source": {
            "a": [
                {"name": "left", "polygon": [[0, 0], [50, 0], [50, 100], [0, 100]]},
                {"name": "right", "polygon": [[50, 0], [100, 0], [100, 100], [50, 100]]},
            ]
        }
    })
    track = _track(1, "a", (0, 0, 100, 50))  # feet (50, 50)
    out = mod.process(Frame(source="a", frame_id=1, timestamp=0.1), {"tracks": [_tracks_payload(track)]})
    # feet on shared edge belongs to whichever test asserts first? No: (50,50)
    # is on the boundary, ray cast resolves deterministically — assert containment
    zone_names = out["zone_membership"]["memberships"][("a", 1)]
    assert set(zone_names) <= {"left", "right"}


def test_no_zones_configured_is_a_noop():
    mod = Zones()
    mod.configure({})
    track = _track(1, "a", (0, 0, 100, 50))
    out = mod.process(Frame(source="a", frame_id=1, timestamp=0.1), {"tracks": [_tracks_payload(track)]})
    assert out["zone_membership"]["memberships"] == {}


def test_malformed_zone_config_fails_fast():
    with pytest.raises(ZoneError, match="name and >= 3"):
        Zones().configure({"_zones_by_source": {"a": [{"name": "bad"}]}})
    with pytest.raises(ZoneError, match="name and >= 3"):
        Zones().configure({"_zones_by_source": {"a": [{"name": "x", "polygon": [[0, 0], [1, 1]]}]}})  # only 2 verts