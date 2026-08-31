# Ingestion & Preprocessing — Production-Readiness Review

**Date:** 2026-08-31 · **Scope:** source ingestion → frame scheduling → detector
preprocessing → smoothing → tracking → zone/embedding preprocessing → persistence
sink. Code references `perception/*`, config `config/aina.yaml`. This is a review
only — no code was changed.

---

## 1. Pipeline map

```
RTSP (camera) ──go2rtc──▶ rtsp://<host>:8554/<name>            media/ (dev: local files)
                              │
                          FramePump (OpenCV decode, wall-clock throttle to AINA_FPS)
                              │  Frame{source, frame_id, timestamp=time.time(), image(BGR)}
                              ▼
                  Orchestrator._round_robin (one frame per camera, cycled)
                              ▼
   ┌────────────────────────  Orchestrator.process_frame  ────────────────────────┐
   │                                                                              │
   │  object_detection  (YOLO26s · imgsz 640 · conf 0.25 → xyxy back to source px) │
   │       │ detection_smoother (sv.DetectionsSmoother EMA, fallback: pass-through)│
   │       ▼                                                                       │
   │  tracking (ByteTrack: real-dt Kalman association · per-track One-Euro render) │
   │       │ render box = smoothed/interpolated state                               │
   │       ▼                                                                       │
   │  zones (point-in-polygon on feet point)  +  semantic_search (crop→CLIP, async) │
   │       │                                                                       │
   │       ▼                                                                       │
   │  persistence (bounded async op queue → Postgres, idempotent uuid5 upserts)    │
   └──────────────────────────────────────────────────────────────────────────────┘
```

Deterministic ids (`camera_id/zone_id/track_uuid/...` in `perception/persistence.py`)
make every write idempotent, so re-mounted rows are conflict-free no-ops.

---

## 2. Deep dive per layer

### 2.1 Source & decode (`perception/ingest.py`)

- **One media server, many consumers.** go2rtc opens each camera exactly once and
  restreams on `rtsp://<host>:8554/<name>`; recording, detection, review all read
  the *same* stream. Good — no duplicate RTSP sessions (bandwidth), single
  reconnection point.
- **FramePump** (`ingest.py:37`) decodes serially and throttles to
  `AINA_FPS` (10–30, default 10) with wall-clock `time.sleep`; the pump is a
  *generator* consumed synchronously by the orchestrator. Frames are stamped
  `time.time()` at decode (`ingest.py:93`) — the timestamp is capture time, and
  (post the dt fix) everything downstream — Kalman, One Euro, persistence —
  uses it, not wall-clock at persist.
- **Local demo media loops** (`AINA_MEDIA_LOOP`) rewind `CAP_PROP_POS_FRAMES`; a
  lost RTSP read never crashes — it sleeps one period and retries forever
  (`ingest.py:85-91`).
- **Scheduling** is round-robin across pumps (`orchestrator.py:363`); each pump
  self-throttles so interleaving still holds each source to FPS.

**Assessment:** correct and simple, debug-friendly, never crashes on a dead
camera. The design point that limits scale: decode and inference share one thread
per *process* (details in §4).

### 2.2 Detector preprocessing (`detectors/ultralytics_backend.py`)

- `predict(source=image, imgsz=640, conf=0.25, classes=...)` → Ultralytics owns
  letterbox → resize → normalize → CHW → transfer, and — critically — returns
  **xyxy back in original source coordinates**, which keeps zone polygons and box
  coordinates in one space (camera pixel space). No manual coordinate
  remapping anywhere downstream. Good.
- `device` resolution (`cuda:0` if available, else cpu) happens at load; model
  names/weights resolved through `AINA_MODELS_DIR`.
- Optional classes filter; optional masks (seg) surfaced but inert for tracking.
- Lazy import keeps the rest of the stack torch-free; `DetectorError` guides
  setup when extras are missing.

### 2.3 First-pass detection smoothing (`smoothing/detection_smoother.py`)

- Wraps `sv.DetectionsSmoother` (EMA over per-(class,centre) motion trajectories)
  on **raw detections before tracking**, with a version-adaptive kwargs probe
  (`length_seconds` / `history_length` / `length`) and a pass-through fallback
  when supervision is absent or fails. The stack never hard-depends on it.
- Config toggles map 1:1 to independent, debuggable stages.

### 2.4 Tracking preprocessing (`modules/tracking.py`, `trackers/byte_track.py`)

- **Time-based buffer, FPS-adaptive.** `track_buffer_seconds` is converted to a
  lost-frame ceiling using an EMA of *measured* per-source FPS
  (`tracking.py:148`), so a 1.0 s buffer behaves the same at 5 or 30 pipeline
  fps.
- **Real-`dt` Kalman throughout**: ByteTrack's box Kalman (`byte_track.py:43`)
  and the render-interpolation KalmanCV (`smoothing/kalman.py:53`) both advance by
  elapsed seconds (velocity is px/s; process noise scales with dt). Dropped or
  bursty frames glide at the true heading instead of assuming unit steps.
- **One Euro de-jitter** (`smoothing/one_euro.py`) is per-track, seeded with the
  measured FPS, and time-stepped by real frame timestamps — the standard
  adaptive low-pass tuning knob (min_cutoff → hard smoothing when slow, beta →
  looseness under speed).
- **ByteTrack port**: two-stage association (stage-1 high scores match all
  tracks, stage-2 low scores 0.1–0.5 get a second chance for occlusion/flicker),
  class-aware IoU + Hungarian, gated matching, per-track state, coasted priors
  exposed for render interpolation.
- **Pruning** (`tracking.py:230`) deletes Kalman/One-Euro/last-render/gid state
  when the backend track dies, so the dicts stay bounded.
- Per-camera backend instances; track ids are **global across cameras**
  (`_gid_for`) — one namespace, no cross-camera collisions in the DB.

### 2.5 Zone & embedding preprocessing

- **Zones** (`modules/zones.py`): membership uses the track's *feet point*
  (bottom-center), not the whole box — big boxes don't falsely straddle a zone.
  Ray-cast PIP (concave-safe) with an inline bench note (2–7× faster than
  `sv.PolygonZone` ≤ ~20 tracks).
- **Semantic crop** (`embeddings/crop.py`): BGR→RGB, clamped box, `INTER_AREA`
  downscale, 96 px letterboxed square (grey 128 bar) — the encoder owns final
  normalize/resize. Crops run **off** the hot path through a bounded worker queue
  (`modules/embeddings.py`, `suggest`/`drain`).

### 2.6 Persistence sink (`persistence.py`, `modules/persistence.py`)

- `process()` only encodes lightweight op dicts onto a bounded (20 000) queue —
  never blocks, never raises on a down DB; a single consumer thread owns the
  connection.
- Ops batched in one transaction, committed every 200 statements — a 24/7 feed
  degrades a few commits/sec instead of per-op round trips; FIFO order preserves
  enter→end zone semantics.
- Every id deterministic (uuid5); upserts `ON CONFLICT DO NOTHING/UPDATE` →
  crash-replay is idempotent.
- `tracks` maintains lifecycle (`first_seen`, `last_seen`, `ended_at`, frame and
  coasted deltas, peak confidence, tracker backend name); `detections` sampled
  (`detection_sampling`), `events` gated on an *enabled* behavior producer, and
  embeddings gated the same way — a toggled-off capability never magically turns
  a sink on.

---

## 3. Strengths worth keeping

1. **Time is real.** Capture timestamps flow end-to-end (Kalman dt, One Euro dt,
   persistence `last_seen`), never replaced by persist-time `time.time()`.
2. **Idempotent by construction** — deterministic uuid5 + ON CONFLICT makes the
   sink crash-safe and replay-safe.
3. **Track identity is globally unique across cameras** and the 
   per-track smoothers are pruned.
4. **Fail-loud boot, fail-safe run**: config/graph errors abort startup
   (`_reject_unimplemented`, `_reject_unknown_requested`, topological cycle
   detection); runtime errors log, drop, and keep the camera feed alive.
5. **Operator-friendly config**: capability graph auto-enables upstreams with a
   logged reason; every smoothing toggle independently debuggable.
6. **Detector/tracker/normalization pluggability** behind registries; everything
   beyond YOLO+ByteTrack is unit-testable without the ML stack.

---

## 4. Gaps & risks

Severity: **High** = will bite in a real 24/7 deployment · **Med** = bite under
specific conditions · **Low** = cosmetic / hardening.

| Sev | Area | Finding | Where | Fix direction |
|-----|------|---------|-------|---------------|
| **Med** | Ingest | On an RTSP stream that drops *after* the first successful open, the retry loop sleeps forever but never **reopens** the capture — many cv2 backends won't auto-reconnect, so a long restream outage leaves that camera dead until perception restarts. | `ingest.py:85-91` | Track consecutive read-fail time; after N seconds, `open()` again (release + re-create `VideoCapture`) with capped exponential backoff. |
| **Med** | Ingest | **All cameras share one decode+infer thread** (round-robin pulls blocks on `read()`). One camera's slow decode starves the others (head-of-line blocking); decode and GPU inference never overlap. Fine at 1–2 cams / 10 fps; the first thing to change when scaling. | `orchestrator.py:363`, `ingest.py:75` | Per-camera decode thread + bounded frame queue(s); keep the orchestrator loop as the single consumer. |
| **Med** | Identity | **GIDs reset on perception restart** (`_next_gid = 1`) while Postgres global ids keep counting — recreated tracks can collide with (and merge into via the idempotent upsert) stale rows from before the restart. | `modules/tracking.py:226,278` | Persist a per-camera gid high-water mark (DB or Redis), or seed `_next_gid` from `tracks.global_track_id` max at boot. |
| **Low/Med** | Sink | Writer docstring claims "retry-once on connection loss", but a *failed commit batch* is dropped outright (`_drop` closes conn, batch lost). Ops are idempotent, so replay is safe — currently it just isn't attempted. | `persistence.py:210-240` | Keep the failed `pending` list and retry it on the next flush (with backoff); drop only after N consecutive failures. |
| Low | Sink | No health/telemetry exposure of `dropped`/`written` counters or per-camera fps — dead cam or queue-drain stalls are only visible via logs. | `persistence.py:142-143`, `tracking.py:148` | Expose counters on the `/health` (or a metrics endpoint) and log a warmed `written/dropped` summary. |
| Low | Smoothing | If two frames carry the *same* timestamp (possible on media-loop fast rewind), One-Euro `dt → 1e-6` can make `dx` explode and the cutoff saturate (filter effectively bypasses that step). Harmless but noisy. | `smoothing/one_euro.py:55` | Floor `dt` to a sane min (e.g. 1e-3) or skip the step when `dt ≈ 0`. |
| Low | Detector | `device` defaults to `cuda:0` if torch reports CUDA — it ignores `deployment.gpu`/`device_head` config nuance (fine today, but the config surface already *exists* for it). | `ultralytics_backend.py:58` | Honor a config-driven device explicitly. |
| Low | Ingest | `_round_robin` recomputes the gen list per outer pass; memory/perf trivial, but the StopIteration handling makes "one camera ends" silently drop it (fine — no-op). | `orchestrator.py:369-375` | None needed; note only. |
| Info | Zones/Embed | These readers *trust* tracked boxes in source-pixel space; that invariant is guaranteed by YOLO's back-mapping + the tracking module never changing coordinate origin. Any future detector that returns letterboxed coords would silently break zones — worth a unit guard. | `zones.py:101`, `crop.py:23` | Add an assertion/test asserting box ranges stay within frame dims on ingest. |

---

## 5. Verdict & punch list

The ingestion + preprocessing stage is **solidly engineered and close to
ship-grade for the current scale** (1–2 cameras, 10–30 fps, edge GPU): real-time
consistency, idempotent hands-off persistence, fail-safe runtime, loud
boot-time errors, clean coordinates, bounded memory, and strong test coverage
(137 tests). Nothing here is a showstopper.

A "production day-1" order of operations (no code needed today):

1. **RTSP reopen w/ backoff** — biggest single robustness win; keeps a camera
   alive through a restream blip without a process restart.
2. **GID high-water seeding** — closes the identity-collision class after
   restarts (already flagged in the `6570962` commit notes).
3. **Retry the dropped commit batch** — cheap, and idempotency already makes it
   safe.
4. **When cameras grow past ~2** — per-camera decode threads + bounded queues,
   so decode overlaps inference and one slow source can't starve the rest.
5. **Expose `written/dropped` + per-camera fps** on the health/metrics surface so
   a dead stream or an over-degraded queue is alarm-visible, not log-only.