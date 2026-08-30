---
sidebar_position: 4
title: Zones
---

# Zones

```yaml
cameras:
  - name: loading_dock
    source: rtsp://user:pass@192.168.1.50:554/stream1
    zones:
      - name: dock_entry
        polygon: [[0, 0], [100, 0], [100, 100], [0, 100]]

capabilities:
  zones:
    enabled: true
```

## Polygon format

- Every vertex is a **percent** of frame width/height, 0–100. `[x-percent, y-percent]`.
- Quadrilaterals are typical, but any closed polygon is fine (3+ points).
- Coordinates are stored as-is in Postgres and reused verbatim for membership tests — no
  renormalization happens between config, DB, and runtime.

## Membership & events

The perception `zones` module (`requires: [tracks]`) tests each tracked box's center (or box)
against every enabled zone polygon per frame and produces **zone membership**:

| Transition | Event row |
| --- | --- |
| track center enters polygon | `event_type='entered_zone'`, `started_at` set |
| track center leaves polygon | closes the open row: `ended_at` set (displayed as a `left_zone` close) |

The `entered_at..left_at` interval is the source of truth for reconstruction
("how long was it in the zone?"), and `events.zone_id` links to `zones.id`.

## Caveats worth knowing

- Zones are **per camera**. Draw them against that camera's actual still frame — the same
  percentage coordinates translate differently on a wide vs. telephoto view.
- Zones must be defined before they can produce events. Editing polygons requires recreating
  perception so the upsert reaches Postgres:
  ```bash
  docker compose up -d --force-recreate perception
  ```
- The UI zone editor is on the roadmap ([Usage → Zone editor](../usage/zone-editor)). Until the
  write-back path lands, edit polygons in YAML by hand.

## Verify

```bash
curl http://localhost:5000/api/zones
# {"zones": [{"camera": "loading_dock", "name": "dock_entry", "polygon": [[0.0,0.0],[100.0,0.0],[100.0,100.0],[0.0,100.0]], ...}]}
```