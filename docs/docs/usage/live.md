---
sidebar_position: 1
title: Live view
---

# Live view

The **Live** page is the operator's main screen: a grid of every enabled camera streaming in
real time over MSE.

## What you see

- **Camera tiles** with live video, per-camera **LIVE** / **OFFLINE** badges, a small HUD
  (camera name, class-aware palette, zones/objects overlays) and a **motion detected** indicator.
- The subtitle shows the streaming census: *"N of M cameras streaming"*, plus `· mock` when the
  UI falls back to demo data (an API that has not registered any cameras yet).
- Clicking a tile opens **Camera Detail** with the larger viewer.

## How the tile gets its stream

The tile renders a real `<video>` when the camera is `enabled` and reported by the API:

```ts
src = streamUrl(id) // "/media/api/stream.mp4?src=" + id
// autoPlay, muted, playsInline, object-cover
```

That URL goes through the dashboard's nginx at `/media/*`, which forwards to go2rtc's MSE endpoint
(`/api/stream.mp4?src=loading_dock` → `video/mp4; codecs="avc1.640029,mp4a.40.2"`).

**Signal lost** — an `onError` on the `<video>` flips the tile to **signal lost** (background
black, placeholder icon), so a dead camera never shows stale or fake content.

## Behavior details

- Tiles that fail are shown as **signal lost**, not mock footage. The mock scene is rendered *only*
  when the whole camera catalog is unavailable (`!fromApi`).
- **Zones** and **objects** overlays come from `CameraDetail`'s controls; feeds loop (ffmpeg
  `#copy` demo) or stream live (real RTSP) without user action.

## If a tile is offline

1. Check the camera source in [`media/go2rtc.yaml`](../platform/media): `curl :1984/api/streams`.
2. Confirm the stream URL via the dashboard proxy (see [Camera setup](../intro/camera-setup#verifying-a-camera)).
3. Confirm the API lists it as enabled: `curl :5000/api/cameras`.
4. Restart the media service after config edits: `docker compose up -d --force-recreate media`.