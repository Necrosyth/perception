// Real-data access layer for the dashboard (Stage 10 — live sources).
//
// Cameras come from the Hypotenuse API (`/api/cameras`); each live tile's <video>
// eats a go2rtc restream of the same `name` via the nginx /media proxy
// (`/media/api/stream.mp4?src=<name>`). When the API is unreachable the
// callers fall back to src/lib/mock so the UI still renders standalone.
import { useEffect, useState } from "react";
import { cameras as mockCameras } from "./mock";

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

export async function getCameras(): Promise<MediaCamera[] | null> {
  const data = await fetchJson<{ cameras?: ApiCameraRow[] }>("/api/cameras");
  if (!data || !Array.isArray(data.cameras) || data.cameras.length === 0) return null;
  return data.cameras.map((row) => {
    const mock = mockCameras.find((c) => c.id === row.name);
    const palette = mock?.palette ?? PALETTES[hashStr(row.name) % PALETTES.length];
    return {
      id: row.name,
      name: mock?.name ?? displayName(row.name),
      enabled: row.enabled,
      zones: mock?.zones ?? [],
      hasMotion: mock?.hasMotion ?? false,
      fps: mock?.fps ?? 0,
      bitrate: mock?.bitrate ?? "—",
      ptz: mock?.ptz ?? false,
      lastActivity: mock?.lastActivity ?? Date.now(),
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

/** Live camera list with mock fallback; refresh every `intervalMs`. */
export function useCameras(intervalMs = 10000): { cameras: MediaCamera[]; fromApi: boolean } {
  const [cameras, setCameras] = useState<MediaCamera[]>(mockCameras);
  const [fromApi, setFromApi] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const real = await getCameras();
      if (cancelled) return;
      setCameras(real ?? mockCameras);
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