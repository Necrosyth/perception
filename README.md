# Surveillance Intelligence Lab — v0.1.0-alpha

**Surveillance Intelligence Lab** is the surveillance intelligence platform from **Hypotenuse Analytics** — *Predict. Protect. Verify.*

This is the staged build per `AINA_AGENT_BUILD_PROMPT.md`. Read that file first; every stage's Definition of Done is the source of truth.

## Layout

```
├── reference/frigate       # read-only Frigate NVR checkout (analysis only; never imported)
├── docs/                   # FRIGATE_FEATURE_ANALYSIS.md + design/backlog notes
├── media/                  # go2rtc restream config
├── perception/             # module orchestrator (PerceptionModule contract, config loader)
│   ├── modules/            #   object_detection, tracking, behavior_loitering, embeddings, ...
│   └── smoothing/          #   One Euro filter, time-scaled tracker params
├── platform/api/           # FastAPI
├── platform/migrations/    # Postgres/pgvector schema (cameras, zones, tracks, detections, events, embeddings, segments, incidents)
├── dashboard/              # React 19 + Vite static SPA (no SSR)
├── deploy/                 # Dockerfiles (edge + aws) and docker-compose.yml
└── config/aina.yaml        # the single user-editable deployment config
```

## Quick start (Stage 0 skeleton)

```bash
cp .env.example .env
docker compose up --build
```

- API health: `http://localhost:5000/health`
- Dashboard: `http://localhost:3000`
- go2rtc API: `http://localhost:1984/api`

## Non-negotiable architecture rules (from the build prompt)

1. No perception module imports another module — communication only via `requires()`/`produces()` on the orchestrator.
2. Shared upstream results are computed once per frame (enforced by the dependency graph).
3. Everything toggled by `config/aina.yaml`, never by code changes.
4. YOLO26 is the default detector (Ultralytics, licensed).
5. No visible jitter at 10–12 FPS (time-based tracker params, measured-dt Kalman, One Euro render smoothing, render interpolation).
6. Dockerized GPU passthrough is the primary path (edge = Jetson, aws = g4dn/g5); device is a config value, not a code branch.
7. Everything branded Hypotenuse Analytics.