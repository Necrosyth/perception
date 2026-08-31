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

## Quick start

Only two host tools are required: **Docker** (with the Compose v2 plugin and the
NVIDIA Container Toolkit) and **uv**. Everything else — the API, perception
runtime, dashboard, docs, and database — builds and runs inside containers from
`deploy/docker-compose.yml`. There is no host-side `pip`, `npm`, or `apt`
toolchain.

Run the whole stack with one command:

```bash
./run.sh
```

The script first probes host prerequisites (Docker daemon, Compose plugin, uv,
an `.env`, and every GPU requirement: present `nvidia-smi`, enough VRAM,
compute capability, and the Docker `nvidia` runtime), then builds and starts the
stack in the background. It prints the live endpoints when ready:

- API health: `http://localhost:5000/health`
- Dashboard: `http://localhost:3000`
- go2rtc (media): `http://localhost:1984/api`
- Docs: `http://localhost:3001`

### `run.sh` subcommands

| Command              | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `./run.sh` / `up`    | check prerequisites → build → start the stack                    |
| `./run.sh down`      | stop the stack (volumes `pgdata` / `engine_cache` are retained)  |
| `./run.sh status`    | container states + endpoint summary                              |
| `./run.sh logs [-f]` | follow stack logs                                                |
| `./run.sh check`     | prerequisites + GPU probe only (no start)                        |
| `./run.sh check --json` | machine-readable probe report (`gpu_count`, VRAM, compute cap) |

### GPU prerequisites checked by `run.sh`

| Requirement                        | Why                                                        |
| ---------------------------------- | ---------------------------------------------------------- |
| `nvidia-smi` present + a GPU       | perception runs on CUDA                                    |
| ≥ 2 GiB VRAM (4 GiB recommended)   | YOLO26s @ 640 with TensorRT                                |
| compute capability ≥ 6.0           | CUDA 12 / ultralytics floor                                |
| Docker `nvidia` runtime registered | NVIDIA Container Toolkit wired into `dockerd`              |

If a check fails, the script prints an exact remediation step (driver install,
`nvidia-ctk runtime configure --runtime=docker`, etc.) and exits non-zero.

> First run: `run.sh` creates `.env` from `.env.example` if absent — edit the
> `CAM_*` camera sources there before going live.

### Manual (equivalent, without the script)

```bash
cp .env.example .env        # edit camera sources
docker compose up --build  # from the repo root
```

## Non-negotiable architecture rules (from the build prompt)

1. No perception module imports another module — communication only via `requires()`/`produces()` on the orchestrator.
2. Shared upstream results are computed once per frame (enforced by the dependency graph).
3. Everything toggled by `config/aina.yaml`, never by code changes.
4. YOLO26 is the default detector (Ultralytics, licensed).
5. No visible jitter at 10–12 FPS (time-based tracker params, measured-dt Kalman, One Euro render smoothing, render interpolation).
6. Dockerized GPU passthrough is the primary path (edge = Jetson, aws = g4dn/g5); device is a config value, not a code branch.
7. Everything branded Hypotenuse Analytics.