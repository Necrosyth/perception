---
sidebar_position: 2
title: API reference
---

# API reference

The `api` service is a FastAPI app. In normal use the dashboard's nginx proxies `/api/*`, so calls
can go through either `:5000` or `:3000/api/*`.

Base URL in the stack: `http://api:5000`.

## Identity & health

### `GET /`

Product identity. `200`

```json
{ "product": "Surveillance Intelligence Lab", "company": "Hypotenuse Analytics", "version": "0.1.0-alpha" }
```

### `GET /health`

Liveness + database reachability. Never 500s; a down DB reports `unreachable`.

```json
{ "status": "ok", "database": "ok" }
```

### `GET /config`

Echoes what the container saw in env/config — deployment target and config path.

```json
{ "deployment_target": "edge", "config_path": "/etc/aina/aina.yaml" }
```

## Catalog

### `GET /api/cameras`

```json
{ "cameras": [ { "id": "fab838cb-…", "name": "loading_dock", "source": "/srv/video/demo_short_h264.mp4", "enabled": true } ] }
```

### `GET /api/zones`

```json
{ "zones": [ { "id": "…", "camera": "loading_dock", "name": "dock_entry", "polygon": [[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]] } ] }
```

## Reconstruction

### `GET /api/tracks`

**"Which tracks were active in zone X between A and B?"** — the Stage 5 DoD query. Zone membership
uses `tstzrange(entered_at, left_at) && tstzrange(from, to)`.

Query params:

| Param | Required | Description |
| --- | --- | --- |
| `camera` | yes | Camera name |
| `zone` | no | Zone name (omit for everything in the window) |
| `from` | yes | Window start, ISO-8601 (e.g. `2026-08-30T12:00:00Z`) |
| `to` | yes | Window end, ISO-8601 |

```json
{
  "window": { "from": "2026-08-30T12:00:00Z", "to": "2026-08-30T13:00:00Z" },
  "tracks": [
    { "camera": "loading_dock", "zone": "dock_entry", "global_track_id": "…",
      "class_name": "person", "entered_at": "…", "left_at": "…",
      "last_box": [x, y, w, h], "peak_confidence": 0.87 }
  ]
}
```

### `GET /api/events`

Newest-first event feed.

| Param | Required | Description |
| --- | --- | --- |
| `camera` | no | Filter by camera name |
| `since` | no | Only events starting at/after this ISO-8601 time |
| `limit` | no | 1–1000, default 100 |

```json
{ "events": [ { "camera": "…", "zone": "…", "global_track_id": "…",
                "event_type": "entered_zone", "started_at": "…", "ended_at": null,
                "severity": "info" } ] }
```

## Errors

- **Database down:** catalog/reconstruction endpoints return `503 {"detail": "database unreachable"}`.
  `/health` still answers `200` (with `database: unreachable`).
- **Missing required params:** FastAPI's standard `422` validation response.

## Web docs

FastAPI auto-serves interactive docs at `http://localhost:5000/docs` and OpenAPI JSON at
`http://localhost:5000/openapi.json`.

## Media streams (go2rtc, not the API)

Live video endpoints live on the `media` service, proxied by the dashboard as `/media/*`:

| URL (via dashboard nginx) | Service route | What it serves |
| --- | --- | --- |
| `GET /media/api/stream.mp4?src=<name>` | go2rtc `/api/stream.mp4?src=` | H.264 MSE the `<video>` tile plays |
| `GET /media/api/streams` | go2rtc `/api/streams` | Per-stream producers/consumers/bitrate |

See [Media service](./media).