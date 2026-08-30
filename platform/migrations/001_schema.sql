-- Surveillance Intelligence Lab — Stage 5 data layer.
-- Postgres + pgvector schema. Mirrors Frigate's event/review split:
--   * tracks  = one object identity lifecycle (upserted per frame by perception)
--   * detections = per-frame detection rows (lightweight, sampled)
--   * events  = behavioral / zone lifecycle rows (event_type column, not tables)
--   * segments + incidents = window aggregations (review rail)
--   * embeddings = pgvector KNN pool for Stage 7 semantic search
-- Ids are stable client-side uuidv5 values derived from camera/zone/track names,
-- so upserts are conflict-free and joinable without id lookups.

CREATE EXTENSION IF NOT EXISTS vector;

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cameras (
    id         uuid PRIMARY KEY,
    name       text NOT NULL UNIQUE,
    source     text NOT NULL DEFAULT '',
    enabled    boolean NOT NULL DEFAULT true,
    want_fps   double precision NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zones (
    id         uuid PRIMARY KEY,
    camera_id  uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    name       text NOT NULL,
    polygon    jsonb NOT NULL,          -- vertices in the camera's pixel space
    enabled    boolean NOT NULL DEFAULT true,
    UNIQUE (camera_id, name)
);

CREATE TABLE IF NOT EXISTS tracks (
    id             uuid PRIMARY KEY,
    camera_id      uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    global_track_id integer NOT NULL,
    tracker_backend text NOT NULL DEFAULT 'bytetrack',
    class_id       integer NOT NULL,
    class_name     text NOT NULL DEFAULT '',
    first_seen_at  timestamptz NOT NULL,
    last_seen_at   timestamptz NOT NULL,
    ended_at       timestamptz,
    frames_seen    integer NOT NULL DEFAULT 0,
    coasted_frames integer NOT NULL DEFAULT 0,
    peak_confidence double precision NOT NULL DEFAULT 0,
    last_box       jsonb NOT NULL,      -- [x1, y1, x2, y2] in camera pixel space
    UNIQUE (camera_id, global_track_id)
);
CREATE INDEX IF NOT EXISTS idx_tracks_camera_last_seen ON tracks (camera_id, last_seen_at);

CREATE TABLE IF NOT EXISTS detections (
    id         bigserial PRIMARY KEY,
    camera_id  uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    track_id   uuid REFERENCES tracks(id) ON DELETE SET NULL,
    ts         timestamptz NOT NULL,
    frame_idx  bigint NOT NULL,
    x1 double precision NOT NULL,
    y1 double precision NOT NULL,
    x2 double precision NOT NULL,
    y2 double precision NOT NULL,
    confidence double precision NOT NULL,
    class_id   integer NOT NULL,
    class_name text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_detections_camera_ts ON detections (camera_id, ts);

CREATE TABLE IF NOT EXISTS events (
    id         uuid PRIMARY KEY,
    camera_id  uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    track_id   uuid REFERENCES tracks(id) ON DELETE SET NULL,
    zone_id    uuid REFERENCES zones(id) ON DELETE SET NULL,
    event_type text NOT NULL CHECK (
        event_type IN ('visible','entered_zone','left_zone','stationary','loitering','tailgating','active','gone','external')
    ),
    started_at timestamptz NOT NULL,
    ended_at   timestamptz,
    severity   text NOT NULL DEFAULT 'detection',
    reviewed   boolean NOT NULL DEFAULT false,
    data       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_events_camera_type_start ON events (camera_id, event_type, started_at);
CREATE INDEX IF NOT EXISTS idx_events_track ON events (track_id);
CREATE INDEX IF NOT EXISTS idx_events_zone ON events (zone_id);
CREATE INDEX IF NOT EXISTS idx_events_open_zone ON events (zone_id, event_type) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS embeddings (
    id         uuid PRIMARY KEY,
    track_id   uuid REFERENCES tracks(id) ON DELETE CASCADE,
    model      text NOT NULL,
    vector     vector(1024) NOT NULL,
    meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_embeddings_track ON embeddings (track_id);

CREATE TABLE IF NOT EXISTS segments (
    id         uuid PRIMARY KEY,
    camera_id  uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL,
    ended_at   timestamptz NOT NULL,
    labels     jsonb NOT NULL DEFAULT '[]'::jsonb,
    severity   text NOT NULL DEFAULT 'detection',
    thumbnail  jsonb NOT NULL DEFAULT '{}'::jsonb,
    reviewed   boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_segments_camera_start ON segments (camera_id, started_at);

CREATE TABLE IF NOT EXISTS incidents (
    id         uuid PRIMARY KEY,
    camera_id  uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    event_type text NOT NULL DEFAULT 'incident',
    title      text NOT NULL DEFAULT '',
    started_at timestamptz NOT NULL,
    ended_at   timestamptz,
    data       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_incidents_camera_start ON incidents (camera_id, started_at);

COMMIT;