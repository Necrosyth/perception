---
sidebar_position: 1
title: Data layer
---

# Data layer

PostgreSQL with the **pgvector** extension. The schema is exactly as specified in the architecture
doc and is applied by numbered migrations in `platform/migrations/` on API startup (recorded in
`schema_migrations`).

:::note Design rule
No per-behavior tables. Behaviors are `event_type` values on the `events` table, so new behavior
modules ship **without migrations**.
:::

## Tables

| Table | Purpose |
| --- | --- |
| `cameras` | Camera identity: name, source, enabled. Upserted by perception on startup. |
| `zones` | Per-camera normalized polygons (name, polygon). One row per zone. |
| `tracks` | One row per tracked object. Upserted per frame; finalized after `finalize_timeout_s` unseen. |
| `detections` | Sampled per-frame observations: `global_track_id`, class, box, confidence, timestamp. |
| `events` | Stateful occurrences: `event_type`, started/ended, camera/zone/track links, severity. |
| `embeddings` | CLIP vectors for semantic search (Stage 7), pgvector columns. |
| `segments` | Recorded clip segments (recording + timeline scrubber — Stage 10). |
| `incidents` | Open incidents (unresolved-alert semantics; red reserved for these). |

## The track lifecycle

1. Perception detects → tracks; the tracker assigns a **stable `global_track_id`** (deterministic
   `uuid5`) and upserts the `tracks` row each frame the object lives.
2. Sampled `detections` rows are inserted per detection sampling period (linked back to the track).
3. When the object is unseen for `finalize_timeout_s`, the track row is **finalized**
   (`ended_at` set) — the "closed track" state.

## Zone events & reconstruction

Zone membership transitions write `events` rows. A track entering `dock_entry` creates an
`entered_zone` row; leaving closes it (its `ended_at`). **`entered_at..left_at` is the source of
truth** for any "how long / which / when" question about zone occupancy.

### The reconstruction query {#querying}

```sql
-- "What tracks were active in zone dock_entry between A and B?"
SELECT c.name, z.name, t.global_track_id, t.class_name,
       e.started_at, e.ended_at, t.last_box, t.peak_confidence
FROM events e
JOIN tracks t ON t.id = e.track_id
JOIN cameras c ON c.id = e.camera_id
LEFT JOIN zones z ON z.id = e.zone_id
WHERE e.event_type = 'entered_zone'
  AND c.name = 'loading_dock' AND z.name = 'dock_entry'
  AND tstzrange(e.started_at, e.ended_at) && tstzrange('A', 'B')
ORDER BY e.started_at;
```

Exposing this over HTTP with the same semantics:

```
GET /api/tracks?camera=loading_dock&zone=dock_entry&from=A&to=B
```

## Embeddings

Stage 7 (schema already ready): `embeddings` carries vector columns for pgvector similarity. The
pipeline (local CLIP encoder, queued off the per-frame hot path, thumbnail = track's
best-confidence frame) fills these once landed; the API then filters structured predicates first and
runs vector similarity within the narrowed set.

## Working with the DB

```bash
# psql into the live DB from the host
docker compose exec postgres psql -U aina -d aina_sentinel

# row counts sanity check
SELECT (SELECT count(*) FROM tracks) tracks,
       (SELECT count(*) FROM detections) det,
       (SELECT count(*) FROM events) events,
       (SELECT count(*) FROM tracks WHERE ended_at IS NOT NULL) finalized;
```

Persistence configuration: [Persistence](../configuration/persistence). API access:
[API reference](./api).