---
sidebar_position: 4
title: Installation
---

# Installation

The primary deployment path is Docker with NVIDIA GPU passthrough.

## Prerequisites

- Docker Engine **with the NVIDIA Container Toolkit** (`nvidia-container-toolkit`) installed and the
  `nvidia` runtime configured. Verify with:
  ```bash
  docker run --rm --runtime=nvidia nvidia/cuda:12.0-base nvidia-smi
  ```
  You should see your GPU listed. If this fails, follow
  [GPU acceleration → troubleshooting](../deployment/gpu-acceleration#troubleshooting).
- `git`, and a machine that can run `docker compose` (v2).
- Enough disk for the Postgres volume and the model files (a `yolo26s` weights file is tens of MB).

## 1. Get the code

```bash
git clone <your-repo-url> aina-sentinel
cd aina-sentinel
```

## 2. Create the environment file

```bash
cp .env.example .env
```

The shipped values are safe development defaults. Adjust at minimum:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEPLOYMENT_TARGET` | `edge` | `edge` (Jetson) or `aws` (g4dn/g5). Selects base image + engine only. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `aina` / `aina_dev_password` / `aina_sentinel` | Postgres credentials. Change the password for anything beyond a dev box. |
| `POSTGRES_PORT` | `5432` | Host port for Postgres (inside the network it is always `5432`). |
| `GO2RTC_PORT` | `1984` | Host port for the go2rtc media API. |
| `API_PORT` / `DASHBOARD_PORT` | `5000` / `3000` | Host ports for the API and dashboard. |
| `PERCEPTION_GPU_INDEX` | `0` | Which GPU device to expose into the perception container. |
| `ENGINE_CACHE` | `./.engine_cache` | Persistent dir for compiled TensorRT engines. |

## 3. Declare your cameras

Cameras are declared in two places that must agree on names:

- **[`media/go2rtc.yaml`](./camera-setup)** — where the stream actually points.
- **[`config/aina.yaml`](../configuration)** — camera metadata, zones, and capability toggles.

The shipped repo includes a **demo camera** `loading_dock` that loops a packaged H.264 clip, so the
dashboard shows live video immediately with zero cameras. Replace it with a real feed when ready
(see [Camera setup](./camera-setup)).

## 4. Bring the stack up

```bash
docker compose up -d --build
```

Wait for postgres to be healthy, then check:

```bash
curl http://localhost:5000/health          # {"status":"ok","database":"ok"}
curl http://localhost:5000/api/cameras    # {"cameras":[{ "name": "loading_dock", ... }]}
```

## 5. Open the dashboard

Browse to `http://<host>:3000/`. You should see the **Live** grid with the `loading_dock` tile
streaming video, and a green **LIVE** badge.

## What just started

| Service | Port | Stands up |
| --- | --- | --- |
| `media` | `1984` | go2rtc; restreams cameras, serves MSE to the dashboard |
| `postgres` | `5432` (host, configurable) | pgvector schema (created below) |
| `api` | `5000` | FastAPI; **applies schema migrations on boot**, then serves the catalog |
| `perception` | — | GPU inference: RTSP → detection → tracking → zones → Postgres |
| `dashboard` | `3000` | React SPA (nginx) proxying `/api` and `/media` |

The perception log should show frames with live detections:

```bash
docker compose logs -f perception
# loading_dock frame=101 detections=10
```

**No GPU?** The stack still runs; perception will log its ingestion error loop. Development is
possible on CPU but is not a supported path.

## Next

- [Updating](./updating) — how to roll a new version safely.
- [Camera setup](./camera-setup) — wiring real RTSP feeds.
- [Configuration](../configuration) — every knob.