---
sidebar_position: 2
title: Review (events)
---

# Review

The **Review** page is the events/history feed — the operational log of what perception decided.

## Data model

Everything lands on the Postgres `events` table:

| `event_type` | What it means | Fields you'll see |
| --- | --- | --- |
| `entered_zone` | A track entered a zone polygon | camera, zone, track id, `started_at`, `ended_at` (null until it leaves) |
| `left_zone` | That same track left the zone (closes the `entered_zone` row's `ended_at`) | |
| `loitering` *(planned, Stage 6)* | Dwell-time exceeded in a zone | debounced per `(event_type, tracker_id)` |

`left_at` on the closed event row is the source of truth for *"how long was the object in the
zone"* — reconstruction queries use the `tstzrange` interval:

```
tstzrange(e.started_at, e.ended_at) && tstzrange(from, to)
```

The API endpoint:

```
GET /api/events?camera=loading_dock&since=2026-08-30T00:00:00Z&limit=100
```

Returns newest-first rows `{camera, zone, global_track_id, event_type, started_at, ended_at, severity}`.
See [API reference](../platform/api).

:::note Alpha state
In v0.1.0-alpha the Review feed is a **mock** list (activity chips like `person · 09:22`) that
links into the review view. Wiring the feed to the real `/api/events` rows is part of
[Stage 10](../development/roadmap). The evidence the API *can* serve it is already live — point
your browser or `curl` at `:5000/api/events` today.
:::

## Typical workflow

1. Open **Review** (events feed) — scan the newest `entered_zone` / `left_zone` rows per camera.
2. Click a chip → jump to the camera's recording/timeline tab to confirm with footage.
3. To reconstruct a specific question yourself, run the DoD query
   ([Data layer](../platform/data-layer#querying)):

   ```sql
   -- which tracks were active in dock_entry between A and B?
   SELECT c.name, z.name, t.global_track_id, t.class_name,
          e.started_at, e.ended_at, t.last_box, t.peak_confidence
   FROM events e
   JOIN tracks t ON t.id = e.track_id
   JOIN cameras c ON c.id = e.camera_id
   LEFT JOIN zones z ON z.id = e.zone_id
   WHERE e.event_type = 'entered_zone'
     AND c.name = 'loading_dock'
     AND tstzrange(e.started_at, e.ended_at) && tstzrange('A', 'B');
   ```