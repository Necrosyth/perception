---
sidebar_position: 2
title: Hardware requirements
---

# Hardware requirements

Surveillance Intelligence Lab targets NVIDIA GPUs. The application code is identical across targets — the only
thing that differs between a Jetson and an AWS instance is the base image and the cached TensorRT
engine (see [GPU acceleration](../deployment/gpu-acceleration)).

## Reference targets

| Target | Hardware | Compute capability (`sm_`) | Notes |
| --- | --- | --- | --- |
| **Edge** | Jetson Orin (Nano / NX / AGX) | `8.7` (Orin) | L4T-based image, ARM64, native driver stack |
| **Edge** | Jetson Nano legacy | `5.3` | Older L4T images |
| **AWS** | `g4dn.*` | T4 = `7.5` | Popular cost/performance balance |
| **AWS** | `g5.*` | A10G = `8.6` | Higher-throughput option |
| **Dev/workstation** | RTX / Quadro generations | varies | Works out of the box when the nvidia container runtime is present |

:::note TensorRT engines are not portable
A `.engine` compiled for a T4 (`sm_75`) will **not** run on a Jetson Orin (`sm_87`) or an A10G
(`sm_86`). The perception container detects the device's compute capability on boot and rebuilds
the engine only when no matching cached engine exists. The cache lives on a persistent volume so
reboots and redeploys do not recompile pointlessly.
:::

## Memory

- **GPU memory:** a `yolo26s`-class detector at 640×640 uses roughly **2–4 GB**. T4 (16 GB),
  A10G (24 GB), Orin 8/16/32 GB and most consumer RTX cards are fine. Enable face recognition or
  ANPR modules and budget accordingly.
- **RAM:** 8–16 GB for the host plus the perception container and a small Postgres.
- **Disk:** Postgres with `detections` sampling at 1-in-5 (see [persistence](../configuration/persistence))
  stays lean; still plan for a dedicated volume (`pgdata`) on fast NVMe.

## FPS target

The platform is engineered for a nominal **10–12 FPS** inference rate. Above that sampling rate the
numbers only get better; below it, tracking parameters are scaled in *seconds* and converted to
frames using the camera's **actual measured FPS** at runtime, so behavior stays consistent.

At this low refresh the engineering requirement is **no visible jitter** — bounding boxes on
static objects must not shake, and object identities must not flicker between IDs. The smoothing
stack that guarantees this is documented in [Smoothing](../configuration/smoothing) and validated
numerically, not by eyeballing.

## CPU, network, and the rest

- CPU matters mainly for the go2rtc restream and (if used) ffmpeg transcode of non-H.264 sources.
- The perception/API/dashboard containers are lightweight beyond inference.
- Network requirements are covered in [Network requirements](./network).

## Verify your GPU is visible

After the stack is up, the perception container prints `nvidia-smi` on boot:

```bash
docker compose logs perception | grep -A3 nvidia-smi
```

If you see `nvidia-smi: command not found` or a `cuInit` / runtime error instead, your host's
NVIDIA Container Toolkit is not configured — see [GPU acceleration](../deployment/gpu-acceleration#troubleshooting).