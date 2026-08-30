---
sidebar_position: 3
title: Media service
---

# Media service (go2rtc)

The `media` service is [go2rtc](https://github.com/AlexxIT/go2rtc) (`alexxit/go2rtc:latest`),
the restream layer. It opens each camera source **exactly once** and re-serves it to every
consumer — perception over RTSP, the dashboard over MSE.

## Config file

`media/go2rtc.yaml`:

```yaml
api:
  listen: "0.0.0.0:1984"

log:
  level: info

streams:
  loading_dock:
    url: ffmpeg:/videos/demo_short_h264.mp4#copy   # bundled demo, loops forever
  dock_bay:
    url: rtsp://user:pass@192.168.1.50:554/stream1   # real feed
    on_demand: false                                  # keep it streaming continuously
```

### Stream sources

| Source | Example | Notes |
| --- | --- | --- |
| ffmpeg (file loop) | `ffmpeg:/videos/demo_short_h264.mp4#copy` | Loops the packaged H.264 clip — the out-of-the-box "live camera". |
| RTSP | `rtsp://user:pass@host:554/stream1` | Real cameras. |
| Anything ffmpeg reads | `http://…` etc. | go2rtc passes through to ffmpeg. |

**`on_demand: false`** keeps a source open permanently — recommended for camera feeds the
perception pipeline expects to be always-on.

:::note Reloads require recreating the container
go2rtc only reads its config at startup. After editing go2rtc.yaml:
```bash
docker compose up -d --force-recreate media
```
:::

### What the container needs

| Volume | Mount | Purpose |
| --- | --- | --- |
| `./media/go2rtc.yaml` | `/config/go2rtc.yaml:ro` | Config |
| `./media/videos` | `/videos:ro` | Local demo clips referenced by `ffmpeg:/videos/…` |

## Endpoints relevant to Hypotenuse

| Endpoint | Use |
| --- | --- |
| `GET /api/stream.mp4?src=<name>` | H.264 **MSE** for the dashboard `<video>` tile (`video/mp4; codecs="avc1.640029,mp4a.40.2"`) |
| `GET /api/streams` | Per-stream producer/consumer/bitrate JSON (diagnostics) |
| `rtsp://media:8554/<name>` | RTSP restream consumed by the perception container |

Stream metadata ISM catalogue notes: only the `.mp4` MSE form is served by this go2rtc build —
`/api/stream?src=` (no suffix) is not available here.

## Streaming rules (why H.264 matters)

- The dashboard plays video over **MSE**, which requires **H.264 (`yuv420p`)**. The demo clip is
  encoded that way (`libx264`, `yuv420p`, `faststart`).
- Non-H.264 (e.g. H.265) cameras need a transcode leg in go2rtc before they reach the tile.
- Everything the browser touches must stay in this codec; the RTSP restream for perception is
  consumed by ffmpeg and tolerates more, but keeping one H.264 encode for all consumers is the
  simplest correct setup.

## Verifying

```bash
# metadata for every stream (producers, consumers, PTS, bitrate):
curl http://localhost:1984/api/streams | jq '."loading_dock"'

# the exact request the <video> tile makes (through the dashboard proxy):
curl -o /dev/null -D - "http://localhost:3000/media/api/stream.mp4?src=loading_dock"
# HTTP/1.1 200  Content-Type: video/mp4; codecs="avc1.640029,mp4a.40.2"
```