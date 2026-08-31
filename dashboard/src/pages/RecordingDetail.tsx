import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card } from "../components/ui";
import { I } from "../components/icons";
import { cameras, timelineHours, reviewSegments } from "../lib/mock";
import { duration, timeHHMM, timeHHMMSS } from "../lib/utils";

export default function RecordingDetail() {
  const { segmentId = reviewSegments[0].id } = useParams();
  const seg = useMemo(
    () => reviewSegments.find((s) => s.id === segmentId) ?? reviewSegments[0],
    [segmentId],
  );
  const cam = cameras.find((c) => c.id === seg.cameraId) ?? cameras[0];

  const [pos, setPos] = useState(0.42);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<"1x" | "2x" | "4x">("1x");
  const [exported, setExported] = useState(false);

  const start = seg.start;
  const end = seg.end;
  const tAt = (p: number) => start + (end - start) * p;

  const handleExport = () => {
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-obs-fg-faint">
        <Link to="/review" className="text-obs-fg-dim hover:text-obs-fg transition-colors flex items-center gap-1">
          <I.History className="h-3 w-3" /> Events
        </Link>
        <span>/</span>
        <span className="text-obs-fg">{seg.label} · {cam.name}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-lg border border-obs-line bg-obs-2">
            <div
              className="aspect-video relative overflow-hidden"
              style={{
                background: `linear-gradient(150deg, ${cam.palette[0]} 0%, ${cam.palette[1]} 100%)`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/50" />

              {/* Play / Pause */}
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border border-obs-accent/40 bg-black/50 text-obs-fg backdrop-blur-sm transition-colors hover:bg-black/70 active:scale-95"
                >
                  {playing ? (
                    <I.Pause className="h-7 w-7" />
                  ) : (
                    <I.Play className="h-7 w-7 translate-x-0.5" />
                  )}
                </button>
              </div>

              <div className="absolute left-4 top-4 flex items-center gap-2 z-10">
                <Badge tone={seg.severity === "alert" ? "alert" : "ok"} dot>
                  {seg.severity}
                </Badge>
                <Badge tone="neutral">{cam.name}</Badge>
              </div>

              <div className="absolute right-4 top-4 rounded bg-black/55 px-2.5 py-1 font-mono text-xs text-obs-fg-dim backdrop-blur-sm z-10">
                {(pos * 100).toFixed(0)}% · {timeHHMMSS(tAt(pos))}
              </div>

              <div className="absolute bottom-4 left-4 rounded bg-black/55 px-3 py-1 font-mono text-xs text-obs-fg-dim backdrop-blur-sm z-10">
                START: {timeHHMMSS(start)} &mdash; END: {timeHHMMSS(end)}
              </div>
            </div>
          </div>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-obs-fg-dim">
              <span className="text-obs-fg">{timeHHMM(start)}</span>
              <span className="text-obs-accent-strong">
                {timeHHMMSS(tAt(pos))}
              </span>
              <span className="text-obs-fg">{timeHHMM(end)}</span>
            </div>

            {/* Scrubber */}
            <div
              className="relative h-12 cursor-pointer overflow-hidden rounded-md border border-obs-line bg-obs-1 select-none group"
              onMouseDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setPos(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
              }}
            >
              <div className="absolute inset-x-0 top-0 bottom-[40%] flex items-end gap-px px-1">
                {timelineHours.map((h, i) => (
                  <div key={i} className="flex-1" title={`${h.h}:00 detection activity`}>
                    <div
                      className="w-full rounded-t-sm bg-obs-accent/40 group-hover:bg-obs-accent/50 transition-colors"
                      style={{ height: `${6 + h.d * 1.8}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 top-1/2 flex items-end gap-px px-1">
                {timelineHours.map((h, i) => (
                  <div key={i} className="flex-1" title={`${h.h}:00 alert intensity`}>
                    <div
                      className="w-full rounded-t-sm bg-obs-warn/50 group-hover:bg-obs-warn/60 transition-colors"
                      style={{ height: `${4 + h.a * 2.5}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className="absolute inset-y-0 flex flex-col items-center pointer-events-none" style={{ left: `${pos * 100}%` }}>
                <div className="h-full w-0.5 bg-obs-accent" />
                <div className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-obs-accent border-2 border-obs-0" />
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Button size="sm" variant={playing ? "subtle" : "solid"} onClick={() => setPlaying((p) => !p)}>
                  {playing ? <I.Pause className="h-4 w-4" /> : <I.Play className="h-4 w-4" />}
                  {playing ? "Pause" : "Play"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPos(0)} title="Jump to start">
                  Start
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPos((p) => Math.max(0, p - 0.05))}>
                  -5s
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPos((p) => Math.min(1, p + 0.05))}>
                  +5s
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPos(1)} title="Jump to end">
                  End
                </Button>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-obs-fg-faint">Speed</span>
                {(["1x", "2x", "4x"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors ${
                      speed === s
                        ? "bg-obs-accent/15 text-obs-accent-strong border border-obs-accent/30"
                        : "text-obs-fg-faint hover:text-obs-fg"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <span className="rounded-md border border-obs-line bg-obs-2 px-3 py-1.5 text-obs-fg-dim">
              Zones: <span className="text-obs-accent-strong font-medium">{seg.zones.length ? seg.zones.join(", ") : "None"}</span>
            </span>
            <span className="rounded-md border border-obs-line bg-obs-2 px-3 py-1.5 text-obs-fg-dim">
              Duration: <span className="text-obs-accent-strong font-medium">{duration((end - start) / 1000)}</span>
            </span>
            <span className="rounded-md border border-obs-line bg-obs-2 px-3 py-1.5 text-obs-fg-dim">
              Peak confidence: <span className="text-obs-accent-strong font-medium">{(seg.score * 100).toFixed(0)}%</span>
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
              Event timeline
            </p>
            <div className="space-y-2.5">
              {[
                { t: start, type: "track_visible", desc: "Object entered frame" },
                { t: start + 3000, type: "entered_zone", desc: "Dock entry polygon breach" },
                { t: start + 8000, type: "stationary", desc: "Zero motion for 5s" },
                ...(seg.label === "loitering"
                  ? [{ t: start + 12000, type: "loitering", desc: "Exceeded dwell rule 600s" }]
                  : []),
                { t: end, type: "track_closed", desc: "Departed field of view" },
              ].map((e, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-obs-line bg-obs-1 p-2.5">
                  <div>
                    <Badge
                      tone={
                        e.type === "stationary" || e.type === "loitering"
                          ? "warn"
                          : e.type.includes("track")
                            ? "slate"
                            : "ok"
                      }
                    >
                      {e.type.replace(/_/g, " ")}
                    </Badge>
                    <p className="mt-1 text-[11px] text-obs-fg-dim">{e.desc}</p>
                  </div>
                  <span className="font-mono text-[10px] text-obs-fg-faint">{timeHHMMSS(e.t)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 space-y-2.5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
              Actions
            </p>
            <Button variant="solid" size="sm" className="w-full" onClick={handleExport}>
              <I.Download className="h-4 w-4" />
              {exported ? "Export started" : "Export MP4"}
            </Button>
            <Link to={`/explore`} className="block">
              <Button variant="outline" size="sm" className="w-full">
                <I.Search className="h-4 w-4" /> Find similar
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
