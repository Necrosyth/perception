---
sidebar_position: 1
title: Configuration
---

# Configuration

Surveillance Intelligence Lab is configured by editing two YAML files — this is the contract an operator edits,
never code.

```
config/aina.yaml        # platform config: deployment, cameras, zones, capabilities, smoothing
media/go2rtc.yaml       # stream sources (see Media service)
```

:::note "Nothing coupled … Everything toggled by config"
Every perception capability is a **config toggle**. A user who wants ANPR-only sets
`anpr.enabled: true` (the orchestrator auto-enables the minimum dependency chain, e.g. vehicle
detection, and logs what it turned on implicitly) and turns everything else off. No code edits, no
forks.
:::

## The full reference

Below is the shipped `config/aina.yaml` with annotations.

```yaml
deployment:
  target: edge          # edge (Jetson) | aws (g4dn/g5) — selects base image + engine only
  gpu: true

cameras:
  - name: loading_dock
    source: rtsp://user:pass@192.168.1.50:554/stream1   # metadata; go2rtc owns the real stream
    zones:
      - name: dock_entry
        polygon: [[0, 0], [100, 0], [100, 100], [0, 100]]   # normalized 0–100 %
    # add more cameras, each with its own zones

capabilities:
  object_detection:
    enabled: true
    framework: ultralytics   # detector layer: ultralytics | rfdetr | (add your own in perception/detectors/)
    model: yolo26s           # ultralytics id (yolo26s, yolo13, yolo11n, yolov8s, …) or local weights path
    image_size: 640
    confidence: 0.25
    device_head: one_to_one   # one_to_one (NMS-free head where the model allows, default) | one_to_many

  tracking:
    enabled: true
    backend: bytetrack        # from the `trackers` package (Apache-2.0), NOT sv.ByteTrack
    track_buffer_seconds: 1.0 # seconds → converted to frames via measured FPS at runtime
    iou_threshold: 0.3
    track_thresh: 0.5         # low-score second-chance floor (>= 0.1 matched in stage 2)

  zones:
    enabled: true             # membership vs cameras[].zones polygons → events + overlays

  face_recognition:
    enabled: false

  anpr:
    enabled: false

  behavior:
    loitering:
      enabled: false          # Stage 6 — keep off until behavior_loitering lands
      dwell_threshold_seconds: 600
    tailgating:
      enabled: false          # deferred — see Roadmap

  semantic_search:
    enabled: false            # Stage 7 — off until local-CLIP embeddings land
    embedding_model: local_clip   # must stay local — no cloud embedding APIs

  persistence:
    enabled: true             # Stage 5 — sink detections/tracks/zone events to Postgres
    detection_sampling: 5     # persist 1 in N detection rows (24/7 feeds → keep table lean)
    finalize_timeout_s: 5.0   # finalize a track after it has been unseen this long
    # database: {host: postgres, port: 5432, user: aina, password: ..., dbname: aina_sentinel}
    # defaults (and docker-compose) read the standard POSTGRES_* env vars instead

smoothing:
  detection_smoother: true      # sv.DetectionSmoother first-pass on raw detections
  one_euro_filter: true         # per-track render smoothing
  render_interpolation: true    # Kalman predict between real detections
  min_cutoff: 1.0
  beta: 0.007
  d_cutoff: 1.0
```

## Editing rules

- **Names must match across files.** The camera name in aina.yaml, the go2rtc stream key, the
  perception restream target (`rtsp://media:8554/<name>`), and the API `id` are all the **same
  string**. Rename in both places.
- After editing `aina.yaml`, recreate the perception container: `docker compose up -d --force-recreate perception`.
- After editing `go2rtc.yaml`, recreate media: `docker compose up -d --force-recreate media`.
- Every capability toggle is validated at startup; a required-but-missing upstream fails **fast**
  with an error naming the missing capability (or auto-enables the minimum dependency chain).

## Sections

- [Detection](./detection) — detector layer, model, head.
- [Tracking](./tracking) — time-based trackers, thresholds.
- [Zones](./zones) — polygons and membership.
- [Smoothing](./smoothing) — the jitter-elimination stack.
- [Persistence](./persistence) — Postgres sink, sampling, resilience.
- [Capabilities](./capabilities) — face/ANPR/loitering/semantic search (planned/off).
- [Environment & Docker](./environment) — `.env`, compose variables.