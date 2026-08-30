---
sidebar_position: 6
title: Camera setup
---

# Camera setup

Every camera is configured in **two places**, and the **name must match** between them:

1. [`media/go2rtc.yaml`](../platform/media) — the stream source (where video actually comes from).
2. [`config/aina.yaml`](../configuration) — camera identity, zones, and capability toggles.

## 1. go2rtc stream source

In `media/go2rtc.yaml`, add a stream keyed by the camera name:

```yaml
streams:
  dock_bay:
    url: rtsp://user:pass@192.168.1.50:554/stream1
    on_demand: false
```

- **`url`** — an RTSP (or any ffmpeg-supported) source. `rtsp://`, `http://`, local files, etc.
- **`on_demand: false`** — keep the source open continuously (the perception pipeline expects an
  always-on restream). The default is `true` (open on first consumer).
- After editing, reload the media service — restarts are required to pick up config changes:
  ```bash
  docker compose up -d --force-recreate media
  ```

### Demo camera

The repo ships `loading_dock` looping a packaged clip (perfect for evaluation):

```yaml
loading_dock:
  url: ffmpeg:/videos/demo_short_h264.mp4#copy
```

Point `url` at a real RTSP feed when ready; nothing else in the stack changes.

## 2. aina.yaml camera entry

In `config/aina.yaml`, the same name carries the metadata and zones:

```yaml
cameras:
  - name: dock_bay
    source: rtsp://user:pass@192.168.1.50:554/stream1
    zones:
      - name: dock_entry
        polygon: [[35, 30], [75, 30], [75, 85], [35, 85]]
```

The `source` string in aina.yaml is metadata/documentation — go2rtc owns the real connection.
`zones` define the normalized (0–100) polygons that power zone membership, events, and behaviors.

## 3. Restart perception

```bash
docker compose up -d --force-recreate perception
```

Perception reads aina.yaml at startup: it upserts the camera and its zones into Postgres (visible
in the logs) and begins consuming `rtsp://media:8554/<name>`.

## Requirements & recommendations

- **H.264, `yuv420p`** everywhere. The dashboard plays the stream over **MSE**, which requires H.264
  (the packaged demo clip is already encoded correctly). If your camera only outputs H.265, add an
  ffmpeg transcode leg in go2rtc — see [Media service](../platform/media).
- Use the smallest sub-stream that still lets you recognize the objects you care about. Detection
  runs on a 640×640 input, and the *sub* view is selectable per camera in the UI.
- Auth in the URL: `rtsp://user:pass@host:554/stream1`.

## Verifying a camera

```bash
# go2rtc restream metadata (via the dashboard proxy too):
curl http://localhost:1984/api/streams | jq '."dock_bay"'
# Streamed H.264 over MSE (this is exactly what the <video> tile uses):
curl -o /dev/null -D - "http://localhost:3000/media/api/stream.mp4?src=dock_bay"
# HTTP 200 + Content-Type: video/mp4; codecs="avc1.640029,mp4a.40.2" = good.
```

Then check the Live grid: the tile should show the feed with a **LIVE** badge.