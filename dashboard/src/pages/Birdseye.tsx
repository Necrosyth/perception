import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, MetricCard, PageHeader } from "../components/ui";
import { VideoTile } from "../components/VideoTile";
import { cameras } from "../lib/mock";
import { I } from "../components/icons";
import { timeHHMMSS } from "../lib/utils";

const layouts = ["2x2", "3x3"] as const;

export default function Birdseye() {
  const [layout, setLayout] = useState<(typeof layouts)[number]>("2x2");
  const [follow, setFollow] = useState(false);
  const pool = useMemo(() => cameras.filter((c) => c.enabled), []);
  const shown = layout === "2x2" ? pool.slice(0, 4) : pool;
  const motionCount = pool.filter((c) => c.hasMotion).length;
  const avgFps = pool.length ? (pool.reduce((a, c) => a + c.fps, 0) / pool.length).toFixed(1) : "—";
  const totalBitrate = pool.reduce((a, c) => {
    const mb = parseFloat(c.bitrate.replace(" Mbps", ""));
    return a + (isNaN(mb) ? 0 : mb);
  }, 0).toFixed(1);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bird's Eye"
        subtitle="Multi-camera composite view spanning the facility"
        badge={
          <Badge tone="ok" dot>
            composite active
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            {layouts.map((l) => (
              <Button
                key={l}
                variant={layout === l ? "subtle" : "outline"}
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
              title="Auto-track active objects"
            >
              <I.Crosshair className="h-3.5 w-3.5" />
              Auto-track {follow ? "on" : "off"}
            </Button>
          </div>
        }
      />

      {/* Composite status strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Cameras on matrix" value={shown.length > 0 ? `${shown.length}/${pool.length}` : "0"} unit="feeds" subtitle="Enabled cameras in composite" tone="ok" />
        <MetricCard title="Active motion" value={motionCount} unit="zones" subtitle="Regions with recent activity" tone={motionCount > 0 ? "warn" : "ok"} />
        <MetricCard title="Composite ingest" value={avgFps} unit="FPS" subtitle="Mean stream rate across matrix" tone="accent" />
        <MetricCard title="Total bandwidth" value={`${totalBitrate} Mbps`} unit="client-side" subtitle="Single multiplexed connection" tone="accent" />
      </div>

      {/* Composite matrix */}
      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-obs-fg-faint">
            {layout} matrix · {timeHHMMSS(Date.now())}
          </span>
          <span className="flex items-center gap-2 font-mono text-[10px] text-obs-fg-dim">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-obs-ok" /> sync
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-obs-warn" /> motion
            </span>
          </span>
        </div>
        <div
          className={`grid gap-2.5 rounded bg-obs-0/70 p-2 ${
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
      </Card>

      {/* Footer band */}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-obs-fg-dim">
          <span className="flex items-center gap-2">
            <I.Gauge className="h-4 w-4 text-obs-accent" />
            Multiplexed transport keeps client bandwidth flat while viewing multiple feeds.
          </span>
          <span className="font-mono text-[10px] text-obs-fg-faint">
            {follow ? "tracking active objects" : "static composite · no auto-track"}
          </span>
        </div>
        <Link
          to="/"
          className="flex shrink-0 items-center gap-1 font-medium text-obs-accent transition-colors hover:text-obs-accent-strong"
        >
          Back to Live View
        </Link>
      </Card>
    </div>
  );
}
