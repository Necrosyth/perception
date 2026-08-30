---
sidebar_position: 3
title: Deployment planning
---

# Deployment planning

A little planning before you `docker compose up` pays off. This page covers the decisions that are
hard to change later.

## Where each service lives

The five services should stay in one Docker network on one host. In a small deployment everything
runs on a single machine (typically the same host that has the GPU). For larger sites you can
split the stack later, but the shipped compose file assumes one host.

| Service | Placement guidance |
| --- | --- |
| `media` (go2rtc) | Co-located with the cameras' network. Should reach every camera RTSP endpoint. |
| `perception` | Must be on the GPU host (edge Jetson or GPU instance). |
| `api` + `postgres` | Same host as the rest for now; attach `pgdata` to reliable storage. |
| `dashboard` | Anywhere with HTTP access to `api` and `media`. |

## Choosing the deployment target

`deployment.target: edge | aws` in [`config/aina.yaml`](../configuration) selects the base image
and the cached engine **only**. It never changes application logic. Concretely:

- `edge` → Jetson-class L4T ARM64 image and the Jetson driver stack.
- `aws` → standard x86_64 CUDA image for g4dn/g5.

Pick the value that matches the *machine running perception*, then check the Dockerfile/base-image
existence for that target (both targets are on the [roadmap](../development/roadmap)).

## Camera layout

Cameras should be positioned so the relevance of a scene is obvious to a human, because zones are
drawn per camera and behaviors apply inside zones. Good defaults:

- A fixed camera (no pan/tilt/zoom) per area you care about — door, dock bay, gate, parking lane.
- Avoid backlighting the subject; avoid trees/flagpoles waving in the frame (they generate
  detections that smoothing must spend effort on).
- The detection input is 640×640; a wide 4K view shrinks people to a few pixels. Consider
  sub-streams (see [Camera setup](./camera-setup)) and note the *sub* view in the UI.

## Zones

Define zones per camera **after** installing the camera, from an actual still frame. A zone is a
normalized polygon with coordinates 0–100 (percent of width/height). Example: a staging lane
`[[35,30],[75,30],[75,85],[35,85]]`. Zone membership drives `events` and future behaviors, so
name them descriptively (`dock_entry`, `staging_lane`, `no_standing`).

## Persistence sizing

The data layer writes one `tracks` row per tracked object, sampled `detections`, and zone
`events`. With `detection_sampling: 5`, steady 10-FPS video yields roughly 2 `detections` rows per
second per camera. That is small (a few GB/year/camera), but `embeddings`, `segments`, and
`incidents` grow with features that land in later stages.

## Security model (alpha)

v0.1.0-alpha has **no authentication** on the dashboard or API. The dashboard nginx proxies
`/api` and `/media` internally. Do not expose ports `3000`, `5000`, or `1984` to untrusted
networks. Ship it behind a VPN or an authenticated reverse proxy (the [roadmap](../development/roadmap)
lists auth).