import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Card, EmptyState, PageHeader, Select, Segmented, Toggle } from "../components/ui";
import { dateLabel, duration, timeAgo, timeHHMM } from "../lib/utils";
import { calendars, labels, type Severity } from "./reviewData";

function cx(c1: [string, string]) {
  return `linear-gradient(135deg, ${c1[0]}, ${c1[1]})`;
}

export default function Review() {
  const [params] = useSearchParams();
  const initialCamera = params.get("camera") ?? "all";
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [camera, setCamera] = useState(initialCamera);
  const [label, setLabel] = useState("all");
  const [showReviewed, setShowReviewed] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set(calendars.segments.filter((s) => s.reviewed).map((s) => s.id)));

  const segs = calendars.segments.map((s) => ({ ...s, reviewed: reviewed.has(s.id) }));

  const visible = useMemo(
    () =>
      segs.filter(
        (s) =>
          (severity === "all" || s.severity === severity) &&
          (camera === "all" || s.cameraId === camera) &&
          (label === "all" || s.label === label) &&
          (showReviewed || !s.reviewed),
      ),
    [segs, severity, camera, label, showReviewed],
  );

  const toggleReview = (id: string) =>
    setReviewed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle={`${visible.length} segment${visible.length === 1 ? "" : "s"} · alerts and detections from all enabled cameras`}
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-aina-slate">
            Show reviewed
            <Toggle checked={showReviewed} onChange={setShowReviewed} label="show reviewed" />
          </label>
        }
      />

      {/* calendar strip */}
      <Card className="mb-4 overflow-x-auto p-3">
        <div className="flex min-w-max gap-1.5">
          {calendars.days.map((d) => (
            <button
              key={d.yyyymmdd}
              className="w-14 shrink-0 cursor-pointer rounded-md border border-aina-slate/10 p-1.5 text-center hover:border-aina-teal/50"
            >
              <p className="text-[9px] uppercase text-aina-slate">{dateLabel(d.yyyymmdd)}</p>
              <div className="mt-1.5 flex flex-col gap-0.5">
                <span className="flex items-center justify-between text-[9px]"><span className="text-aina-amber">▲</span>{d.alerts}</span>
                <span className="flex items-center justify-between text-[9px]"><span className="text-aina-teal">●</span>{d.detections}</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<Severity | "all">
          value={severity}
          onChange={setSeverity}
          options={[
            { value: "all", label: "All" },
            { value: "alert", label: "Alerts" },
            { value: "detection", label: "Detections" },
            { value: "significant_motion", label: "Motion" },
          ]}
        />
        <Select value={camera} onChange={(e) => setCamera(e.target.value)}>
          <option value="all">All cameras</option>
          {calendars.cameras.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="all">All labels</option>
          {labels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No segments match" hint="Loosen a severity, camera, or label filter — or check a camera is enabled." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => {
            const cam = calendars.cameras.find((c) => c.id === s.cameraId)!;
            return (
              <Card key={s.id} className="overflow-hidden">
                <Link to={`/review/${s.id}`} className="group block">
                  <div className="relative h-32" style={{ background: cx(cam.palette) }}>
                    <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 3px)" }} />
                    <div className="absolute left-2 top-2 flex gap-1.5">
                      <Badge tone={s.severity === "alert" ? "red" : s.severity === "detection" ? "amber" : "teal"}>
                        {s.severity === "significant_motion" ? "MOTION" : s.severity}
                      </Badge>
                      {!s.reviewed && <Badge tone="navy">new</Badge>}
                    </div>
                    <div className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px]">
                      {timeHHMM(s.start)} - {timeHHMM(s.end)}
                    </div>
                    <div className="absolute bottom-2 left-2 text-xs font-semibold text-aina-frost">
                      {typeof cam !== "undefined" ? cam.name : s.cameraId}
                    </div>
                    <div className="absolute bottom-2 right-2 text-[10px] text-aina-frost/70">{duration((s.end - s.start) / 1000)}</div>
                  </div>
                </Link>
                <div className="p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize text-aina-frost">{s.label}</span>
                    <span className="font-mono text-[10px] text-aina-slate">{(s.score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {s.zones.map((z) => (
                      <Badge key={z} tone="teal">{z}</Badge>
                    ))}
                    {s.label === "loitering" && <Badge tone="amber">loitering</Badge>}
                    <span className="ml-auto text-[10px] text-aina-slate">{timeAgo(s.end)}</span>
                  </div>
                  <div className="mt-2 border-t border-aina-slate/10 pt-2">
                    <button
                      onClick={() => toggleReview(s.id)}
                      className={`cursor-pointer text-[11px] font-semibold uppercase tracking-wider ${s.reviewed ? "text-aina-slate" : "text-aina-teal hover:text-aina-frost"}`}
                    >
                      {s.reviewed ? "✓ reviewed" : "mark reviewed"}
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}