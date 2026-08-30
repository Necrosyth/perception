---
sidebar_position: 9
title: Glossary
---

# Glossary

| Term | Meaning |
| --- | --- |
| **Restream** | A camera feed that go2rtc keeps open once and re-serves to all consumers (perception + dashboard) so the camera is never opened twice. |
| **MSE** | Media Source Extensions — the browser API the dashboard uses to play H.264 from go2rtc (`/media/api/stream.mp4?src=<name>`). Requires H.264 video. |
| **Track** | A continuously-tracked object instance with a stable `global_track_id`, started at first detection and finalized after being unseen for `finalize_timeout_s`. |
| **Detection** | A single per-frame object observation (class, box, confidence). Sampled when persisted to Postgres (`detection_sampling: 5` = 1 in 5 rows). |
| **Zone** | A normalized (0–100) polygon drawn against a camera's frame. Membership powers events and behaviors. |
| **Event** | A stateful occurrence persisted on the `events` table: `entered_zone`/`left_zone` today, plus per-behavior types (e.g. `loitering`) as modules land. |
| **Module** | A perception capability (`PerceptionModule`). Communicates only through typed `requires`/`produces` data on the orchestrator's dependency graph — never by direct imports. |
| **Dedup** | The orchestrator guarantee that a shared upstream result (e.g. face crops) is computed exactly once per frame no matter how many enabled modules consume it. |
| **One Euro Filter** | A velocity-adaptive low-pass filter used per track after tracking to keep rendered boxes stable without lag (cutoff rises with speed). |
| **dt** | Elapsed real time between two consecutive frames, fed into the tracker's Kalman predict step (never an assumed constant). |
| **Restream-once** | The architecture principle that every camera source is opened exactly once, by go2rtc. |
| **compute capability / `sm_*`** | NVIDIA's per-GPU ISA (e.g. T4 = `sm_75`, Orin = `sm_87`). TensorRT engines are NOT portable across these. |
| **Engine cache** | Persistent volume of compiled TensorRT `.engine` files, keyed by compute capability, so redeploys skip recompilation. |
| **DetectionSmoother** | First-pass smoothing (from Supervision) applied to raw detections upstream of tracking, for association stability. |
| **Sub-stream** | A lower-resolution camera encode (vs the *main* stream); the dashboard has a per-camera *Sub* view toggle. |
| **`tstzrange`** | Postgres time-range type used to answer "which tracks were active in zone X between A and B". |
| **Semantic search** | Planned: search footage by natural language (CLIP embeddings + structured filters). Stage 7. |
| **Loitering** | Planned behavior module: dwell-time events per track in a zone, debounced per `(event_type, tracker_id)`. Stage 6. |