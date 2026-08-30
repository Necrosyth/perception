---
sidebar_position: 3
title: Roadmap
---

# Roadmap

Everything below is mapped to the staged build plan (`AINA_AGENT_BUILD_PROMPT.md`). Status is
shown as shipped / in progress / planned.

## Shipped

| Item | Stage | Notes |
| --- | --- | --- |
| Repo + env bootstrap, GPU passthrough proven | 0 | `docker compose up`, `nvidia-smi` in perception |
| Frigate feature analysis + dashboard clone | 1 | Static React SPA, all views, branded Hypotenuse Analytics |
| Perception orchestrator + module contract | 2 | Dependency graph, dedup, fail-fast — dummy-module tested |
| Config contract (`aina.yaml`) | 2b | Implicit dependency auto-enable, YAML validation |
| Object detection (YOLO, go2rtc ingestion) | 3 | `sv.Detections` output, `one_to_one`/`one_to_many` heads |
| Tracking + jitter elimination | 4 | Numeric harness pass; `trackers` package backend |
| Data layer (Postgres/pgvector) | 5 | All 8 tables; DoD reconstruction query verified on GPU vs live Postgres |
| Dashboard live streams | 10 (part) | Live grid + camera detail real `<video>` over MSE |
| Loitering | 6 | Dwell state machine on zone membership; debounced `(event_type, tracker_id)`; config-toggle proven live (events persisted only when armed) |
| Embeddings & semantic search | 7 | Local OpenCLIP ViT-H/14 (1024-dim, fp16 on GPU) on track crops → `pgvector` HNSW; NL query → structured filters first then KNN; query text embedded by the perception embed RPC; live-proven on the deployed stack |

## In progress

- **Stage 9 — Deployment targets.** `Dockerfile.edge` (Jetson ARM64/L4T) and `Dockerfile.aws`
  (x86_64 CUDA, g4dn/g5) sharing one application code base, plus compute-capability-aware
  TensorRT engine caching. The on-host GPU passthrough + engine-cache volume are live today.
- **Stage 10 — Dashboard wiring (remainder).** Review feed → real `/api/events`; timeline →
  real `segments`; zone editor → writes polygons back; system page → per-camera FPS, module state
  from config, GPU utilization; Birdseye & notifications → real data. **Goal: zero mocks.**

## Planned

- **Stage 8 — one of Face Recognition or ANPR.** Shares upstream crops; proves dedup under a second
  real module.

## Deferred (backlog — do not build until told)

These need real-footage tuning cycles that don't compress into an automated build loop (see
Appendix C of the build prompt):

- Tailgating (vehicle-by-vehicle proxemic pair model)
- Object-theft detection
- Multi-camera re-identification
- ANPR + face-recognition simultaneous performance tuning
- 3D digital twin
- VLM-based verification
- Crowd counting
- Dashboard authentication (v0.1.0-alpha has none — deploy behind a VPN/reverse proxy)

## Testing & quality gates

- `python3 -m pytest perception/tests/ -q` — 96 passing (orchestrator, config, smoothing, tracker
  params, persistence, jitter harness, loitering).
- `npm run build` in `dashboard/` — tsc + Vite must pass before any dashboard change ships.
- Numeric thresholds gate tracking (jitter), never "looks fine".

## Changelog intent

Releases follow the staged plan; each shipped row above became a Definition-of-Done milestone with
executable verification (GPU run + SQL query, not screenshots).