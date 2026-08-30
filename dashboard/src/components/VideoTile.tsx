import { useState } from "react";
import { Link } from "react-router-dom";
import { timeHHMMSS } from "../lib/utils";
import { Badge } from "./ui";

export type TileMeta = {
  id: string;
  name: string;
  zones: string[];
  hasMotion: boolean;
  fps: number;
  palette: [string, string];
  live?: boolean;
  objects?: { label: string; box: [number, number, number, number]; color: string }[];
  timestamp?: number;
  onNavigate?: string;
  /** go2rtc restream URL; when set the tile plays real video, else the mock scene. */
  streamUrl?: string;
};

export function VideoTile({ meta, aspect = "aspect-video", footer }: { meta: TileMeta; aspect?: string; footer?: React.ReactNode }) {
  const to = meta.onNavigate ?? `/camera/${meta.id}`;
  const live = meta.live ?? true;
  const ts = meta.timestamp ?? Date.now();
  const [c1, c2] = meta.palette;
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-lg border border-aina-slate/15">
      <Link to={to} className={`block ${aspect} relative`}>
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
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />
            {/* scanline texture */}
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: "repeating-linear-gradient(0deg, #ffffff 0 1px, transparent 1px 3px)" }}
            />
            {/* fake scene shapes */}
            <div className="absolute inset-0 opacity-25" style={{ background: "radial-gradient(circle at 72% 62%, rgba(255,255,255,0.35), transparent 28%)" }} />
            <div className="absolute bottom-0 left-0 right-0 h-6 opacity-30" style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.9))" }} />
            {meta.hasMotion && (
              <div className="absolute left-[30%] top-[38%] h-[18px] w-[26px] animate-pulse rounded-sm border border-aina-amber/70 bg-aina-amber/10" />
            )}
            {meta.objects?.map((o, i) => (
              <div
                key={i}
                className="absolute rounded-sm border"
                style={{
                  left: `${o.box[0]}%`,
                  top: `${o.box[1]}%`,
                  width: `${o.box[2]}%`,
                  height: `${o.box[3]}%`,
                  borderColor: o.color,
                }}
              >
                <span
                  className="absolute -top-4 left-0 rounded-t px-1 text-[9px] font-semibold uppercase tracking-wider"
                  style={{ background: o.color, color: "#071018" }}
                >
                  {o.label}
                </span>
              </div>
            ))}
            {videoFailed && (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-aina-slate">
                signal lost
              </span>
            )}
          </>
        )}

        {/* corner status */}
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          {live ? (
            <Badge tone={meta.hasMotion ? "amber" : "teal"} className="pl-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${meta.hasMotion ? "animate-pulse bg-aina-amber" : "bg-aina-teal"}`} />
              {meta.hasMotion ? "MOTION" : videoFailed ? "OFFLINE" : "LIVE"}
            </Badge>
          ) : (
            <Badge tone="navy">OFFLINE</Badge>
          )}
          {meta.zones[0] && <Badge tone="slate">{meta.zones[0]}</Badge>}
        </div>
        <div className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-aina-frost/90">
          {live ? timeHHMMSS(ts) : "—"}
        </div>
        <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-[11px]">
          <span className="font-medium text-aina-frost drop-shadow">{meta.name}</span>
          {meta.fps > 0 && <span className="font-mono text-[9px] text-aina-frost/70">{meta.fps.toFixed(1)} fps</span>}
        </div>
      </Link>
      {footer}
    </div>
  );
}