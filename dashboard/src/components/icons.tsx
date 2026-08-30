import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
} as const;

export const I = {
  Grid: (p: P) => (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Video: (p: P) => (
    <svg {...base} {...p}>
      <path d="M22 8l-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  ),
  Search: (p: P) => (
    <svg {...base} {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  History: (p: P) => (
    <svg {...base} {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  Zone: (p: P) => (
    <svg {...base} {...p}>
      <path d="M12 22c4.4-3.6 7-7.1 7-10a7 7 0 1 0-14 0c0 2.9 2.6 6.4 7 10Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ),
  Gauge: (p: P) => (
    <svg {...base} {...p}>
      <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
      <path d="M12 8v5" />
      <path d="m16 11-4 2" />
    </svg>
  ),
  Bell: (p: P) => (
    <svg {...base} {...p}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  ),
  Gear: (p: P) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.03A1.7 1.7 0 0 0 10 3.03V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.03a1.7 1.7 0 0 0 1.57 1H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  ),
  Ping: (p: P) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="12" r="6" opacity="0.4" />
      <circle cx="12" cy="12" r="9" opacity="0.2" />
    </svg>
  ),
  BellOn: (p: P) => (
    <svg {...base} {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
      <path d="M19 8v3" />
    </svg>
  ),
  Pause: (p: P) => (
    <svg {...base} {...p}>
      <path d="M10 4H6v16h4zM18 4h-4v16h4z" />
    </svg>
  ),
  Play: (p: P) => (
    <svg {...base} {...p}>
      <path d="m6 4 14 8-14 8V4Z" />
    </svg>
  ),
  Crosshair: (p: P) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  ),
  Replay: (p: P) => (
    <svg {...base} {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  Book: (p: P) => (
    <svg {...base} {...p}>
      <path d="M16 4.5C13.5 3.5 10.5 3.5 8 4.5v15c2.5-1 5.5-1 8 0v-15Z" />
      <path d="M4 19.5v-14C6.5 4.5 9.5 4.5 12 5.5" />
      <path d="M12 5.5v14" />
      <path d="M20 5.5v10.5" />
    </svg>
  ),
} as const;

export type IconName = keyof typeof I;