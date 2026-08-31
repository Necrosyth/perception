import { useState } from "react";
import { Link } from "react-router-dom";
import { timeHHMMSS } from "../lib/utils";
import { Badge } from "./ui";
import { I } from "./icons";

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
      className="group relative overflow-hidden rounded-xl border border-slate-800/90 bg-[#07111e] shadow-lg shadow-black/50 transition-all duration-300 hover:border-[#2fbfa4]/50 hover:shadow-[0_0_25px_-5px_rgba(47,191,164,0.2)]"
    >
      <Link to={to} className={`block ${aspect} relative overflow-hidden select-none`}>
        {meta.streamUrl && !videoFailed ? (
          <video
            className="absolute inset-0 h-full w-full bg-black object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            src={meta.streamUrl}
            autoPlay
            muted
            playsInline
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <>
            {/* Background synthetic feed canvas */}
            <div
              className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.03]"
              style={{
                background: `radial-gradient(ellipse at 50% 30%, ${c1}cc 0%, ${c2}ee 75%, #050b12 100%)`,
              }}
            />

            {/* Tactical Grid & Radar lines */}
            <div
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />

            {/* Fine Scanlines */}
            <div className="absolute inset-0 hud-scanlines opacity-40 pointer-events-none" />

            {/* Ambient surveillance vignette */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/60 pointer-events-none" />

            {/* Motion Detection Glow Indicator */}
            {meta.hasMotion && (
              <div className="absolute left-[32%] top-[35%] h-[26px] w-[34px] animate-pulse rounded border border-amber-400/80 bg-amber-500/15 shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                <span className="absolute -top-4 left-0 rounded bg-amber-500 px-1 py-0.2 text-[8px] font-mono font-bold uppercase text-black">
                  MOTION
                </span>
              </div>
            )}

            {/* Bounding box overlays */}
            {meta.objects?.map((o, i) => (
              <div
                key={i}
                className="absolute rounded border transition-all"
                style={{
                  left: `${o.box[0]}%`,
                  top: `${o.box[1]}%`,
                  width: `${o.box[2]}%`,
                  height: `${o.box[3]}%`,
                  borderColor: o.color,
                  boxShadow: `0 0 10px ${o.color}40`,
                  backgroundColor: `${o.color}10`,
                }}
              >
                <div
                  className="absolute -top-4.5 left-0 flex items-center gap-1 rounded-t px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider shadow-sm"
                  style={{ background: o.color, color: "#060b13" }}
                >
                  <span>{o.label}</span>
                  {o.score && <span>{(o.score * 100).toFixed(0)}%</span>}
                </div>
              </div>
            ))}

            {videoFailed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 backdrop-blur-[2px]">
                <I.VideoOff className="h-6 w-6 text-slate-500" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  SIGNAL LOST · STANDBY
                </span>
              </div>
            )}
          </>
        )}

        {/* Viewfinder Tactical Corner Brackets */}
        <div className="pointer-events-none absolute inset-2.5">
          <div className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-slate-400/30 group-hover:border-[#2fbfa4]/60 transition-colors" />
          <div className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-slate-400/30 group-hover:border-[#2fbfa4]/60 transition-colors" />
          <div className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-slate-400/30 group-hover:border-[#2fbfa4]/60 transition-colors" />
          <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-slate-400/30 group-hover:border-[#2fbfa4]/60 transition-colors" />
        </div>

        {/* Header telemetry & status */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 z-10">
          {live ? (
            <Badge
              tone={meta.hasMotion ? "amber" : videoFailed ? "slate" : "teal"}
              dot={true}
              className="backdrop-blur-md bg-black/40"
            >
              {meta.hasMotion ? "MOTION" : videoFailed ? "OFFLINE" : "LIVE"}
            </Badge>
          ) : (
            <Badge tone="navy" className="backdrop-blur-md bg-black/50">OFFLINE</Badge>
          )}
          {meta.zones[0] && (
            <Badge tone="slate" className="backdrop-blur-md bg-black/40 text-slate-300">
              {meta.zones[0]}
            </Badge>
          )}
        </div>

        {/* Timestamp OSD */}
        <div className="absolute right-2.5 top-2.5 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-200 backdrop-blur-md border border-white/5 z-10">
          {live ? timeHHMMSS(ts) : "—"}
        </div>

        {/* Hover Quick Action Toolbar */}
        {showControls && isHovered && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/25 backdrop-blur-[2px] transition-all z-20">
            <span className="flex items-center gap-1.5 rounded-lg border border-[#2fbfa4]/50 bg-[#091524]/90 px-3 py-1.5 text-xs font-semibold text-[#38efcb] shadow-lg shadow-black/60 transition hover:bg-[#2fbfa4] hover:text-[#060b13]">
              <I.Maximize className="h-3.5 w-3.5" /> Inspect Camera
            </span>
          </div>
        )}

        {/* Bottom Bar: Camera Name, FPS, Codec */}
        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-xs z-10">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {meta.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-300 drop-shadow">
            {meta.fps > 0 && (
              <span className="rounded bg-black/50 px-1.5 py-0.5 border border-white/5">
                {meta.fps.toFixed(1)} FPS
              </span>
            )}
          </div>
        </div>
      </Link>
      {footer}
    </div>
  );
}