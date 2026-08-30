---
sidebar_position: 3
title: Tracking
---

# Tracking

```yaml
tracking:
  enabled: true
  backend: bytetrack        # from the `trackers` package (Apache-2.0), NOT sv.ByteTrack
  track_buffer_seconds: 1.0 # seconds → converted to frames via measured FPS at runtime
  iou_threshold: 0.3
  track_thresh: 0.5         # low-score second-chance floor (>= 0.1 matched in stage 2)
```

Tracking is the strictest part of the platform: at **10–12 FPS** naive defaults fall apart, so all
three anti-jitter techniques are mandatory and individually toggleable
([Smoothing](./smoothing)).

## Time-based parameters — never frame-count defaults

Any tracker parameter that other projects document in *frames* is defined here in **seconds** and
converted at runtime using the camera's **actual measured FPS**:

```
track_buffer = round(track_buffer_seconds * measured_fps)
```

This is why `track_buffer_seconds: 1.0` behaves identically whether the camera runs at 12 or
30 FPS. Do not hardcode a frame count tuned for someone else's benchmark.

## Real `dt` in the Kalman predict step

Every frame is timestamped at capture time; the tracker's motion model uses the **real elapsed
time between the previous and current frame** — never an assumed constant. This is what keeps
predictions from drifting when frame delivery is uneven (a copy of the raw producer-consumer
delivery that real cameras produce).

## Backend

- `backend: bytetrack` uses the `trackers` package (Apache-2.0), **not** `sv.ByteTrack`, which is
  deprecated in Supervision and removed in 0.30.
- **`iou_threshold`** — association IoU floor.
- **`track_thresh`** — the ByteTrack low-score second-chance floor; detections between
  `track_thresh` and a minimal bound are matched in a second association stage (an expression of
  the classic low_score_threshold).

## Why ID-switching happens at low FPS (and what fixes it)

At 10–12 FPS objects move further between consecutive frames, which breaks naive IoU association
and causes **track fragmentation / ID switches**. The fixes are the ones above (time-scaled buffer,
real dt) plus the first-pass `DetectionSmoother` ([Smoothing](./smoothing)) that stabilizes the raw
detections before the tracker ever sees them.

## Verification harness

The platform ships a numeric jitter harness (recorded clip, controlled cadence, per-track box
delta logs):

- **Static object:** smoothed frame-to-frame positional variance stays below a pixel threshold.
- **Moving object:** lag (centroid distance between predicted and next real detection) stays below
  a threshold.

"It looks fine" is not an acceptance criterion; the numbers are. The smoothing stack is
individually toggleable so you can turn the One Euro Filter off alone and confirm its contribution.