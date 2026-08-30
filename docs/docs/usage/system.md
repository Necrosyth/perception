---
sidebar_position: 5
title: System & health
---

# System & health

The **System** page reports the platform's operational state. In v0.1.0-alpha much of the data is
already available from the API even though some dashboard panels still render demo data.

## What's live today

| Source | Endpoint | Returns |
| --- | --- | --- |
| API liveness | `GET /health` | `{"status":"ok","database":"ok"}` — DB degrades to `unreachable`, never 500s |
| Version / branding | `GET /` | `{product, company, version}` |
| Deployment target | `GET /config` | `{deployment_target}`, value `edge` or `aws` |
| Cameras | `GET /api/cameras` | id, name, source, enabled |
| Zones | `GET /api/zones` | id, camera, name, polygon |
| Tracks-in-window | `GET /api/tracks?camera=&zone=&from=&to=` | reconstruction rows |
| Events | `GET /api/events` | newest-first event rows |
| Media | go2rtc `GET /api/streams` (via `:1984`) | per-stream producers/consumers/bitrate |
| Perception | container logs | per-frame detections, track finalization |

## Planned (Stage 10) panels

- **Per-camera FPS** — measured inference rate per stream.
- **Module state** — each enabled/disabled capability, read straight from the config the
  orchestrator actually loaded (`config/aina.yaml`), plus the `requires`/`produces` graph.
- **GPU utilization** — `nvidia-smi` inside the perception container surfaced via `GET /config`:
  utilization %, VRAM, temp, and the active compute capability + cached engine.

## The health model

The API never fails closed on a missing database — `/health` reports `database: unreachable` and
query endpoints return `503 {"detail":"database unreachable"}`. This means **perception keeps
working** (frames are still analyzed) even when Postgres is down; the write path simply drops rows
until the DB returns (see [Persistence resilience](../configuration/persistence#when-the-database-is-down)).