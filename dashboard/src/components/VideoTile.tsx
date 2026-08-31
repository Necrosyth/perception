import { useState } from "react";
import { Link } from "react-router-dom";
import { timeHHMMSS } from "../lib/utils";
import { Badge } from "./ui";
import { I } from "./icons";

/** A deterministic muted "CCTV still" — layered tones so a feed reads as footage,
 *  not a flat gradient placeholder. */
export function MockScene({ c1, c2 }: { c1: string; c2: string }) {
  const wall = c1;
  const floor = c2;
  return (
    <>
      {/* base tonal wash */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(155deg, ${wall} 0%, ${wall} 40%, ${floor} 100%)` }}
      />
      {/* ceiling/sky band -> wider ground plane (perspective) */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.12) 34%, rgba(0,0,0,0.02) 40%, rgba(0,0,0,0.38) 100%)`,
        }}
      />
      {/* faint wall/floor seam + structure lines */}
      <div className="absolute inset-x-0 top-[40%] border-t border-white/[0.06]" />
      <div className="absolute left-[16%] top-0 h-full w-px bg-white/[0.03]" />
      <div className="absolute right-[28%] top-0 h-full w-px bg-white/[0.03]" />
      {/* light pool wash from ceiling */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 70% 18%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 55%)",
        }}
      />
      {/* gentle vertical sheen (reads as sensor read-out, not IRIS bloom) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)",
          mixBlendMode: "overlay",
        }}
      />
      {/* vignette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/45" />
    </>
  );
}

export type TileMeta = {
  id: string;
  name: string;
  zones: string[];
  hasMotion: boolean;
  fps: number;
  palette: [string, string];
  live?: boolean;
  objects?: { label: string; box: [number, number, number, number]; color: string; score?: number }[];
  timestamp?: number;
  onNavigate?: string;
  /** go2rtc restream URL; when set the tile plays real video, else the mock scene. */
  streamUrl?: string;
};

export function VideoTile({
  meta,
  aspect = "aspect-video",
  footer,
  showControls = true,
}: {
  meta: TileMeta;
  aspect?: string;
  footer?: React.ReactNode;
  showControls?: boolean;
}) {
  const to = meta.onNavigate ?? `/camera/${meta.id}`;
  const live = meta.live ?? true;
  const ts = meta.timestamp ?? Date.now();
  const [c1, c2] = meta.palette;
  const [videoFailed, setVideoFailed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative overflow-hidden rounded-lg border border-obs-line bg-obs-2 transition-colors duration-200 hover:border-obs-line-strong"
    >
      <Link to={to} className={`block ${aspect} relative overflow-hidden select-none`}>
        {meta.streamUrl && !videoFailed ? (
          <video
            className="absolute inset-0 h-full w-full bg-black object-cover"
            src={meta.streamUrl}
            autoPlay
            muted
            playsInline
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <>
            <MockScene c1={c1} c2={c2} />

            {/* Motion indicator */}
            {meta.hasMotion && (
              <div className="absolute left-3 top-10 h-[22px] w-[30px] rounded-sm border border-obs-warn/70 bg-obs-warn/10">
                <span className="absolute -top-3.5 left-0 rounded bg-obs-warn px-1 py-px text-[8px] font-mono font-semibold uppercase text-obs-0">
                  motion
                </span>
              </div>
            )}

            {/* Bounding boxes */}
            {meta.objects?.map((o, i) => (
              <div
                key={i}
                className="absolute rounded-sm border transition-colors"
                style={{
                  left: `${o.box[0]}%`,
                  top: `${o.box[1]}%`,
                  width: `${o.box[2]}%`,
                  height: `${o.box[3]}%`,
                  borderColor: o.color,
                  backgroundColor: `${o.color}14`,
                }}
              >
                <div
                  className="absolute -top-4.5 left-0 flex items-center gap-1 rounded-t px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
                  style={{ background: o.color, color: "#0c0e11" }}
                >
                  <span>{o.label}</span>
                  {o.score && <span>{(o.score * 100).toFixed(0)}%</span>}
                </div>
              </div>
            ))}

            {videoFailed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                <I.VideoOff className="h-6 w-6 text-obs-fg-faint" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-obs-fg-dim">
                  signal lost
                </span>
              </div>
            )}
          </>
        )}

        {/* Header status */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 z-10">
          {live ? (
            <Badge
              tone={meta.hasMotion ? "warn" : videoFailed ? "slate" : "ok"}
              dot={false}
              className="backdrop-blur-sm bg-black/40"
            >
              {meta.hasMotion ? "MOTION" : videoFailed ? "OFFLINE" : "LIVE"}
            </Badge>
          ) : (
            <Badge tone="neutral" className="backdrop-blur-sm bg-black/40">OFFLINE</Badge>
          )}
          {meta.zones[0] && (
            <Badge tone="slate" className="backdrop-blur-sm bg-black/40 text-obs-fg-dim">
              {meta.zones[0]}
            </Badge>
          )}
        </div>

        {/* Timestamp */}
        <div className="absolute right-2.5 top-2.5 rounded bg-black/55 px-2 py-0.5 font-mono text-[10px] text-obs-fg-dim backdrop-blur-sm z-10">
          {live ? timeHHMMSS(ts) : "—"}
        </div>

        {/* Hover inspect */}
        {showControls && isHovered && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-all z-20">
            <span className="flex items-center gap-1.5 rounded-md border border-obs-accent/40 bg-obs-1/90 px-3 py-1.5 text-xs font-medium text-obs-fg">
              <I.Maximize className="h-3.5 w-3.5 text-obs-accent" /> Inspect
            </span>
          </div>
        )}

        {/* Bottom bar */}
        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-xs z-10">
          <span className="font-medium text-obs-fg drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {meta.name}
          </span>
          {meta.fps > 0 && (
            <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-obs-fg-dim border border-white/5">
              {meta.fps.toFixed(1)} FPS
            </span>
          )}
        </div>
      </Link>
      {footer}
    </div>
  );
}
