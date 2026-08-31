# Sample Run — one minute at the loading dock, end to end

A worked trace of exactly what the stack does for one camera (`loading_dock`,
1920×1080 at 10 fps), from boot through a person walking into the `dock_entry`
zone, being embedded, persisted, and later found by a natural-language query.

> All UUIDs below are **computed** with the real production scheme
> (see LLD §5) — the `ns` value is `e20cf932-400a-5d99-ac90-04aed3583d42`.

## 0. Scenario

- `config/aina.yaml`: cameras `[loading_dock]` with zone `dock_entry =
  [[0,0],[100,0],[100,100],[0,100]]`; capabilities enabled: object_detection
  (YOLO26s, 640, conf 0.25), tracking (bytetrack, buffer 1 s), zones,
  persistence (sampling 5, finalize 5 s); `semantic_search` enabled for this
  run (embedding on). Demo: go2rtc loops an H.264 clip.
- Wall clock at start: **t₀ = 2026-08-31 08:00:00 UTC** (`now = epoch`).

## 1. Boot sequence

```mermaid
sequenceDiagram
    participant DC as docker compose
    participant API as api (:5000)
    participant DB as postgres
    participant GO as media (go2rtc)
    participant PER as perception
    DC->>DB: start (pgvector/pg16)
    DB-->>DC: healthy
    DC->>API: start
    API->>DB: migrate 001_schema.sql + 002_embeddings_knn.sql
    API->>API: FastAPI up; /health ready
    DC->>GO: start (restream rtsp://media:8554/loading_dock)
    DC->>PER: start
    PER->>PER: load aina.yaml → resolve graph → [od, tracking, zones, persistence, semantic_search]
    PER->>PER: YOLO26s.to(cuda:0); ByteTrack backend for loading_dock; writer thread up
    PER->>PER: OpenCLIP ViT-H-14 ready (1024-d); EmbedRPC :5055
    PER-->>DB: upsert_camera  fab838cb-45fc-5b5d-a910-cd568416a587 (loading_dock)
    PER-->>DB: upsert_zone    404f1025-bc7b-5b9c-8690-02a98a7c496f (dock_entry)
    PER->>PER: open rtsp://media:8554/loading_dock (1920,1080)
    PER-->>DC: orchestrator ready
```

## 2. Frame loop (10 fps, capture-ts = wall clock)

```mermaid
sequenceDiagram
    participant P as FramePump
    participant O as Orchestrator
    participant D as object_detection
    participant T as tracking
    participant Z as zones
    participant S as semantic_search
    participant B as persistence
    participant W as writer thread
    participant DB as postgres
    loop every 0.1 s per source (round-robin)
        P->>O: Frame{source=loading_dock, frame_id=0, ts=now}
        O->>D: process(image)
        D-->>O: 8 boxes (person ×2 conf 0.88, truck ×1 0.92, ...)
        O->>T: process(detections)
        Note over T: dt = ts − prev_ts; Kalman/One-Euro step by real dt
        T-->>O: Track[id=gid 1 (person), render=(441,522,512,938), ...]
        O->>Z: process(tracks)
        Z-->>O: memberships: feet(476,938) → dock_entry? no ⇒ []
        O->>S: process(frame, tracks)
        S->>S: suggest(crop(96px)→queue) for best-confidence raw boxes
        S-->>O: drain() rows (empty until worker finishes)
        O->>B: process(detections, tracks, membership)
        B-->>W: upsert_track(track:loading_dock:1) · insert_detection (every 5th) 
        W->>DB: batch → commit (idempotent)
    end
```

## 3. Row timeline for the person (global track id **42**)

Capture mid-run; walk lasts ~40 s. `ts ⱼ` = capture timestamp of the frame.

| t (UTC) | Event | Rows written (deterministic ids) |
|---------|-------|-----------------------------------|
| 08:00:10.0 | first frame person is detected (new gid) | `upsert_track` `track:loading_dock:42` → `b63977f1-ae7c-51ea-b906-dc979b74d361` (first_seen_at = 08:00:10.0, backend bytetrack, class person) |
| 08:00:10.2 | every 5th live frame sampled | `insert_detection` row (frame_idx, x1y1x2y2, conf) |
| 08:00:23.5 | feet cross into `dock_entry` polygon | `enter_zone` event `enter:loading_dock:dock_entry:42:1788163223.500000` = **b5f35400-3931-5feb-80f0-bd9ccd98a3b4** (started_at 08:00:23.5) |
| 08:00:23.6 | worker finishes the 96 px crop | `insert_embedding` `embed:loading_dock:42:local_clip:1788163223.600000` = **b1106775-50c3-53b7-87d7-bf93b9a9c16e** (vector(1024), meta{confidence, captured_at, thumbnail_b64}) — HNSW inserted |
| 08:00:33.0 | person steps out of zone | `end_zone`: `UPDATE events SET ended_at=08:00:33.0 WHERE track_id=… AND zone=dock_entry AND ended_at IS NULL` |
| 08:00:33.1 | new crop while outside zone | 2nd `insert_embedding` (same track, later ts → distinct row) |
| 08:00:38.0 | person last detected; ByteTrack loses it | `upsert_track` ... `coasted_frames` +1, `last_seen_at` advances 0.1 s/frame |
| 08:00:43.0 | unseen > `finalize_timeout_s` (5 s) | `finalize_track` → `tracks.ended_at = 08:00:43.0` |

**Post-run DB state for track 42** (≈ 80 frames seen, 1 zone episode, 2
embeddings):

```
tracks:   b63977f1-ae7c-51ea-b906-dc979b74d361 | loading_dock | gid=42 | bytetrack
          person | first_seen_at=08:00:10.0 | last_seen_at=08:00:38.0 | ended_at=08:00:43.0
          frames_seen=~76 | coasted_frames=~4 | peak_confidence=0.94
          last_box=[441, 522, 512, 938]
events:   b5f35400-3931-5feb-80f0-bd9ccd98a3b4 | track 42 → dock_entry
          started_at=08:00:23.5 | ended_at=08:00:33.0 | event_type=entered_zone
embeddings: 2 rows (b1106775-…c16e @08:00:23.6, 356a877f-…efbb0 @08:00:33.1), model=local_clip
```

## 4. The query path (analyst)

```mermaid
sequenceDiagram
    participant UI as dashboard
    participant API as api :5000
    participant NL as nl.parse_nl
    participant RPC as perception /embed :5055
    participant DB as postgres (pgvector)
    UI->>API: GET /api/search?q="person at the dock entry after 8:20am"
    API->>NL: parse("person at the dock entry after 8:20am", catalogs)
    NL-->>API: filters{camera=?, zone=dock_entry, label=person, time_from=…}
                    + semantic_text="person at the dock entry"
    API->>RPC: POST /embed {"text":"person at the dock entry"}
    RPC-->>API: vector[1024] (L2-normalized, same model as thumbnails)
    API->>DB: WHERE c.name=? AND zq.zone_name='dock_entry'
                  AND (t.class_id=ANY(...) OR lower(class_name)='person')
                  AND captured_at >= $t
              ORDER BY e.vector <=> '<vec>'::vector  (HNSW scan)
    DB-->>API: top-24 embedding rows (+ dist→similarity=1−dist, thumbnail b64)
    API-->>UI: {semantic:true, filters:{...}, results:[{label:'person', similarity:0.91, thumb:'data:image/jpeg;base64,…'}, …], count:24}
    Note over UI: Explore/Live grids render thumbnails; "similar" re-runs KNN
                 with similar=<embedding_id> → same code path, no NL parse
```

Fallbacks: RPC down → `semantic:false`, results sorted by `created_at DESC`
(never a 500); DB down → 503 `DbUnavailable`. Query text embed cached in the API
300 s / 64 entries.

## 5. What was verified live (2026-08-31)

- 6/6 containers up; `api /health` → `{"status":"ok","database":"ok"}`.
- Perception: YOLO on `cuda:0`; semantic ON via live config — embed RPC on
  `:5055`, `embeddings` rows (model=open_clip) accumulating; NL search +
  `similar=` KNN returned ranked results with thumbnails.
- 137 tests green (`pytest perception/tests/ platform/tests/`).