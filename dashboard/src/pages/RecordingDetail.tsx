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
      {/* Breadcrumb Header */}
      <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
        <Link to="/review" className="text-slate-400 hover:text-[#2fbfa4] transition-colors flex items-center gap-1">
          <I.History className="h-3 w-3" /> Events Journal
        </Link>
        <span>/</span>
        <span className="text-[#38efcb] font-semibold">
          {seg.label.toUpperCase()} · {cam.name}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Main Video Viewport & Scrubber */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#07111e] shadow-2xl">
            <div
              className="aspect-video relative overflow-hidden"
              style={{
                background: `radial-gradient(ellipse at 50% 30%, ${cam.palette[0]}cc 0%, ${cam.palette[1]}ee 75%, #050b12 100%)`,
              }}
            >
              {/* Scanline shader overlay */}
              <div className="absolute inset-0 hud-scanlines opacity-35" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/60" />

              {/* Viewfinder corner brackets */}
              <div className="pointer-events-none absolute inset-4">
                <div className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-[#2fbfa4]/50" />
                <div className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-[#2fbfa4]/50" />
                <div className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-[#2fbfa4]/50" />
                <div className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-[#2fbfa4]/50" />
              </div>

              {/* Play / Pause Big Center Button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full border border-[#2fbfa4]/50 bg-[#060c16]/80 text-[#38efcb] backdrop-blur-md transition-all duration-200 hover:scale-110 hover:border-[#2fbfa4] hover:bg-[#2fbfa4]/20 hover:shadow-[0_0_30px_rgba(47,191,164,0.4)] active:scale-95"
                >
                  {playing ? (
                    <I.Pause className="h-8 w-8" />
                  ) : (
                    <I.Play className="h-8 w-8 translate-x-1" />
                  )}
                </button>
              </div>

              {/* HUD Header & Timecode info */}
              <div className="absolute left-4 top-4 flex items-center gap-2 z-10">
                <Badge tone={seg.severity === "alert" ? "red" : "teal"} dot={true}>
                  {seg.severity}
                </Badge>
                <Badge tone="slate">{cam.name}</Badge>
              </div>

              <div className="absolute right-4 top-4 rounded-md bg-black/60 px-2.5 py-1 font-mono text-xs text-[#38efcb] backdrop-blur-md border border-white/10 z-10">
                FRAME: {(pos * 100).toFixed(0)}% · {timeHHMMSS(tAt(pos))}
              </div>

              <div className="absolute bottom-4 left-4 rounded-md bg-black/60 px-3 py-1 font-mono text-xs text-slate-300 backdrop-blur-md border border-white/5 z-10">
                START: {timeHHMMSS(start)} — END: {timeHHMMSS(end)}
              </div>
            </div>
          </div>

          {/* Interactive Scrubber Bar & Speed Controls */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="text-slate-300 font-semibold">{timeHHMM(start)}</span>
              <span className="text-[#2fbfa4] font-bold">
                SCRUBBER POS: {(pos * 100).toFixed(1)}% · {timeHHMMSS(tAt(pos))}
              </span>
              <span className="text-slate-300 font-semibold">{timeHHMM(end)}</span>
            </div>

            {/* Visual Histogram Track */}
            <div
              className="relative h-12 cursor-pointer overflow-hidden rounded-xl border border-slate-800 bg-[#07111e] select-none group"
              onMouseDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setPos(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
              }}
            >
              {/* Top layer: Detections bar */}
              <div className="absolute inset-x-0 top-0 bottom-[40%] flex items-end gap-px px-1">
                {timelineHours.map((h, i) => (
                  <div key={i} className="flex-1" title={`${h.h}:00 Detection Activity`}>
                    <div
                      className="w-full rounded-t-sm bg-[#2fbfa4]/35 group-hover:bg-[#2fbfa4]/50 transition-colors"
                      style={{ height: `${6 + h.d * 1.8}px` }}
                    />
                  </div>
                ))}
              </div>

              {/* Bottom layer: Alerts bar */}
              <div className="absolute inset-x-0 bottom-0 top-1/2 flex items-end gap-px px-1">
                {timelineHours.map((h, i) => (
                  <div key={i} className="flex-1" title={`${h.h}:00 Alert Intensity`}>
                    <div
                      className="w-full rounded-t-sm bg-amber-500/50 group-hover:bg-amber-400/70 transition-colors"
                      style={{ height: `${4 + h.a * 2.5}px` }}
                    />
                  </div>
                ))}
              </div>

              {/* Scrubber Needle Indicator */}
              <div
                className="absolute inset-y-0 flex flex-col items-center pointer-events-none transition-all duration-75"
                style={{ left: `${pos * 100}%` }}
              >
                <div className="h-full w-0.5 bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]" />
                <div className="z-10 absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[#00e5ff] border-2 border-white shadow-[0_0_12px_#00e5ff]" />
              </div>
            </div>

            {/* Playback Controls Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Button size="sm" variant={playing ? "glow" : "solid"} onClick={() => setPlaying((p) => !p)}>
                  {playing ? <I.Pause className="h-4 w-4" /> : <I.Play className="h-4 w-4" />}
                  {playing ? "Pause" : "Play Clip"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPos(0)} title="Jump to start">
                  ⏮ Start
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPos((p) => Math.max(0, p - 0.05))}
                  title="Step -5%"
                >
                  -5s
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPos((p) => Math.min(1, p + 0.05))}
                  title="Step +5%"
                >
                  +5s
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPos(1)} title="Jump to end">
                  End ⏭
                </Button>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-slate-500">SPEED:</span>
                {(["1x", "2x", "4x"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`cursor-pointer rounded px-2 py-0.5 font-bold transition-colors ${
                      speed === s
                        ? "bg-[#2fbfa4]/20 text-[#2fbfa4] border border-[#2fbfa4]/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Quick Details Chips */}
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <span className="rounded-lg border border-slate-800 bg-[#07111e] px-3 py-1.5 text-slate-300">
              Zones: <span className="text-[#2fbfa4] font-semibold">{seg.zones.length ? seg.zones.join(", ") : "None"}</span>
            </span>
            <span className="rounded-lg border border-slate-800 bg-[#07111e] px-3 py-1.5 text-slate-300">
              Duration: <span className="text-[#2fbfa4] font-semibold">{duration((end - start) / 1000)}</span>
            </span>
            <span className="rounded-lg border border-slate-800 bg-[#07111e] px-3 py-1.5 text-slate-300">
              Peak AI Confidence: <span className="text-[#2fbfa4] font-semibold">{(seg.score * 100).toFixed(0)}%</span>
            </span>
          </div>
        </div>

        {/* Sidebar: Event Milestone Sequence & Quick Actions */}
        <div className="space-y-4">
          {/* Milestone timeline */}
          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Inference Event Flow
            </p>
            <div className="space-y-2.5">
              {[
                { t: start, type: "track_visible", desc: "Object entered frame" },
                { t: start + 3000, type: "entered_zone", desc: "Dock Entry polygon breach" },
                { t: start + 8000, type: "stationary", desc: "Zero motion vector 5s" },
                ...(seg.label === "loitering"
                  ? [{ t: start + 12000, type: "loitering", desc: "Exceeded dwell rule 600s" }]
                  : []),
                { t: end, type: "track_closed", desc: "Departed field of view" },
              ].map((e, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-[#07111e] p-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        tone={
                          e.type === "stationary" || e.type === "loitering"
                            ? "amber"
                            : e.type.includes("track")
                              ? "slate"
                              : "teal"
                        }
                      >
                        {e.type}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{e.desc}</p>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">{timeHHMMSS(e.t)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-4 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Action Dispatch
            </p>
            <Button variant="solid" size="sm" className="w-full" onClick={handleExport}>
              <I.Download className="h-4 w-4" />
              {exported ? "Export Triggered ✓" : "Export High-Res MP4"}
            </Button>
            <Link to={`/explore`} className="block">
              <Button variant="outline" size="sm" className="w-full">
                <I.Search className="h-4 w-4" /> Find Similar in Explore
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}