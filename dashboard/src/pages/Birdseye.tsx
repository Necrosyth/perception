import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, PageHeader } from "../components/ui";
import { VideoTile } from "../components/VideoTile";
import { cameras } from "../lib/mock";
import { I } from "../components/icons";

const layouts = ["2x2", "3x3", "custom"] as const;

export default function Birdseye() {
  const [layout, setLayout] = useState<(typeof layouts)[number]>("2x2");
  const [follow, setFollow] = useState(false);
  const pool = cameras.filter((c) => c.enabled);
  const shown = layout === "2x2" ? pool.slice(0, 4) : pool;

  return (
    <div>
      <PageHeader
        title="Birds Eye"
        subtitle="Multi-camera composite — go2rtc restream composes all enabled sources"
        actions={
          <>
            {layouts.map((l) => (
              <Button key={l} variant={layout === l ? "solid" : "outline"} size="sm" onClick={() => setLayout(l)}>
                {l}
              </Button>
            ))}
            <Button
              variant={follow ? "solid" : "outline"}
              size="sm"
              onClick={() => setFollow((v) => !v)}
              title="PTZ auto-track active objects"
            >
              <I.Crosshair className="h-3.5 w-3.5" /> Auto-track {follow ? "on" : "off"}
            </Button>
          </>
        }
      />

      <div className="relative overflow-hidden rounded-xl border border-aina-teal/25 bg-aina-navy p-2">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Badge tone="teal" className="bg-black/30 backdrop-blur">BIRDS EYE — COMPOSITE</Badge>
        </div>
        <div className={`grid gap-2 ${shown.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
          {shown.map((c) => (
            <VideoTile
              key={c.id}
              aspect="aspect-video"
              meta={{
                id: c.id,
                name: c.name,
                zones: [],
                hasMotion: c.hasMotion,
                fps: c.fps,
                palette: c.palette,
                live: true,
              }}
            />
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-aina-slate">
        Composite is rendered server-side via go2rtc; the dashboard consumes one restream instead of N camera streams.{" "}
        <Link to="/" className="text-aina-teal hover:underline">Back to grid →</Link>
      </p>
    </div>
  );
}