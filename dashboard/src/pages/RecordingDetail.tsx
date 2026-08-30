import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card } from "../components/ui";
import { I } from "../components/icons";
import { cameras, timelineHours, reviewSegments } from "../lib/mock";
import { duration, timeHHMM, timeHHMMSS } from "../lib/utils";

export default function RecordingDetail() {
  const { segmentId = reviewSegments[0].id } = useParams();
  const seg = useMemo(() => reviewSegments.find((s) => s.id === segmentId) ?? reviewSegments[0], [segmentId]);
  const cam = cameras.find((c) => c.id === seg.cameraId) ?? cameras[0];

  const [pos, setPos] = useState(0.42);
  const [playing, setPlaying] = useState(false);
  const start = seg.start;
  const end = seg.end;
  const tAt = (p: number) => start + (end - start) * p;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-aina-slate">
        <Link to="/review" className="hover:text-aina-teal">Events</Link>
        <span>/</span>
        <span className="text-aina-frost">{seg.label} · {cam.name}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="relative overflow-hidden rounded-lg border border-aina-slate/15">
            <div className="aspect-video" style={{ background: `linear-gradient(135deg, ${cam.palette[0]}, ${cam.palette[1]})` }}>
              <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 3px)" }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border border-aina-teal/50 bg-aina-navy-deep/70 text-aina-teal backdrop-blur transition hover:scale-105"
                >
                  {playing ? <I.Pause className="h-7 w-7" /> : <I.Play className="h-7 w-7 translate-x-0.5" />}
                </button>
              </div>
              <div className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px]">{seg.label}</div>
              <div className="absolute bottom-2 left-2 rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-aina-frost">
                {timeHHMMSS(tAt(pos))}
              </div>
            </div>
          </div>

          {/* scrubber */}
          <Card className="mt-3 p-3">
            <div className="mb-1 flex justify-between text-[10px] text-aina-slate">
              <span>{timeHHMM(start)}</span>
              <span className="font-mono">{(pos * 100).toFixed(0)}% · {timeHHMMSS(tAt(pos))}</span>
              <span>{timeHHMM(end)}</span>
            </div>
            <div
              className="relative h-10 cursor-pointer overflow-hidden rounded border border-aina-slate/15"
              onMouseDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setPos(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
              }}
            >
              <div className="absolute inset-x-0 top-0 bottom-[40%] flex items-end gap-px" >
                {timelineHours.map((h, i) => (
                  <div key={i} className="flex-1" title={`${h.h}h`}>
                    <div className="w-full bg-aina-teal/25" style={{ height: `${6 + h.d * 1.4}px` }} />
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 top-1/2 flex items-end gap-px">
                {timelineHours.map((h, i) => (
                  <div key={i} className="flex-1">
                    <div className="w-full bg-aina-amber/40" style={{ height: `${4 + h.a * 2.2}px` }} />
                  </div>
                ))}
              </div>
              <div className="absolute inset-y-0 flex flex-col items-center" style={{ left: `${pos * 100}%` }}>
                <div className="h-2 w-0.5 bg-aina-frost" />
                <div className="z-10 mt-auto h-3 w-3 -translate-y-0 rounded-full border-2 border-aina-frost" style={{ background: "radial-gradient(circle, #0B1F3A 30%, #2FBFA4 70%)" }} />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</Button>
                <Button size="sm" variant="outline" onClick={() => setPos(0)}>↤</Button>
                <Button size="sm" variant="outline" onClick={() => setPos(1)}>↦</Button>
              </div>
              <Badge tone={seg.severity === "alert" ? "red" : "amber"}>{seg.severity}</Badge>
            </div>
          </Card>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-aina-slate">
            <span className="rounded bg-aina-slate/10 px-2 py-1">zones: {seg.zones.length ? seg.zones.join(", ") : "—"}</span>
            <span className="rounded bg-aina-slate/10 px-2 py-1">duration: {duration((end - start) / 1000)}</span>
            <span className="rounded bg-aina-slate/10 px-2 py-1">peak score: {(seg.score * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div className="space-y-3">
          <Card className="p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-aina-slate">Timeline events</p>
            <div className="space-y-2">
              {[
                { t: start, type: "visible" },
                { t: start + 3000, type: "entered_zone" },
                { t: start + 8000, type: "stationary" },
                ...(seg.label === "loitering" ? [{ t: start + 12000, type: "loitering" }] : []),
                { t: end, type: "gone" },
              ].map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-aina-slate">{timeHHMMSS(e.t)}</span>
                  <Badge tone={e.type === "stationary" || e.type === "loitering" ? "amber" : "teal"}>{e.type}</Badge>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-aina-slate">Actions</p>
            <div className="space-y-2">
              <Button size="sm" variant="outline" className="w-full"><I.Replay className="h-3.5 w-3.5" /> Export clip</Button>
              <Button size="sm" variant="outline" className="w-full">Find similar objects</Button>
              <Link to="/explore">
                <Button size="sm" className="w-full">Search in Explore</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}