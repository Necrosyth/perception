---
sidebar_position: 2
title: GPU acceleration
---

# GPU acceleration

The perception container does all inference on the NVIDIA GPU. Model export path:
**PyTorch → ONNX → TensorRT**, with OpenVINO as the documented fallback for non-NVIDIA edge boxes
(not required now).

## Compose passthrough

```yaml
perception:
  runtime: nvidia
  environment:
    NVIDIA_VISIBLE_DEVICES: all
    NVIDIA_DRIVER_CAPABILITIES: compute,utility
    PERCEPTION_GPU_INDEX: ${PERCEPTION_GPU_INDEX:-0}
    ENGINE_CACHE: ${ENGINE_CACHE:-/.engine_cache}
  volumes:
    - engine_cache:/.engine_cache
    - <host models dir>:/etc/aina/models:ro
```

Requirements:
- **NVIDIA Container Toolkit** installed and the `nvidia` runtime registered with Docker.
- Verify first:
  ```bash
  docker run --rm --runtime=nvidia nvidia/cuda:12.0-base nvidia-smi
  ```
- `PERCEPTION_GPU_INDEX` selects the GPU on multi-GPU hosts (0 = first).
- The perception container logs `nvidia-smi` output on boot:
  ```bash
  docker compose logs perception | grep -A3 nvidia-smi
  ```

## Deployment targets

`deployment.target` in `config/aina.yaml` is `edge | aws`. It changes **only** two things:

1. Which Dockerfile base image is used.
   - `Dockerfile.edge` — Jetson class: L4T-based image family, ARM64, NVIDIA's native driver stack.
   - `Dockerfile.aws` — x86_64 CUDA base, targeting `g4dn` (T4) / `g5` (A10G).
2. Which cached TensorRT engine is loaded.

It never changes application logic inside the perception modules. The same orchestrator and module
code run unmodified on a Jetson and an AWS GPU instance.

## The engine cache — engines are NOT portable

TensorRT engines are compiled for a specific **compute capability** (`sm_*`): T4 = `sm_75`,
A10G = `sm_86`, Jetson Orin = `sm_87`. A `.engine` from a T4 will not run on an Orin.

At boot the perception container:

1. Detects the device compute capability (e.g. via `nvidia-smi` in-container).
2. Checks `ENGINE_CACHE` for a matching `.engine` file.
3. Compiles via ONNX → TensorRT **only when no matching engine exists**, then stores it in the
   cache (a persistent volume `engine_cache`, or the host dir mapped by `ENGINE_CACHE`).

So a redeploy or a target switch never sits through a pointless recompile, and a stale engine for
the *wrong* GPU is never silently used.

Model export intermediates live on the weights mount (`/etc/aina/models`); the final engines live
in the cache. Both are volumes, not image layers, so retraining/rebaking is a file replace, not a
rebuild.

## Troubleshooting

### `nvidia-smi` not found / runtime error on boot
The NVIDIA Container Toolkit is not installed or the `nvidia` runtime is missing.
```bash
# Debian/Ubuntu host
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
# then re-verify
docker run --rm --runtime=nvidia nvidia/cuda:12.0-base nvidia-smi
```

### `cuInit` failure / device 999 error under `--gpus all` / CDI
Some hosts misbehave with the newer CDI-style allocation. The **shipped runtime is
`runtime: nvidia`** (this is the correct Dockerfile-independent form). Prefer that; if you use
`--gpus all` on the command line and hit allocation errors, run with `--runtime=nvidia` instead.

### Detection runs but is very slow
- Confirm the container actually found the GPU (boot log `nvidia-smi`).
- Check the engine cache: a CPU fallback engine may have been built if GPU detection raced
  startup. Wipe the unmatched engine and restart perception.

### Compile errors on a new GPU
Each new compute capability compiles its own engine (this is expected and one-time). Watch
`docker compose logs -f perception` while the engine compiles.