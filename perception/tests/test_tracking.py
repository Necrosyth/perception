"""Stage 4: tracking — trackers package backends + Tracking module.

Covers: identity stability, global ids per source, coasting + time-based expiry
(track_buffer_seconds converted via measured FPS), the ByteTrack low-score
second-chance association, and the smoothing stack's per-toggle behavior.
"""
from __future__ import annotations

import numpy as np
import pytest

from perception.modules import Frame
from perception.modules.tracking import Tracking
from perception.trackers import TrackerRegistry


def _dets(xyxy, confidence, class_id):
    return {
        "xyxy": np.asarray(xyxy, dtype=float),
        "confidence": np.asarray(confidence, dtype=float),
        "class_id": np.asarray(class_id, dtype=int),
    }


def _frame(source="dock", frame_id=0, ts=0.0):
    return Frame(source=source, frame_id=frame_id, timestamp=ts, image=None)


def _run(module, frames, boxes_lookup):
    """Feed frames; returns list of (Tracks payloads)."""
    out_payloads = []
    for fr in frames:
        det = boxes_lookup(fr.frame_id)
        if det is None:
            det = {"xyxy": None, "confidence": None, "class_id": None}
        up = {"detections": [_dets(**det)]}
        out = module.process(fr, up)
        out_payloads.append(out["tracks"])
    return out_payloads


# --------------------------------------------------------------------------- #
# Backends: identity + association
# --------------------------------------------------------------------------- #


def test_bytetrack_keeps_identity_for_moving_box():
    backend = TrackerRegistry.create({"backend": "bytetrack", "iou_threshold": 0.3, "track_thresh": 0.5})
    box = [0.0, 0.0, 20.0, 40.0]
    ids = []
    for i in range(8):
        states = backend.update(i, float(i), _dets([[box[0] + 2 * i, box[1], box[2] + 2 * i, box[3]]], [0.9], [0])["xyxy"],
                                 _dets([[box[0] + 2 * i, box[1], box[2] + 2 * i, box[3]]], [0.9], [0])["confidence"],
                                 _dets([[box[0] + 2 * i, box[1], box[2] + 2 * i, box[3]]], [0.9], [0])["class_id"])
        assert len(states) == 1
        ids.append(states[0].track_id)
    assert len(set(ids)) == 1  # same identity the whole run
    assert ids[0] >= 1


def test_bytetrack_low_score_second_chance_keeps_identity():
    # Classic ByteTrack: a momentarily low-confidence detection still matches
    # the existing track (stage 2), so identity survives detection flicker.
    backend = TrackerRegistry.create({"backend": "bytetrack", "iou_threshold": 0.3, "track_thresh": 0.5})
    box1 = [0.0, 0.0, 20.0, 40.0]
    states = backend.update(0, 0.0, _dets([box1], [0.9], [0])["xyxy"],
                            _dets([box1], [0.9], [0])["confidence"], _dets([box1], [0.9], [0])["class_id"])
    first_id = states[0].track_id

    # Same box, but the detector now scores it 0.2 (< track_thresh, >= 0.1).
    states = backend.update(1, 0.1, _dets([box1], [0.2], [0])["xyxy"],
                            _dets([box1], [0.2], [0])["confidence"], _dets([box1], [0.2], [0])["class_id"])
    assert len(states) == 1
    assert states[0].track_id == first_id
    assert states[0].raw_xyxy is not None and states[0].confidence == 0.2


def test_bytetrack_new_high_detection_spawns_new_track_but_keeps_old():
    backend = TrackerRegistry.create({"backend": "bytetrack"})
    a = [0.0, 0.0, 20.0, 40.0]
    b = [500.0, 500.0, 520.0, 540.0]
    backend.update(0, 0.0, _dets([a], [0.9], [0])["xyxy"], _dets([a], [0.9], [0])["confidence"], _dets([a], [0.9], [0])["class_id"])
    states = backend.update(1, 0.1, _dets([a, b], [0.9, 0.8], [0, 0])["xyxy"],
                            _dets([a, b], [0.9, 0.8], [0, 0])["confidence"], _dets([a, b], [0.9, 0.8], [0, 0])["class_id"])
    ids = {s.track_id for s in states}
    assert len(ids) == 2  # one carried over + one brand new


def test_bytetrack_coast_glides_by_elapsed_time():
    """Coasted priors must move proportionally to the real dt (px/s)."""

    def run(gap: float) -> float:
        backend = TrackerRegistry.create({"backend": "bytetrack", "iou_threshold": 0.3, "track_thresh": 0.5})
        # seed a rightward velocity with overlapping steps (IoU > gate -> one track)
        backend.update(0, 0.0, _dets([[0.0, 0.0, 20.0, 40.0]], [0.9], [0])["xyxy"],
                       _dets([[0.0, 0.0, 20.0, 40.0]], [0.9], [0])["confidence"],
                       _dets([[0.0, 0.0, 20.0, 40.0]], [0.9], [0])["class_id"])
        backend.update(1, 0.1, _dets([[6.0, 0.0, 26.0, 40.0]], [0.9], [0])["xyxy"],
                       _dets([[6.0, 0.0, 26.0, 40.0]], [0.9], [0])["confidence"],
                       _dets([[6.0, 0.0, 26.0, 40.0]], [0.9], [0])["class_id"])
        # coast: gap seconds after t=0.1, no detection
        states = backend.update(2, 0.1 + gap, None, None, None)
        assert len(states) == 1
        assert states[0].predicted_xyxy is not None
        cx = (states[0].predicted_xyxy[0] + states[0].predicted_xyxy[2]) / 2.0
        return cx

    assert run(0.4) > run(0.1)  # longer real gap -> glides further


def test_iou_backend_coasts_and_expires():
    backend = TrackerRegistry.create({"backend": "iou", "iou_threshold": 0.3})
    backend.set_max_lost_frames(3)
    box = [0.0, 0.0, 20.0, 40.0]

    states = backend.update(0, 0.0, _dets([box], [0.9], [0])["xyxy"], _dets([box], [0.9], [0])["confidence"], _dets([box], [0.9], [0])["class_id"])
    tid = states[0].track_id

    for frame_idx in range(1, 3):  # two coasted frames
        states = backend.update(frame_idx, float(frame_idx), None, None, None)
        assert len(states) == 1
        assert states[0].track_id == tid and states[0].raw_xyxy is None
        assert states[0].predicted_xyxy is not None  # reused last box
    # 3rd consecutive miss = exactly max_lost_frames, still alive (> max expires)
    states = backend.update(3, 3.0, None, None, None)
    assert len(states) == 1 and states[0].lost_count == 3
    states = backend.update(4, 4.0, None, None, None)  # 4 > 3 -> gone
    assert states == []


# --------------------------------------------------------------------------- #
# Tracking module: global ids, measured FPS, smoothing toggles
# --------------------------------------------------------------------------- #


def _module(buffer_seconds=1.0, smoothing=None, backend="bytetrack"):
    mod = Tracking()
    mod.configure({"backend": backend, "track_buffer_seconds": buffer_seconds, "iou_threshold": 0.3, "track_thresh": 0.5})
    mod.smoothing = smoothing if smoothing is not None else {"one_euro_filter": False, "render_interpolation": False, "detection_smoother": False}
    return mod


def test_identity_stable_and_globally_unique_per_source():
    mod = _module()
    events = []

    # camera A: a single moving forklift
    for i in range(5):
        det = _dets([[float(100 + i), 200, 140 + i, 260]], [0.9], [0])
        payload = mod.process(_frame("loading_dock", i, i * 0.1), {"detections": [det]})["tracks"]
        assert len(payload.tracks) == 1 and not payload.tracks[0].coasted
        events.append(payload.tracks[0])
    forklift_id = events[0].track_id
    assert {t.track_id for t in events} == {forklift_id}

    # camera B: a totally separate object -> distinct *global* id
    payload = mod.process(_frame("yard", 0, 100.0), {"detections": [_dets([[0, 0, 20, 40]], [0.85], [2])]})["tracks"]
    assert payload.tracks[0].track_id != forklift_id
    assert payload.tracks[0].source == "yard"
    # both alive simultaneously: ids unique across sources
    payload = mod.process(_frame("loading_dock", 5, 0.5), {"detections": [_dets([[105, 200, 145, 260]], [0.9], [0])]})["tracks"]
    assert payload.tracks[0].track_id == forklift_id


def test_coast_then_expire_via_track_buffer_and_measured_fps():
    # 10 fps stream, 1.0 s buffer -> object may be invisible for ~10 frames
    mod = _module(buffer_seconds=1.0)
    box = [0.0, 0.0, 20.0, 40.0]
    payload = mod.process(_frame(ts=0.0, frame_id=0), {"detections": [_dets([box], [0.9], [0])]})["tracks"]
    tid = payload.tracks[0].track_id

    for frame_id in range(1, 11):  # 10 gap frames at 10fps = exactly the buffer
        payload = mod.process(_frame(ts=frame_id * 0.1, frame_id=frame_id), {"detections": []})["tracks"]
        assert len(payload.tracks) == 1, f"track should still coast into frame {frame_id}"
        assert payload.tracks[0].coasted is True
        assert payload.tracks[0].track_id == tid

    # frame 11: lost_count is 11 > 10 -> gone (matches track_buffer_seconds)
    payload = mod.process(_frame(ts=11.0 * 0.1, frame_id=11), {"detections": []})["tracks"]
    assert payload.tracks == []


def test_run_measures_fps_from_wall_clock_deltas():
    mod = _module(buffer_seconds=1.0)
    mod.process(_frame(ts=0.0, frame_id=0), {"detections": []})
    # stream at 5 fps
    mod.process(_frame(ts=0.0, frame_id=0), {"detections": []})
    for i in range(1, 6):
        mod.process(_frame(ts=i * 0.2, frame_id=i), {"detections": []})
    assert abs(mod._fps["dock"] - 5.0) < 1.0
    # buffer 1.0 s at ~5 fps -> max_lost ~5
    assert abs(mod._backend_for("dock").max_lost_frames - 5) <= 1


def test_render_interpolation_vs_freezing():
    box = [0.0, 0.0, 20.0, 40.0]
    interp = _module(smoothing={"one_euro_filter": False, "render_interpolation": True, "detection_smoother": False})
    frozen = _module(smoothing={"one_euro_filter": False, "render_interpolation": False, "detection_smoother": False})

    for mod, label in ((interp, "interp"), (frozen, "frozen")):
        mod.process(_frame(ts=0.0, frame_id=0), {"detections": [_dets([box], [0.9], [0])]})
        pm = mod.process(_frame(ts=0.1, frame_id=1), {"detections": []})["tracks"]
        assert len(pm.tracks) == 1 and pm.tracks[0].coasted
        if label == "interp":
            assert list(pm.tracks[0].xyxy) == box  # stationary object -> kalman predicts same place
        else:
            assert list(pm.tracks[0].xyxy) == box


def test_one_euro_smooths_noisy_render_boxes():
    mod = _module(smoothing={"one_euro_filter": True, "render_interpolation": False, "detection_smoother": False},
                  backend="iou")
    box = [0.0, 0.0, 20.0, 40.0]
    renders = []
    raws = []
    rng = np.random.default_rng(7)
    for frame_id in range(20):
        noisy = [
            box[0] + rng.normal(0, 3),
            box[1] + rng.normal(0, 3),
            box[2] + rng.normal(0, 3),
            box[3] + rng.normal(0, 3),
        ]
        payload = mod.process(_frame(ts=frame_id * 0.1, frame_id=frame_id),
                              {"detections": [_dets([noisy], [0.9], [0])]})["tracks"]
        renders.append(payload.tracks[0].xyxy[0])
        raws.append(noisy[0])
    # warm-up exempt: variance over the sustained run must drop substantially
    assert np.var(renders[5:]) < np.var(raws[5:]) * 0.5


def test_detect_merge_broadcast_lists():
    from perception.detectors.base import Detections

    mod = _module()
    a = Detections(xyxy=[[0, 0, 10, 20]], confidence=[0.9], class_id=[0])
    b = Detections(xyxy=[[50, 50, 70, 90]], confidence=[0.8], class_id=[1])
    payload = mod.process(_frame(ts=0.0, frame_id=0), {"detections": [[a, b]]})["tracks"]
    assert len(payload.tracks) == 2
    assert {t.class_id for t in payload.tracks} == {0, 1}


def test_unknown_backend_fails_fast():
    with pytest.raises(Exception, match="no tracker backend"):
        TrackerRegistry.create({"backend": "not_a_tracker"})