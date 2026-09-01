// Real-data access layer for the dashboard (Stage 10 — live sources).
//
// Cameras come from the Hypotenuse API (`/api/cameras`); each live tile's <video>
// eats a go2rtc restream of the same `name` via the nginx /media proxy
// (`/media/api/stream.mp4?src=<name>`). When the API is unreachable the
// callers fall back to src/lib/mock so the UI still renders standalone.
import { useEffect, useState } from "react";

export type ApiCameraRow = {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
};

export type MediaCamera = {
  id: string; // go2rtc/API stream id == camera name
  name: string; // display name
  enabled: boolean;
  zones: string[];
  hasMotion: boolean;
  fps: number;
  bitrate: string;
  ptz: boolean;
  lastActivity: number;
  palette: [string, string];
  source?: string;
};

const PALETTES: [string, string][] = [
  ["#0d2c46", "#0b1f3a"],
  ["#10424b", "#0b1f3a"],
  ["#3a2a4b", "#0b1f3a"],
  ["#4b3a1f", "#0b1f3a"],
  ["#1f3a4b", "#0b1f3a"],
  ["#3d2840", "#0b1f3a"],
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function displayName(name: string): string {
  return name
    .split(/[_\-]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

async function fetchJson<T>(url: string, timeoutMs = 4000): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function mutateJson<T>(
  url: string,
  method: string,
  body?: unknown,
  timeoutMs = 6000,
): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      try {
        await res.json();
      } catch {
        /* ignore */
      }
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getCameras(): Promise<MediaCamera[] | null> {
  const data = await fetchJson<{ cameras?: ApiCameraRow[] }>("/api/cameras");
  if (!data || !Array.isArray(data.cameras) || data.cameras.length === 0) return null;
  return data.cameras.map((row) => {
    const palette = PALETTES[hashStr(row.name) % PALETTES.length];
    return {
      id: row.name,
      name: displayName(row.name),
      enabled: row.enabled,
      zones: [],
      hasMotion: false,
      fps: 0,
      bitrate: "—",
      ptz: false,
      lastActivity: Date.now(),
      palette,
      source: row.source,
    };
  });
}

/** go2rtc restream URL for a camera's <video> tile (same-origin via nginx). */
export function streamUrl(cameraId: string): string {
  return `/media/api/stream.mp4?src=${encodeURIComponent(cameraId)}`;
}

// --------------------------------------------------------------------------- //
// Stage 7 — semantic search (Explore). Real CLIP embeddings + pgvector KNN via
// /api/search; mock fallback keeps the page rendering without the API.
// --------------------------------------------------------------------------- //

export type ExploreHit = {
  embedding_id: string;
  track_id: number;
  camera: string;
  zone: string | null;
  label: string;
  confidence: number | null;
  captured_at: number | null;
  similarity: number | null;
  thumbnail: string | null;
  model: string;
};

export type ExploreSummaryRow = { label: string; count: number };

export type SearchParams = {
  q?: string;
  camera?: string;
  label?: string;
  similar?: string;
  sort?: "relevance" | "date";
  limit?: number;
};

export async function searchExplore(params: SearchParams): Promise<ExploreHit[] | null> {
  const sp = new URLSearchParams();
  if (params.q?.trim()) sp.set("q", params.q.trim());
  if (params.camera && params.camera !== "all") sp.set("camera", params.camera);
  if (params.label && params.label !== "all") sp.set("label", params.label);
  if (params.similar) sp.set("similar", params.similar);
  if (params.sort) sp.set("sort", params.sort);
  sp.set("limit", String(params.limit ?? 24));
  const data = await fetchJson<{ results?: ExploreHit[] }>(`/api/search?${sp.toString()}`, 20000);
  return data && Array.isArray(data.results) ? data.results : null;
}

export async function exploreSummary(): Promise<ExploreSummaryRow[] | null> {
  const data = await fetchJson<{ summary?: ExploreSummaryRow[] }>("/api/explore/summary", 8000);
  return data && Array.isArray(data.summary) ? data.summary : null;
}

/** Live camera list with graceful empty-until-loaded fallback. */
export function useCameras(intervalMs = 10000): { cameras: MediaCamera[]; fromApi: boolean } {
  const [cameras, setCameras] = useState<MediaCamera[]>([]);
  const [fromApi, setFromApi] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const real = await getCameras();
      if (cancelled) return;
      setCameras(real ?? []);
      setFromApi(real !== null);
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);
  return { cameras, fromApi };
}

// --------------------------------------------------------------------------- //
// Review segments — real rows written by perception /api/segments
// --------------------------------------------------------------------------- //

export type Segment = {
  id: string;
  camera: string;
  camera_id: string;
  label: string;
  labels: string;
  started_at: string;
  ended_at: string;
  severity: string;
  reviewed: boolean;
  thumbnail: string | null;
};

export async function getSegments(
  params: { camera?: string; label?: string; from?: string; to?: string; limit?: number } = {},
): Promise<Segment[] | null> {
  const sp = new URLSearchParams();
  if (params.camera) sp.set("camera", params.camera);
  if (params.label) sp.set("label", params.label);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  sp.set("limit", String(params.limit ?? 200));
  const data = await fetchJson<{ segments?: Segment[] }>(`/api/segments?${sp.toString()}`, 10000);
  return data && Array.isArray(data.segments) ? data.segments : null;
}

export async function getSegment(id: string): Promise<Segment | null> {
  const data = await fetchJson<{ segments?: Segment[] }>(`/api/segments/${id}`, 8000);
  return data && Array.isArray(data.segments) && data.segments.length ? data.segments[0] : null;
}

export async function getSegmentPlay(id: string) {
  return fetchJson<{
    recording_dir?: string;
    recordings?: string[];
    live_url?: string;
    camera?: string;
  }>(`/api/segments/${id}/play`, 8000);
}

export async function markSegmentReviewed(id: string, reviewed: boolean): Promise<boolean> {
  const res = await mutateJson<{ reviewed?: boolean }>(
    `/api/segments/${id}/reviewed?reviewed=${reviewed}`,
    "POST",
  );
  return res?.reviewed === reviewed;
}

// --------------------------------------------------------------------------- //
// Zones — real rows from /api/zones
// --------------------------------------------------------------------------- //

export type ZoneRow = {
  id: string;
  camera: string;
  name: string;
  polygon: number[][];
  enabled?: boolean;
};

export async function getZones(): Promise<ZoneRow[] | null> {
  const data = await fetchJson<{ zones?: ZoneRow[] }>("/api/zones", 8000);
  return data && Array.isArray(data.zones) ? data.zones : null;
}

export async function createZone(camera: string, name: string, polygon: number[][]): Promise<ZoneRow | null> {
  return mutateJson<ZoneRow>(`/api/zones`, "POST", { camera, name, polygon });
}

export async function deleteZone(id: string): Promise<boolean> {
  const res = await mutateJson<{ deleted?: boolean }>(`/api/zones/${id}`, "DELETE");
  return res?.deleted === true;
}

// --------------------------------------------------------------------------- //
// System + notifications — real aggregations
// --------------------------------------------------------------------------- //

export type SystemSummary = {
  camera_count: number;
  track_count: number;
  detection_count: number;
  event_count: number;
  segment_count: number;
  embedding_count: number;
  zones: string[];
  perception_rpc: boolean;
};

export async function getSystem(): Promise<SystemSummary | null> {
  return fetchJson<SystemSummary>("/api/system", 8000);
}

export type Notification = {
  camera: string;
  zone: string | null;
  event_type: string;
  started_at: string;
  severity: string;
};

export async function getNotifications(limit = 20): Promise<Notification[] | null> {
  const data = await fetchJson<{ notifications?: Notification[] }>(
    `/api/notifications?limit=${limit}`,
    8000,
  );
  return data && Array.isArray(data.notifications) ? data.notifications : null;
}