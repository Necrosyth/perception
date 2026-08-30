---
sidebar_position: 8
title: Network requirements
---

# Network requirements

## Ports (host-facing)

| Port | Service | Why it is exposed |
| --- | --- | --- |
| `3000` | `dashboard` (nginx) | The operator UI. `DASHBOARD_PORT` in `.env`. |
| `5000` | `api` (FastAPI) | REST API. `API_PORT`. Behind the dashboard proxy in normal use. |
| `1984` | `media` (go2rtc) | go2rtc web/API (`/api/stream.mp4`, `/api/streams`, …). `GO2RTC_PORT`. |
| `5432` | `postgres` | PostgreSQL host port. `POSTGRES_PORT`. Only for tooling/psql from the host. |
| `8554` | `media` (internal) | RTSP restream inside the Docker network — **not** published to the host. |

The dashboard also proxies internally:
- `/api/*` → `api:5000`
- `/media/*` → `media:1984` (go2rtc API/MSE)

so an operator who only exposes `3000` still gets cameras and data — as long as the browser can
reach `3000`.

## Firewall guidance

- **Publish only what you use.** The minimum is `3000` for the dashboard.
- Do **not** publish `5432`, `8554` (not even inside the LAN) unless you genuinely need it.
- v0.1.0-alpha has **no authentication** — see [Planning → security](./planning#security-model-alpha).
  Put the stack behind a VPN, an authenticated reverse proxy, or at minimum a host firewall.

## Camera network

- The `media` container must reach every camera's RTSP endpoint. No camera needs to reach the platform.
- go2rtc restreams are local to the Docker network (`media:8554`, `media:1984`) — the browser never
  talks to a camera directly, only to the dashboard, which proxies `/media`.
- For probe/verification you need to reach the go2rtc HTTP API. Expose `1984` to your workstation
  if you want `/api/streams` diagnostics, and remember the MSE URL shape used by the dashboard:
  `/media/api/stream.mp4?src=<name>` (the `/media` prefix is stripped by nginx).

## Throughput

- Deterministic: go2rtc opens each source once and fans out packets; Mbps per camera is roughly the
  camera's own output bitrate (the demo clip is ~12 Mbps). Multiple dashboard viewers share the one
  restream, so client bandwidth is the main variable.
- Perception consumes the restream via RTSP; Postgres writes a few rows/second per camera outside
  the video path.