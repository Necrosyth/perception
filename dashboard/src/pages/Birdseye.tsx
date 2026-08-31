import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, PageHeader } from "../components/ui";
import { VideoTile } from "../components/VideoTile";
import { cameras } from "../lib/mock";
import { I } from "../components/icons";

const layouts = ["2x2", "3x3", "Composite"] as const;

export default function Birdseye() {
  const [layout, setLayout] = useState<(typeof layouts)[number]>("2x2");
  const [follow, setFollow] = useState(false);
  const pool = cameras.filter((c) => c.enabled);
  const shown = layout === "2x2" ? pool.slice(0, 4) : pool;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Birds Eye Tactical Composite"
        subtitle="Hardware-accelerated multi-camera restream matrix via go2rtc proxy"
        badge={
          <Badge tone="cyan" dot={true}>
            RADAR MATRIX ACTIVE
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            {layouts.map((l) => (
              <Button
                key={l}
                variant={layout === l ? "glow" : "outline"}
                size="sm"
                onClick={() => setLayout(l)}
              >
                {l}
              </Button>
            ))}
            <Button
              variant={follow ? "solid" : "outline"}
              size="sm"
              onClick={() => setFollow((v) => !v)}
              title="PTZ auto-track active objects"
            >
              <I.Crosshair className="h-3.5 w-3.5" />
              Auto-Track {follow ? "Engaged" : "Standby"}
            </Button>
          </div>
        }
      />

      {/* Tactical Container */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0a1526] to-[#060b13] p-4 shadow-2xl">
        {/* Radar Center HUD Marker */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
          <div className="flex items-center gap-2 rounded-full border border-[#2fbfa4]/30 bg-[#060b13]/85 px-4 py-1.5 backdrop-blur-md shadow-[0_0_20px_rgba(47,191,164,0.2)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00e5ff] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00e5ff]" />
            </span>
            <span className="font-mono text-xs font-bold tracking-widest text-[#38efff]">
              TACTICAL BIRDSEYE COMPOSITE
            </span>
          </div>
        </div>

        {/* Video Grid */}
        <div
          className={`grid gap-3 ${
            shown.length <= 4
              ? "grid-cols-1 sm:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          }`}
        >
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

      {/* Info Card */}
      <Card className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <I.Gauge className="h-4 w-4 text-[#2fbfa4]" />
          <span>
            Single multiplexed WebRTC connection saves 75% client CPU & bandwidth overhead.
          </span>
        </div>
        <Link to="/" className="text-[#2fbfa4] hover:underline font-semibold flex items-center gap-1">
          Back to Live Grid →
        </Link>
      </Card>
    </div>
  );
}