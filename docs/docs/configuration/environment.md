---
sidebar_position: 8
title: Environment & Docker
---

# Environment & Docker

The Compose stack is parameterized by `.env` (copy of `.env.example`).

## Variables

| Variable | Default | Applies to | Purpose |
| --- | --- | --- | --- |
| `DEPLOYMENT_TARGET` | `edge` | api, perception | `edge` / `aws` — base image + cached engine selection only |
| `POSTGRES_USER` | `aina` | postgres, api, perception | Postgres user |
| `POSTGRES_PASSWORD` | `aina_dev_password` | all | **Change for production** |
| `POSTGRES_DB` | `aina_sentinel` | all | Database name |
| `POSTGRES_PORT` | `5432` | postgres | **Host-side** mapped port (in-network it is always `5432`) |
| `GO2RTC_PORT` | `1984` | media | Host port for go2rtc HTTP/API |
| `API_PORT` | `5000` | api | Host port for FastAPI |
| `DASHBOARD_PORT` | `3000` | dashboard | Host port for the UI |
| `PERCEPTION_GPU_INDEX` | `0` | perception | GPU device index exposed into perception |
| `ENGINE_CACHE` | `./.engine_cache` | perception | Persisted TensorRT engine cache |
| `AINA_MODELS_DIR` | `/etc/aina/models` | perception | Model weights mount target |
| `AINA_INGEST` | (runtime env) | perception | `rtsp` — consume go2rtc restreams |
| `GO2RTC_HOST` / `GO2RTC_RTSP_PORT` | `media` / `8554` | perception | Where perception pulls RTSP from |

## The compose service wiring (reference)

| Service | Image / build | Key options |
| --- | --- | --- |
| `media` | `alexxit/go2rtc:latest` | mounts `./media/go2rtc.yaml:/config/go2rtc.yaml:ro` + `./media/videos:/videos:ro` |
| `postgres` | `pgvector/pgvector:pg16` | `pgdata` volume, `pg_isready` healthcheck |
| `api` | `deploy/Dockerfile.api` | applies migrations on boot; `depends_on postgres (healthy)` |
| `perception` | `deploy/Dockerfile.perception` | **`runtime: nvidia`**, `engine_cache` volume, models mount, postgres/media/api deps |
| `dashboard` | `deploy/Dockerfile.dashboard` | nginx; proxies `/api` → `api:5000` and `/media` → `media:1984` |

## GPU passthrough

```yaml
perception:
  runtime: nvidia
  environment:
    NVIDIA_VISIBLE_DEVICES: all
    NVIDIA_DRIVER_CAPABILITIES: compute,utility
  volumes:
    - engine_cache:/.engine_cache
```

- Requires the **NVIDIA Container Toolkit** at the Docker level.
- `ENGINE_CACHE` is a persistent volume so compiled engines survive redeploys; engines are keyed by
  compute capability (see [GPU acceleration](../deployment/gpu-acceleration)).
- `PERCEPTION_GPU_INDEX` picks the physical GPU for multi-GPU hosts.

## Health & lifecycle

- Postgres runs a `pg_isready` healthcheck; the api container waits for `service_healthy`.
- All services `restart: unless-stopped`.
- Logs are capped per service (media `max-size: 10m`).
- A down database must not 500 the API — it reports `unreachable` and query endpoints return
  `503` (see [System & health](../usage/system)).