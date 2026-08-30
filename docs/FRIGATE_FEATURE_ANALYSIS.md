# Frigate NVR — Feature & UX Analysis for Surveillance Intelligence Lab

**Prepared by:** Engineering, Hypotenuse Analytics
**Product under build:** Surveillance Intelligence Lab (v0.1.0-alpha)
**Source:** read-only analysis of the Frigate NVR checkout, `reference/frigate/`
**Status:** deliverable for Stage 1 — drives the Stage-1 dashboard clone and the Stage-10 wiring plan

---

## 1. Purpose

This document catalogues what Frigate's surveillance UI does — every view, what data it shows, what interactions it supports, and which backend endpoints back it — so Surveillance Intelligence Lab can replicate the *usability* of the market-leaning NVR dashboard while being built from scratch (no imported Frigate code, no trademark use). The **semantic search / Explore UX** is called out separately because it is a deliberate replication target.

Frigate is MIT-licensed software; "Frigate" is a protected trademark. This analysis studies UX and architecture patterns only.

---

## 2. Reference system shape (context)

- **Backend:** Python 3.13+, FastAPI (not Flask); SQLite + `sqlite-vec` for embedding KNN; message bus via MQTT + WebSocket + ZMQ inter-process queues; go2rtc for stream ingestion/restreaming; ffmpeg for HLS/VOD and capture.
- **Frontend:** React 19 + TypeScript + Vite + Tailwind 3 + Radix/shadcn-style UI. State: SWR + axios (REST), native WebSocket external-store for live updates, jotai-like atomic hooks. Video: HLS.js + jsmpeg (MJPEG) + MSE/WebRTC via go2rtc. Canvas: konva/react-konva. Config editor: Monaco + `@rjsf` + monaco-yaml.
- **Two-track event model (important architectural idea we adopt):**
  - **Event track** (`events` table + `timeline`): lifecycle of *one tracked object* per camera — `start / update / end`, behavioral class types (`visible`, `entered_zone`, `stationary`, `active`, `attribute`, `gone`, `heard`, `external`). Powers per-object detail (snapshot, clip, path plot, timeline).
  - **Review track** (`review_segments`): aggregates *all activity in a window* (many objects + audio + manual/LPR triggers) into a single alert/detection segment with one thumbnail. Powers the Reviews page, notifications, export/cases, and GenAI summaries.
  - Surveillance Intelligence Lab mirrors this split with `events` + `detections` tables and an `incidents`-style aggregation, plus behavioral `event_type` values as a column (no per-behavior tables — Stage 5).

---

## 3. Dashboard views catalogue

### 3.1 Live — multi-camera grid (`/`, `views/live/LiveDashboardView`)

| Aspect | Detail |
|---|---|
| Data shown | Grid of camera tiles; per-tile live video thumbnail, camera name, motion indicator, live-now/recent-activity state; "live" vs "motion-only" mode; objects detected in the active camera. |
| Interactions | react-grid-layout tile rearrangement (per user); click tile → camera detail; global "live/motion" toggle; camera enable/disable; object list panel. |
| Backend | `GET /api/go2rtc/streams` (stream registry), MJPEG `GET /api/{camera}` feed, `GET /api/{camera}/best.{ext}` per-label best objects, WS topic `camera_activity/<name>` for state flips, `GET /api/{camera}/grid.jpg` snapshot for the dashboard wall. |

### 3.2 Live — Birdseye / multi-camera composite (`views/live/LiveBirdseyeView`)

| Aspect | Detail |
|---|---|
| Data shown | A dedicated `birdseye` camera source built by go2rtc (`-protocol` override) compositing multiple cameras + dynamic object overlays; configurable layout (`2x2`, `3x3`, `grid`, `multi_cam`, `cluster`). |
| Interactions | PTZ steering (if a ptz camera target follows objects via autotracking), layout control. |
| Backend | go2rtc restream of the composite; `PUT /api/camera/{name}/set/ptz_autotracker`. |

### 3.3 Camera detail (`/live/<camera>`, `views/live/LiveCameraView`)

| Aspect | Detail |
|---|---|
| Data shown | Full-res live stream, PIP sub-stream, detected object boxes + zone polygons overlay toggle, current objects list, snapshot, recording entry CTA, stream stats (input fps, detect fps, processing), PTZ controls. |
| Interactions | Live/MSE/MJPEG mode selection; snapshot download; jump into the recording timeline for "now"; PTZ move/preset; zone visibility. |
| Backend | Live: `GET /api/{camera}`, `GET /api/go2rtc/streams/{name}?src=`; snapshot `GET /api/{camera}/latest.jpg`; settings `PUT /api/camera/{camera}/set/detect`. Timeline/history uses review+recordings endpoints below. |

### 3.4 Review / events feed (`/review`, `pages/Events.tsx`, `views/events/EventView`)

| Aspect | Detail |
|---|---|
| Data shown | Segments grid with severity tabs (all / alert / detection / significant_motion), per-segment thumbnail, camera/label/zone/time badges; driven by a calendar (per-day counts) + a scrubbable timeline strip (motion heatmap + review segment spans). |
| Interactions | Severity/camera/label/zone filters, "show reviewed" toggle, click segment → detail (`views/recording/RecordingView`) with HLS timeline scrub, mark reviewed (optimistic), bulk delete, preview videos (`useCameraPreviews`). |
| Backend | `GET /api/review` (segment list), `GET /api/review/summary` + `GET /api/recordings/summary` (calendar), `POST /api/reviews/viewed`, `DELETE /api/reviews/delete`, VOD `GET /api/vod/{camera}/start/{s}/end/{e}` (HLS), `GET /api/preview/{camera}/start/{s}/end/{e}/frames` (frame buffers for scrubbing), `GET /api/review/{id}/preview` (webp segment preview), motion heatmap `GET /api/review/activity/motion`. |

### 3.5 Explore — semantic search (**replication target**, `/explore`, `pages/Explore.tsx` + `views/explore/ExploreView.tsx` + `views/search/SearchView.tsx`)

See §4 for the full drill-down.

### 3.6 Timeline / history (embedded in Review, `views/recording/RecordingView.tsx`)

| Aspect | Detail |
|---|---|
| Data shown | Scrubber across a recorded window: timeline with per-camera review spans + motion density, preview frame buffer above, click to seek, playback of the HLS segment; "catch up to now". |
| Interactions | Drag scrub, play/pause, next/prev event jump, time-range picker, zoom (custom `use-timeline-zoom`). |
| Backend | preview frames + review segments + `GET /api/vod/{year}/{month}/{day}/{hour}/{camera}` hourly HLS + `GET /api/events` within range. |

### 3.7 System / health (`/system`, `pages/System.tsx`, `views/system/`)

| Aspect | Detail |
|---|---|
| Data shown | Per-camera FPS (detect/process/skipped), detector performance (inference speed, pending), camera uptimes, restart/stop buttons, device info. |
| Interactions | Service restart/stop, masquerade preview mode, toggle per-camera processing. |
| Backend | `GET /api/stats`, `GET /api/stats/history`, `GET /api/metrics`, `GET /api/version`. WS `system` updates. |

### 3.8 Config editor (`/config`, `pages/ConfigEditor.tsx`)

| Aspect | Detail |
|---|---|
| Data shown | Full YAML config loaded into Monaco with schema validation (`config_schema.json`), safe-mode restricted editor, profiles selector. |
| Interactions | Edit + validate + save (`POST /api/config/save`), raw-path jumps (`GET /api/config/raw_paths`), set single options (`PUT /api/config/set`). |
| Backend | `GET /api/config/raw`, `POST /api/config/save`, `PUT /api/config/set`, `GET /api/profiles`. |

### 3.9 Notifications (`views/settings/`, notification settings; web-push)

| Aspect | Detail |
|---|---|
| Data shown | Browser push subscriptions, per-camera/label notification scopes, enabled state. |
| Interactions | Register push subscription, toggle scopes; server-side intent matching on review segments. |
| Backend | `GET/POST /api/notifications/register`, `GET /api/notifications/pubkey` (VAPID). |

### 3.10 Exports & cases (`/export`, `pages/Exports.tsx`)

| Aspect | Detail |
|---|---|
| Data shown | Export job queue, completed exports, "cases" (shareable grouped clips). |
| Interactions | Start export of a segment range (`POST /api/export/{camera}/start/{s}/end/{e}`), batch, rename, delete, reassign. |
| Backend | `GET /api/exports`, `GET /api/jobs/export`, `POST /api/exports/batch`. |

### 3.11 Additional admin surfaces (deferred for v0.1.0-alpha)

Face library (`/faces`), custom classification models (`/classification`), AI chat (`/chat`, `/chat/tools`, `/chat/execute`, streaming `/chat/completion`), debug replay (`/debug_replay/*`), logs viewer (`/logs` → `GET /api/logs/{service}`). These inform the roadmap but are out of scope for the v0.1 clone.

---

## 4. Explore / semantic search UX — deep drill-down (replication target)

### 4.1 Entry states

1. **No query, no filters** → "default summary" view: `GET /api/events/explore` returning one aggregate entry per label (count + latest thumbnail), or a grid of recent events (`GET /api/events`) — per user-persisted `exploreDefaultView`.
2. **Filters only** (e.g. camera + date range) → structured `GET /api/events` list.
3. **Text query** → semantic: `GET /api/events/search?query=…`; backend parses natural language into `{structured_filters, semantic_text}` (GenAI/LLM), applies structured filters first, then ranked embedding similarity inside that narrowed set.
4. **"Find similar"** on a thumbnail → `search_type=[similarity]&event_id=…` (embedding search by image similarity), query box cleared.

### 4.2 Controls

- **Query box:** free-text input with tag chips (recent searches / suggestions).
- **Filters:** cameras, labels, sub-labels, zones, before/after + time-range presets, min/max score, has-snapshot / has-clip toggles, search-type (`relevance | thumbnail | description`), sort (`relevance | date | score`).
- **Result grid:** infinite scroll (`useSWRInfinite`, `before`/`after` cursors); card = thumbnail (`api/events/{id}/thumbnail.webp`), label, sub-label, camera, zones, time-ago; embedding-backed searches capped at 100 results.
- **Detail dialog** (`SearchDetailDialog`): tabs **snapshot / clip (HLS) / timeline / details**; `TrackingDetails` tab plots the object's path (`ObjectPathPlotter`) over time + score/track metrics.
- **Indexing UX:** model download progress + embedding re-index progress surface as animated progress bars (WS `model_state`, `EmbeddingsReindexProgressType`).

### 4.3 Backend semantics (what the platform must reproduce)

```
query string
  → NL parse (LLM) → {structured_filters: camera/zone/label/time/…, semantic_text}
  → structured filters applied to candidate pool (DB WHERE…)
  → embedding of semantic_text vs pooled thumbnails/descriptions (KNN)
  → ranked results (score fusion of visual + description distance)
```

Frigate backs this with SQLite + `sqlite-vec` and Jina CLIP ONNX encoders (`jina-v1/v2`) + a GenAI embedding path. **Surveillance Intelligence Lab's Stage 7 replicates this with Postgres + pgvector and a local CLIP encoder (Jina CLIP), an LLM NL-parse step, and the same narrowed-set-then-similarity strategy.**

---

## 5. What Surveillance Intelligence Lab adopts (architecture blueprint)

| Frigate mechanism | Surveillance Intelligence Lab equivalent |
|---|---|
| go2rtc restream-once for both record & inference | `media/` go2rtc container (Stage 3) |
| Event (one object lifecycle) vs Review (window aggregation) | `events` (behavioral `event_type`) + `incidents`/`detections` (Stage 5) |
| Behavioral timeline class types | `events.event_type` values: `visible`, `entered_zone`, `stationary`, `loitering`, `tailgating`, `gone`, `active` |
| Object detection → tracker → zone membership → event lifecycle | Orchestrator `requires()/produces()` chain (Stage 2): `object_detection → tracking → zone_membership → behavior.*` |
| Semantic search: NL parse → structured filter → embedding KNN | Stage 7: LLM parse → pgvector KNN in narrowed set |
| WebSocket live updates + SWR REST | Dashboard `lib/api.ts` + `lib/ws.ts` (Stage 10) |
| znail UI shell: sidebar + statusbar, SPA | Hypotenuse Analytics React 19 + Vite SPA (same shell) |

---

## 6. Surface checklist (Stage-1 dashboard must implement, mock-backed)

- [x] App shell: brand sidebar, statusbar, route guard shape
- [x] Live multi-camera grid (+ tile rearrange handle, motion/live toggle)
- [x] Birdseye composite view
- [x] Camera detail (video tile, object chips, PTZ panel, snapshot)
- [x] Review/events feed (severity tabs, camera/label/zone/time filters, calendar, segment cards)
- [x] Recording/timeline detail (scrubber, preview strip, playback controls)
- [x] Explore (query input, filters, ranked result grid, detail dialog, find-similar)
- [x] Zones editor (draw polygons on camera canvas)
- [x] System/health (per-camera FPS, per-module state, GPU util)
- [x] Notifications (scopes/toggles)
- [ ] Config editor (deferred to Stage 10 wiring; minimal mock here)

Every surface is branded **Hypotenuse Analytics**; no Frigate branding or copy appears.