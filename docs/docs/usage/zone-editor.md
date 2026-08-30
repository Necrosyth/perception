---
sidebar_position: 4
title: Zone editor
---

# Zone editor

The **Zones** page is the canvas where a camera's zones are drawn.

## How zones work

- A zone is a **normalized polygon** — every vertex coordinate is a percent of the frame
  (0–100). Example dock staging lane:
  ```yaml
  zones:
    - name: dock_entry
      polygon: [[35, 30], [75, 30], [75, 85], [35, 85]]
  ```
- Zones live under each camera in `config/aina.yaml` and are upserted into Postgres by
  perception on startup and by the API migration.
- Zone membership is computed by the perception `zones` module (`[tracks]` → membership);
  crossings become `entered_zone` / `left_zone` events.
- Behaviors (e.g. planned loitering) apply *inside* zones, so draw zones where the behavior
  should be enforced.

## Alpha status

The page renders a **mock canvas** in v0.1.0-alpha. The wiring plan (Stage 10):

1. Load a real camera frame and overlay its zones from `/api/zones`
   (`GET /api/zones` → `{camera, name, polygon}`).
2. Let the operator edit/add zones with drag handles (konva-based canvas).
3. **Write polygons back** to `config/aina.yaml` (or a DB location) so perception and zones stay
   consistent on next restart.

Until Step 3 lands, edit polygons **by hand** in `config/aina.yaml`, then
`docker compose up -d --force-recreate perception` to re-upsert zones.

## Manual reference

A current zone as stored in Postgres:

```sql
SELECT z.id, c.name, z.name, z.polygon
FROM zones z JOIN cameras c ON c.id = z.camera_id ORDER BY c.name, z.name;
-- dock_entry polygon: [[35.0,30.0],[75.0,30.0],[75.0,85.0],[35.0,85.0]]
```