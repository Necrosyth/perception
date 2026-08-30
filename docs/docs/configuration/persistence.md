---
sidebar_position: 6
title: Persistence
---

# Persistence (data layer)

```yaml
persistence:
  enabled: true
  detection_sampling: 5     # persist 1 in N detection rows
  finalize_timeout_s: 5.0   # finalize a track after it has been unseen this long
  # database: {host, port, user, password, dbname}   # optional override
```

The persistence module sinks the orchestrator's outputs into PostgreSQL (pgvector). The schema is
documented fully in [Data layer](../platform/data-layer). Highlights relevant to configuring it:

## What gets written, and how often

| Output | Rows | Cadence |
| --- | --- | --- |
| `cameras`, `zones` | 1 each | Upserted on perception startup |
| `tracks` | 1 per tracked object | Upserted per frame the track is alive; finalized after `finalize_timeout_s` unseen |
| `detections` | `1 in N` | Sampled: `detection_sampling: 5` keeps 1 in 5 rows (≈2 rows/s/camera at 10 FPS) |
| `events` | `entered_zone` / `left_zone` | On zone transitions |

## The batching trade-off

The writer batches statements in a single ordered transaction and commits every `COMMIT_EVERY`
statements. This protects the database from a commit-per-op storm (at ~500 ops/s a naive writer
dropped ~99% of rows). The FIFO order inside a batch is preserved exactly, so track/detection
timeline order survives.

## When the database is down

- The API reports `database: unreachable` on `/health` (it never 500s).
- Query endpoints return `503 {"detail":"database unreachable"}`.
- **Perception keeps analyzing** — frames are still processed; the persistence write path drops
  rows until Postgres returns. Runtime never crashes on a missing DB.

## Connection

Persistence reads the standard `POSTGRES_HOST / PORT / USER / PASSWORD / DB` env vars (set on the
perception service in `docker-compose.yml`); the optional `persistence.database` block overrides
them. Inside the compose network the host is `postgres`, port `5432` — never the host-side mapped
port.

```bash
# quick sanity — event counts from the live DB:
docker compose exec postgres psql -U aina -d aina_sentinel -c \
  "SELECT (SELECT count(*) FROM tracks) tracks, (SELECT count(*) FROM detections) det,
         (SELECT count(*) FROM events) events;"
```