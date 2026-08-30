---
sidebar_position: 2
title: Detection
---

# Object detection

```yaml
object_detection:
  enabled: true
  framework: ultralytics   # detector layer: ultralytics | rfdetr | (add your own in perception/detectors/)
  model: yolo26s           # ultralytics id (yolo26s, yolo13, yolo11n, yolov8s, …) or local weights path
  image_size: 640
  confidence: 0.25
  device_head: one_to_one   # one_to_one (NMS-free where the model allows, default) | one_to_many
```

## Detector layer (`framework`/`model`)

The detector itself is **swappable** — the module always emits Supervision's unified format
(`sv.Detections.from_ultralytics(...)` / `from_rfdetr(...)`), so tracking, zones, and every
downstream module keep working regardless of which detector produced the boxes.

- `framework: ultralytics` + `model: yolo26s` — the default YOLO26 detector (Ultralytics
  Enterprise license; the platform does not vendor GPL/AGPL code).
- `model` also accepts a local weights file, e.g. `yoloe-26s-seg-pf.pt` (resolved via
  `AINA_MODELS_DIR`, default `/etc/aina/models` in the perception container).
- `framework: rfdetr` + `model: rfdetr-base | rfdetr-plus` — alternative detector layer.

## `device_head`

- `one_to_one` (**default**) — the NMS-free label-assignment head. Faster, and no IoU/score
  threshold tuning needed.
- `one_to_many` — traditional NMS path for cases wanting the classic head at a small accuracy
  premium.

Both are implemented and selected purely by config — nothing is hardcoded.

## Inputs

- **`image_size: 640`** — the inference input size. Smaller = faster, harder on tiny objects;
  the dashboard's *Sub* view exists precisely because main (wide) views shrink objects.
- **`confidence: 0.25`** — score floor for a raw detection.

## The one thing downstream knows

All downstream modules (tracking, zones, behavior, persistence) consume **`sv.Detections`**, not
raw Ultralytics tensors. That is what keeps the detector layer pluggable and is why the
orchestrator can deduplicate shared outputs (e.g. face crops for face-recognition + demographics)
across modules without any of them knowing who produced the crop.

## Model files

The perception container mounts a models directory:

```yaml
# docker-compose.yml
perception:
  volumes:
    - <host models dir>:/etc/aina/models:ro
```

Drop `yolo26s.pt` (or your chosen weights) there and set `model:` accordingly.