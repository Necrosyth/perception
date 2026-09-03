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

## Prebuilt GHCR images (run anywhere, no build)

All five AIna services are published as container images on the GitHub
Container Registry under the `Hypotenuse-Analytics` org:

| Service    | Image                                                            |
| ---------- | ---------------------------------------------------------------- |
| API        | `ghcr.io/hypotenuse-analytics/aina-sentinel-api`                 |
| Dashboard  | `ghcr.io/hypotenuse-analytics/aina-sentinel-dashboard`           |
| Docs       | `ghcr.io/hypotenuse-analytics/aina-sentinel-docs`                |
| Media      | `ghcr.io/hypotenuse-analytics/aina-sentinel-media`               |
| Perception | `ghcr.io/hypotenuse-analytics/aina-sentinel-perception`          |

Each is tagged `latest` and `v0.1.0-alpha`.

`deploy/docker-compose.ghcr.yml` wires the prebuilt images together with
upstream `pgvector` — **no build step** (no npm / uv / pip) and **no
host-file mounts**. Every service is fully self-contained inside its image.

It is **CPU-safe by default**: the perception image auto-detects CUDA and
falls back to CPU, so it runs on a plain Windows / Docker Desktop machine
with no GPU or NVIDIA Container Toolkit.

### Prerequisites

**Docker with the Compose v2 plugin** — that's it. No Python, npm, uv,
or NVIDIA toolkit required (GPU acceleration is optional).

### Quick start

```bash
# 1. Clone the repo (carries the compose file + .env template)
git clone https://github.com/Hypotenuse-Analytics/perception.git
cd perception

# 2. (Optional) tune ports / Postgres credentials
cp .env.example .env

# 3. Log in to GHCR (org members — packages are private until made public)
echo $CR_PAT | docker login ghcr.io -u <your-github-username> --password-stdin

# 4. Pull and start
docker compose -f deploy/docker-compose.ghcr.yml up -d
```

**Done.** Open:

| Endpoint  | URL                        |
| --------- | -------------------------- |
| Dashboard | http://localhost:3000       |
| API       | http://localhost:5000/health |
| Docs      | http://localhost:3001       |

The API auto-applies the Postgres schema on first boot (9 tables). The
perception service downloads YOLO weights on first run (~30 MB) into a
Docker volume (`engine_cache`), so subsequent restarts are instant.

### Windows

```powershell
.\run-ghcr.ps1           # CPU — no GPU needed
.\run-ghcr.ps1 up -Gpu   # NVIDIA GPU acceleration (needs toolkit)
.\run-ghcr.ps1 status    # container states + endpoints
.\run-ghcr.ps1 down      # stop
```

Or via the batch wrapper: `run-ghcr.bat up`

### Linux / macOS

```bash
./run-ghcr.sh            # CPU
./run-ghcr.sh --gpu      # NVIDIA GPU acceleration
```

### GPU acceleration (optional)

Add the NVIDIA runtime overlay for hosts with a GPU + Container Toolkit
(WSL2 GPU passthrough on Windows):

```bash
docker compose -f deploy/docker-compose.ghcr.yml \
               -f deploy/docker-compose.ghcr.gpu.yml up -d
```

### What happens on first run

1. `postgres` starts and waits for health check.
2. `media` starts go2rtc with the baked config; connects to both camera
   streams (live VA-DOT traffic cams).
3. `api` starts, auto-applies the Postgres schema, connects to the DB.
4. `dashboard` serves the React SPA; proxies `/api` to the API.
5. `docs` serves the Docusaurus documentation.
6. `perception` loads YOLO26s (downloads weights if needed), connects to
   the go2rtc restreams, begins detection + tracking + persistence.
7. `recorder` captures MP4 segments from the go2rtc streams.

Everything boots automatically in ~30 seconds. No manual migration,
no manual configuration, no host files.

### Republishing the images

`deploy/build-push.sh` builds and pushes all five images. It uses
`gh auth token` for GHCR auth, so the token needs the `write:packages`
scope.

## Non-negotiable architecture rules (from the build prompt)

1. No perception module imports another module — communication only via `requires()`/`produces()` on the orchestrator.
2. Shared upstream results are computed once per frame (enforced by the dependency graph).
3. Everything toggled by `config/aina.yaml`, never by code changes.
4. YOLO26 is the default detector (Ultralytics, licensed).
5. No visible jitter at 10–12 FPS (time-based tracker params, measured-dt Kalman, One Euro render smoothing, render interpolation).
6. Dockerized GPU passthrough is the primary path (edge = Jetson, aws = g4dn/g5); device is a config value, not a code branch.
7. Everything branded Hypotenuse Analytics.