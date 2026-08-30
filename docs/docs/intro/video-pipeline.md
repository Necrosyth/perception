---
sidebar_position: 7
title: Video pipeline
---

# Video pipeline

Understanding the pipeline explains why the stack is shaped the way it is.

## One open source, many consumers

```
                    ┌─────────────────────────────────────────────────────┐
                    │                    media (go2rtc)                    │
   camera ────────▶ │  port 554 ← source stream (opened ONCE per camera)  │
                    │                                                     │
                    │   restreams:                                        │
                    │     • rtsp://media:8554/<name>   ──▶ perception     │
                    │     • /api/stream.mp4?src=<name> ──▶ dashboard MSE  │
                    └─────────────────────────────────────────────────────┘
```

Every other consumer talks to go2rtc, never to the camera. This means one encode per camera
regardless of how many viewers or analyzers attach, and it is what keeps CPU low and behavior
deterministic.

## Frame flow inside perception

```
rtsp (go2rtc restream)
   │
   ▼
orchestrator ── per-frame timeline ─────────────────────────────────────────┐
   │                                                                        │
   ├─▶ object_detection  ── Detections (sv.Detections)                      │
   │        │                                                               │
   │        ▼                                                               │
   │   detection_smoother (first pass)                                     │
   │        │                                                               │
   │        ▼                                                               │
   ├─▶ tracking  (ByteTrack-like, time-scaled params, real dt in Kalman)    │
   │        │                                                               │
   │        ▼                                                               │
   │   one_euro_filter (per-track render smoothing)                        │
   │        │                                                               │
   │        ▼                                                               │
   ├─▶ zones  (membership vs polygons) ──▶ enter/leave events               │
   │        │                                                               │
   │        ▼                                                               │
   └─▶ persistence ──▶ Postgres (tracks / detections / events)              │
```

Each stage is a config-toggtable module in the orchestrator's dependency graph, so nothing
duplicates a computation another module already produced. See
[Architecture](../development/architecture) and [Smoothing](../configuration/smoothing).

## Detection cadence, render cadence

Detection runs at the achieved inference rate (**nominally 10–12 FPS**). The tracker's Kalman
*predict* step interpolates box positions between real detections, so the pipeline can render
smoothly even when detections only land every ~80–100 ms. This is the "decouple detection rate
from render rate" principle — the same technique game engines use between physics and render ticks.

## Two smoothing problems (and two solutions)

1. **Association stability** — raw per-frame detections jitter by a few pixels. `sv.DetectionSmoother`
   is applied first, upstream of tracking.
2. **Visual rendering stability** — tracked boxes must not shake at 10–12 FPS. A per-track
   **One Euro Filter** runs after tracking.

Each can be toggled independently in config for debugging
([Smoothing](../configuration/smoothing)).

## Latency budget

- Camera → go2rtc: sub-second at restream.
- go2rtc → perception → Postgres: one frame's inference time (≈80–100 ms).
- go2rtc → dashboard MSE: near-zero end-to-end (go2rtc relays packets in place).

## More

- [Network requirements](./network) — which ports talk to whom.
- [Media service](../platform/media) — go2rtc configuration in depth.