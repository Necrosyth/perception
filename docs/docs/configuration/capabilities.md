---
sidebar_position: 7
title: Capabilities (opt-in)
---

# Optional capabilities

Everything here is **opt-in and off by default**. Turning one on auto-enables the minimum
dependency chain the orchestrator derives from `requires()`/`produces()` — you do not need to know
the graph.

```yaml
capabilities:
  face_recognition:
    enabled: false
  anpr:
    enabled: false
  behavior:
    loitering:
      enabled: false
      dwell_threshold_seconds: 600
  semantic_search:
    enabled: false
    embedding_model: local_clip
```

## Loitering — Stage 6

A `PerceptionModule` that `requires: [tracks, zone_membership]` and produces dwell-time events.

- Fires once per loitering episode, per zone — debounced by `(event_type, tracker_id)`, never once
  per frame past the threshold.
- `dwell_threshold_seconds: 600` — how long a track must remain in a zone to count.
- Persisted as `event_type='loitering'` on the `events` table (no per-behavior tables anywhere —
  event types generalize without migrations).
- This stage also proves the two house rules under a real module, not dummy tests:
  1. **Nothing is coupled** — loitering never imports detection or tracking code, only typed
     upstream data.
  2. **Config-toggleable** — flipped off, it produces zero residual behavior or log output; flipped
     on, events land in Postgres.

## Semantic search — Stage 7

- Local CLIP-style encoder (Jina CLIP or OpenCLIP — interface swappable) on each finalized track's
  best-confidence thumbnail, **async, off the per-frame hot path**.
- `POST /api/search`: an LLM turns the query into `{structured_filters, semantic_text}`; the API
  applies structured filters first (camera/zone/time), then pgvector similarity inside that
  narrowed set.
- `embedding_model: local_clip` — must stay local; no cloud embedding APIs.

## Face recognition — Stage 8

Consumes person/face crops provided upstream (shared with anything else that needs face crops —
computed once per frame by the orchestrator).

## ANPR — Stage 8

Consumes vehicle crops plus a shared `text_regions` producer (shared with generic OCR if both are
enabled — the text-region-localization step runs once, not once per consumer).

## Deferred (never build unless told)

Tailgating, object-theft, multi-camera re-identification, ANPR + face-recognition simultaneous
performance tuning, 3D digital twin, VLM verification, crowd counting — see
[Roadmap](../development/roadmap). These need real-footage tuning cycles that don't compress into
an autonomous build loop.