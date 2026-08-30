---
sidebar_position: 5
title: Updating
---

# Updating

Surveillance Intelligence Lab is `v0.1.0-alpha`; treat every update as potentially breaking.

## Rolling a new version

```bash
git pull                      # (or fetch the new release tag)
docker compose up -d --build  # rebuild images with --build
```

Image layer caching makes rebuilds fast; only changed layers recompile.

## What gets preserved

| Data / state | Where | Survives an update? |
| --- | --- | --- |
| Detections, tracks, events | `pgdata` volume | ✅ yes |
| Compiled TensorRT engines | `engine_cache` volume | ✅ yes |
| Config | `config/aina.yaml`, `.env` | ✅ yes (files, not images) |
| Camera restream config | `media/go2rtc.yaml` | ✅ yes |

## About schema migrations

The `api` container applies numbered SQL files from `platform/migrations/` **on startup** and
records each applied migration in `schema_migrations`. There is nothing to run by hand:

```bash
docker compose logs api | grep migration
# [INFO] aina.api: schema migrations applied: ['001_schema.sql']
```

## Rolling back

There are no release channels yet. To roll back:

```bash
git checkout <previous-tag-or-commit>        # or restore config/aina.yaml + media/go2rtc.yaml
docker compose up -d --build --force-recreate
```

Two caveats:

- A downgrade does **not** automatically revert database migrations. If `001_schema.sql` changed,
  apply the necessary DDL manually.
- If the perception image changed its CUDA / engine requirements, `docker compose build perception`
  will re-bake the engine; the `engine_cache` volume may hold a stale engine for the old image —
  the container only rebuilds it when the compute capability has no matching cached engine.