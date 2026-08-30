---
sidebar_position: 1
title: Docker deployment
---

# Docker deployment

The primary (and currently only) deployment path is Docker Compose. The compose file doubles as
the reference wiring for all five services.

## Quick reference

```bash
cp .env.example .env
docker compose up -d --build        # build + start everything
docker compose ps                   # expect 5 services, postgres & api healthy
docker compose logs -f perception   # watch live detections
docker compose down --volumes       # tear down INCLUDING the pgdata/engine_cache volumes
```

## Services detail

### `media`
```yaml
image: alexxit/go2rtc:latest
ports: ["${GO2RTC_PORT:-1984}:1984"]
volumes:
  - ./media/go2rtc.yaml:/config/go2rtc.yaml:ro
  - ./media/videos:/videos:ro
```

### `postgres`
```yaml
image: pgvector/pgvector:pg16
environment:
  POSTGRES_USER: ${POSTGRES_USER:-aina}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-aina_dev_password}
  POSTGRES_DB: ${POSTGRES_DB:-aina_sentinel}
volumes: ["pgdata:/var/lib/postgresql/data"]
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-aina} -d ${POSTGRES_DB:-aina_sentinel}"]
```

### `api`
Builds from `deploy/Dockerfile.api`. Applies `platform/migrations/*.sql` on boot; the migration is
recorded so it runs once. Waits for `postgres: service_healthy`.

### `perception`
Builds from `deploy/Dockerfile.perception`. The GPU service — see
[GPU acceleration](./gpu-acceleration) for the passthrough block, the `engine_cache` volume, and
the models mount. Also carries `POSTGRES_*` env (binds via host DNS to `postgres:5432`) and
`GO2RTC_HOST=media / GO2RTC_RTSP_PORT=8554` for the RTSP restream.

### `dashboard`
Builds from `deploy/Dockerfile.dashboard` (React → static → nginx). nginx proxies:
- `/api/*` → `http://api:5000`
- `/media/*` → `http://media:1984/` (trailing slash matters — see [Media service](../platform/media))

## Healthcheck behavior

- Postgres has a `pg_isready` healthcheck; `api` gates on `service_healthy`.
- `api` itself is healthy once it has applied migrations and can answer `/health`.
- A down DB degrades scores rather than failing the API (503s on query endpoints); perception
  keeps running and drops writes until the DB returns.

## Volumes

| Volume | Holds | Lifecycle |
| --- | --- | --- |
| `pgdata` | All detection/track/event data | Keep for upgrades; `--volumes` destroys it. **Back it up.** |
| `engine_cache` | Compiled TensorRT engines per compute-capability | Safe to keep; rebuilt automatically when capability is unmatched |
| host `./.engine_cache` | (env `ENGINE_CACHE`) | See GPU page |

## Browsing the resulting UI

- Dashboard: `http://<host>:3000/`
- API: `http://<host>:5000/docs` (interactive Swagger)
- go2rtc: `http://<host>:1984/`

## Reverse proxy / TLS

Put an authenticated TLS reverse proxy in front of `3000` for anything beyond a lab (v0.1.0-alpha
has no built-in auth — see [Planning](../intro/planning#security-model-alpha)).