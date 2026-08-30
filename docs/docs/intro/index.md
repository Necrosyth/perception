---
sidebar_position: 1
title: Introduction
---

# Surveillance Intelligence Lab — Introduction

**Surveillance Intelligence Lab** is the surveillance-intelligence dashboard of the **Hypotenuse Analytics** product line —
*"Predict. Protect. Verify."*

It is a real-time computer-vision platform that watches camera feeds, detects and tracks people,
vehicles, and other objects, reasons about where they are (zones) and what they are doing
(behaviors), records it all into a time-series PostgreSQL database, and lets an operator search
what the cameras saw — live, historically, and semantically.

Current version: **v0.1.0-alpha**.

## What the product does

| Capability | Status in v0.1.0-alpha |
| --- | --- |
| Live multi-camera dashboard (H.264/MSE via go2rtc) | ✅ Shipped |
| Object detection (YOLO) on GPU, config-selected model | ✅ Shipped |
| Tracking with jitter elimination at 10–12 FPS | ✅ Shipped (numeric-verified) |
| Zone membership + zone events | ✅ Shipped |
| Postgres/pgvector persistence (`tracks`, `detections`, `events`, …) | ✅ Shipped |
| Cameras/zones/tracks/events REST API | ✅ Shipped |
| Loitering behavior module | 📋 Planned (Stage 6) |
| Semantic search (CLIP embeddings + NL query) | 📋 Planned (Stage 7) |
| Face recognition / ANPR | 📋 Planned (Stage 8) |
| Deployment targets (Jetson edge + AWS GPU) | 🔧 In progress |

## The platform

Surveillance Intelligence Lab is a Docker Compose stack of five services:

| Service | Image / build | Role |
| --- | --- | --- |
| `media` | `alexxit/go2rtc` | Restreams every camera **once**; serves H.264 MSE to the dashboard and RTSP to perception |
| `postgres` | `pgvector/pgvector:pg16` | Stores cameras, zones, tracks, detections, events, embeddings, segments, incidents |
| `api` | `deploy/Dockerfile.api` (FastAPI) | Applies schema migrations on boot; serves catalog + reconstruction queries |
| `perception` | `deploy/Dockerfile.perception` | GPUs: ingests RTSP, runs detection → tracking → zones → persistence, executes behavior modules |
| `dashboard` | `deploy/Dockerfile.dashboard` (React + nginx) | The operator UI; proxies `/api` and `/media` inside the stack |

## The one architectural idea that matters

Surveillance Intelligence Lab's camera sources are opened exactly once per source. `go2rtc` (the `media` service)
opens each camera stream and restreams it; both the recorder (API/data layer) and the perception
pipeline consume that **same restream**. Nothing in the stack ever connects to the camera a second
time.

Inside perception, the same idea repeats at the compute level: perception *modules* never call each
other's functions. They declare what data they need (`requires`) and what they produce
(`produces`), and the orchestrator builds a dependency graph so a shared upstream result — say, face
crops needed by three modules — is computed **exactly once per frame** and shared. This is enforced
by architecture, not convention. See [Architecture](../development/architecture).

## Quick start

```bash
git clone <repo> && cd <repo>
cp .env.example .env        # adjust credentials / GPU choices if needed
docker compose up -d --build
```

Then open `http://<host>:3000/`. The bundled demo camera (`loading_dock`) already shows live video.
Full walkthrough: [Installation](./installation).

## Next

- [Hardware requirements](./hardware) — what to run it on.
- [Deployment planning](./planning) — laying out cameras and zones.
- [Video pipeline](./video-pipeline) — how frames flow through the stack.