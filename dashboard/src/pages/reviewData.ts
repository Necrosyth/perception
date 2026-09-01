// Real-data types + derived constants for the Review journal. The mock
// `calendars`/`labels` are gone — segments come live from /api/segments.

export type Severity = "alert" | "detection" | "significant_motion" | "motion";

// COCO80 label set surfaced from the perception detector (see api/search).
export const labels: string[] = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
  "truck", "boat", "traffic light",
];

export const severitySort = { alert: 0, detection: 1, significant_motion: 2 } as const;