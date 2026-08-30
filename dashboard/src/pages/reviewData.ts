import { cameras, calendarDays, reviewSegments } from "../lib/mock";
import type { Label } from "../lib/mock";
import type { Severity } from "../lib/mock";

export type { Label, Severity };

export const labels: Label[] = [
  "person", "car", "truck", "forklift", "box", "pallet",
  "face", "license_plate", "loitering", "vehicle",
];

export const calendars = {
  cameras,
  days: calendarDays.map((d) => ({
    yyyymmdd: d.yyyymmdd,
    alerts: d.alerts,
    detections: d.detections,
  })),
  segments: reviewSegments.map((s) => ({
    id: s.id,
    cameraId: s.cameraId,
    label: s.label,
    severity: s.severity as Severity,
    start: s.start,
    end: s.end,
    zones: s.zones,
    reviewed: s.reviewed,
    score: s.score,
  })),
};

export const severitySort = { alert: 0, detection: 1, significant_motion: 2 } as const;