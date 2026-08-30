// Stage 1 mock data — everything is fake data; Stage 10 replaces each source
// with the equivalent real API call (see docs/FRIGATE_FEATURE_ANALYSIS.md §6).

export type Camera = {
  id: string;
  name: string;
  zones: string[];
  enabled: boolean;
  fps: number;
  bitrate: string;
  loading: number;
  lastActivity: number;
  hasMotion: boolean;
  ptz: boolean;
  palette: [string, string];
};

export const cameras: Camera[] = [
  { id: "loading_dock", name: "Loading Dock", zones: ["dock_entry", "dock_bay"], enabled: true, fps: 11.8, bitrate: "4.2 Mbps", loading: 18, lastActivity: Date.now() - 30_000, hasMotion: false, ptz: true, palette: ["#0d2c46", "#0b1f3a"] },
  { id: "warehouse_east", name: "Warehouse — East", zones: ["aisle_4"], enabled: true, fps: 12.1, bitrate: "3.9 Mbps", loading: 11, lastActivity: Date.now() - 4 * 60_000, hasMotion: true, ptz: false, palette: ["#10424b", "#0b1f3a"] },
  { id: "warehouse_west", name: "Warehouse — West", zones: ["dock_entry"], enabled: true, fps: 11.6, bitrate: "4.0 Mbps", loading: 22, lastActivity: Date.now() - 90_000, hasMotion: false, ptz: false, palette: ["#3a2a4b", "#0b1f3a"] },
  { id: "parking_north", name: "Parking — North", zones: ["perimeter"], enabled: true, fps: 12.0, bitrate: "3.2 Mbps", loading: 3, lastActivity: Date.now() - 26 * 60_000, hasMotion: false, ptz: true, palette: ["#4b3a1f", "#0b1f3a"] },
  { id: "parking_south", name: "Parking — South", zones: ["gate"], enabled: false, fps: 0, bitrate: "—", loading: 0, lastActivity: Date.now() - 3 * 3600_000, hasMotion: false, ptz: false, palette: ["#3d2840", "#0b1f3a"] },
  { id: "lobby", name: "Lobby Entrance", zones: ["doorway"], enabled: true, fps: 11.9, bitrate: "2.1 Mbps", loading: 7, lastActivity: Date.now() - 50_000, hasMotion: true, ptz: false, palette: ["#1f3a4b", "#0b1f3a"] },
];

export const labels = [
  "person",
  "car",
  "truck",
  "forklift",
  "box",
  "pallet",
  "face",
  "license_plate",
  "loitering",
  "vehicle",
] as const;

export type Label = (typeof labels)[number];

export type Severity = "alert" | "detection" | "significant_motion";

export type ReviewSegment = {
  id: string;
  cameraId: string;
  label: Label;
  severity: Severity;
  start: number;
  end: number;
  zones: string[];
  reviewed: boolean;
  score: number;
  thumbSeed: number;
};

function todayAt(h: number, m = 0): number {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function seed(n: number) {
  const x = Math.sin(n * 999) * 10000;
  return x - Math.floor(x);
}

export const reviewSegments: ReviewSegment[] = [
  { id: "seg_301", cameraId: "loading_dock", label: "person", severity: "alert", start: todayAt(0, 12), end: todayAt(0, 18), zones: ["dock_entry"], reviewed: false, score: 0.92, thumbSeed: 1 },
  { id: "seg_302", cameraId: "loading_dock", label: "forklift", severity: "detection", start: todayAt(6, 4), end: todayAt(6, 6), zones: ["dock_bay"], reviewed: false, score: 0.81, thumbSeed: 2 },
  { id: "seg_303", cameraId: "warehouse_east", label: "person", severity: "detection", start: todayAt(7, 31), end: todayAt(7, 34), zones: ["aisle_4"], reviewed: true, score: 0.77, thumbSeed: 3 },
  { id: "seg_304", cameraId: "loading_dock", label: "truck", severity: "detection", start: todayAt(8, 2), end: todayAt(8, 11), zones: ["dock_bay"], reviewed: false, score: 0.89, thumbSeed: 4 },
  { id: "seg_305", cameraId: "lobby", label: "person", severity: "alert", start: todayAt(8, 40), end: todayAt(8, 42), zones: ["doorway"], reviewed: false, score: 0.94, thumbSeed: 5 },
  { id: "seg_306", cameraId: "warehouse_east", label: "forklift", severity: "alert", start: todayAt(9, 5), end: todayAt(9, 7), zones: ["aisle_4"], reviewed: false, score: 0.85, thumbSeed: 6 },
  { id: "seg_307", cameraId: "loading_dock", label: "loitering", severity: "alert", start: todayAt(9, 22), end: todayAt(9, 35), zones: ["dock_entry"], reviewed: false, score: 0.98, thumbSeed: 7 },
  { id: "seg_308", cameraId: "parking_north", label: "vehicle", severity: "significant_motion", start: todayAt(10, 0), end: todayAt(10, 1), zones: [], reviewed: true, score: 0.42, thumbSeed: 8 },
  { id: "seg_309", cameraId: "loading_dock", label: "person", severity: "alert", start: todayAt(11, 2), end: todayAt(11, 3), zones: ["dock_entry"], reviewed: false, score: 0.9, thumbSeed: 9 },
  { id: "seg_310", cameraId: "warehouse_west", label: "car", severity: "detection", start: todayAt(12, 15), end: todayAt(12, 17), zones: [], reviewed: false, score: 0.74, thumbSeed: 10 },
  { id: "seg_311", cameraId: "lobby", label: "face", severity: "detection", start: todayAt(13, 5), end: todayAt(13, 9), zones: ["doorway"], reviewed: false, score: 0.88, thumbSeed: 11 },
  { id: "seg_312", cameraId: "loading_dock", label: "truck", severity: "alert", start: todayAt(14, 40), end: todayAt(14, 55), zones: ["dock_bay"], reviewed: false, score: 0.91, thumbSeed: 12 },
  { id: "seg_313", cameraId: "warehouse_east", label: "person", severity: "significant_motion", start: todayAt(15, 10), end: todayAt(15, 11), zones: [], reviewed: false, score: 0.5, thumbSeed: 13 },
  { id: "seg_314", cameraId: "loading_dock", label: "license_plate", severity: "alert", start: todayAt(16, 27), end: todayAt(16, 33), zones: ["dock_entry"], reviewed: false, score: 0.96, thumbSeed: 14 },
];

export const calendarDays = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const yyyymmdd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    yyyymmdd,
    alerts: Math.floor(seed(i + 100) * 14) + (i === 0 ? 6 : 0),
    detections: Math.floor(seed(i + 200) * 38) + (i === 0 ? 11 : 0),
  };
});

export const timelineHours = [
  { h: 0, a: 1, d: 2 },
  { h: 2, a: 0, d: 1 },
  { h: 4, a: 0, d: 3 },
  { h: 6, a: 2, d: 5 },
  { h: 8, a: 8, d: 14 },
  { h: 10, a: 6, d: 12 },
  { h: 12, a: 4, d: 9 },
  { h: 14, a: 7, d: 16 },
  { h: 16, a: 5, d: 11 },
  { h: 18, a: 3, d: 8 },
  { h: 20, a: 1, d: 4 },
  { h: 22, a: 0, d: 2 },
];

export type ExploreResult = {
  id: string;
  cameraId: string;
  label: Label;
  score: number;
  start: number;
  zones: string[];
  caption?: string;
  thumbSeed: number;
};

export const exploreResults: ExploreResult[] = [
  { id: "res_1", cameraId: "loading_dock", label: "person", score: 0.973, start: todayAt(9, 22), zones: ["dock_entry"], caption: "person in red high-vis near dock entry", thumbSeed: 21 },
  { id: "res_2", cameraId: "loading_dock", label: "loitering", score: 0.961, start: todayAt(9, 25), zones: ["dock_entry"], thumbSeed: 22 },
  { id: "res_3", cameraId: "lobby", label: "person", score: 0.938, start: todayAt(8, 40), zones: ["doorway"], caption: "person in red high-vis near dock entry", thumbSeed: 23 },
  { id: "res_4", cameraId: "loading_dock", label: "truck", score: 0.911, start: todayAt(14, 40), zones: ["dock_bay"], thumbSeed: 24 },
  { id: "res_5", cameraId: "warehouse_east", label: "forklift", score: 0.892, start: todayAt(9, 5), zones: ["aisle_4"], thumbSeed: 25 },
  { id: "res_6", cameraId: "parking_north", label: "car", score: 0.855, start: todayAt(10, 0), zones: [], thumbSeed: 26 },
  { id: "res_7", cameraId: "loading_dock", label: "face", score: 0.844, start: todayAt(0, 12), zones: ["dock_entry"], thumbSeed: 27 },
  { id: "res_8", cameraId: "warehouse_west", label: "person", score: 0.821, start: todayAt(12, 15), zones: [], thumbSeed: 28 },
  { id: "res_9", cameraId: "loading_dock", label: "car", score: 0.786, start: todayAt(16, 27), zones: ["dock_entry"], thumbSeed: 29 },
  { id: "res_10", cameraId: "lobby", label: "face", score: 0.774, start: todayAt(13, 5), zones: ["doorway"], thumbSeed: 30 },
];

export const modules: { name: string; key: string; enabled: boolean; fps: number; notes: string }[] = [
  { name: "object_detection", key: "yolo26s · one_to_one", enabled: true, fps: 11.9, notes: "TensorRT engine cached (sm_89)" },
  { name: "tracking", key: "bytetrack", enabled: true, fps: 11.9, notes: "track_buffer 1.0s → 12 frames @ 11.9fps" },
  { name: "behavior.loitering", key: "dwell 600s", enabled: true, fps: 0, notes: "debounced by (event_type, tracker_id)" },
  { name: "semantic_search", key: "local_clip", enabled: true, fps: 0, notes: "Jina CLIP — async off hot path" },
  { name: "face_recognition", key: "off", enabled: false, fps: 0, notes: "config toggle" },
  { name: "anpr", key: "off", enabled: false, fps: 0, notes: "config toggle" },
];

export const systemStats = {
  detector: { fps: 11.9, inferenceMs: 42, load: 18, pending: 0 },
  cameras,
  gpu: { name: "NVIDIA GeForce RTX 4050 (Ada)", util: 23, memUsed: 1536, memTotal: 6141, temperature: 53 },
  uptime: "3d 4h",
  version: "0.1.0-alpha",
};