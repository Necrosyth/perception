import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Card, EmptyState, PageHeader, Select, Segmented, Toggle } from "../components/ui";
import { dateLabel, duration, timeAgo, timeHHMM } from "../lib/utils";
import { calendars, labels, type Severity } from "./reviewData";
import { I } from "../components/icons";

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
  const [selectedDay, setSelectedDay] = useState<string>(calendars.days[0]?.yyyymmdd ?? "");
  const [reviewed, setReviewed] = useState<Set<string>>(
    () => new Set(calendars.segments.filter((s) => s.reviewed).map((s) => s.id)),
  );

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

  const alertsCount = visible.filter((s) => s.severity === "alert").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Events & Review Journal"
        subtitle="Timeline journal of high-confidence perception events, zone triggers, and anomaly alerts"
        badge={
          <Badge tone={alertsCount > 0 ? "red" : "teal"} dot={true}>
            {alertsCount > 0 ? `${alertsCount} Unresolved Alerts` : "All Clear"}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300 font-medium select-none">
              <span>Show reviewed</span>
              <Toggle checked={showReviewed} onChange={setShowReviewed} label="show reviewed" />
            </label>
          </div>
        }
      />

      {/* Calendar Day Horizon Strip */}
      <Card className="p-3 overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {calendars.days.map((d) => {
            const isSelected = selectedDay === d.yyyymmdd;
            return (
              <button
                key={d.yyyymmdd}
                onClick={() => setSelectedDay(d.yyyymmdd)}
                className={`w-20 shrink-0 cursor-pointer rounded-xl border p-2.5 text-center transition-all select-none ${
                  isSelected
                    ? "border-[#2fbfa4]/60 bg-[#2fbfa4]/15 shadow-md shadow-[#2fbfa4]/20"
                    : "border-slate-800 bg-[#07111e]/80 hover:border-slate-700 hover:bg-[#0c192c]"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  {dateLabel(d.yyyymmdd)}
                </p>
                <div className="mt-2 flex items-center justify-center gap-2 font-mono text-[10px]">
                  <span className="flex items-center gap-0.5 text-amber-400 font-semibold" title="Alerts">
                    <span className="text-[8px]">▲</span>
                    {d.alerts}
                  </span>
                  <span className="flex items-center gap-0.5 text-[#2fbfa4] font-semibold" title="Detections">
                    <span className="text-[8px]">●</span>
                    {d.detections}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Severity | "all">
          value={severity}
          onChange={setSeverity}
          options={[
            { value: "all", label: "All Events" },
            { value: "alert", label: "Alerts Only" },
            { value: "detection", label: "Detections" },
            { value: "significant_motion", label: "Motion" },
          ]}
        />

        <Select value={camera} onChange={(e) => setCamera(e.target.value)} className="w-44">
          <option value="all">All Cameras (6)</option>
          {calendars.cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Select value={label} onChange={(e) => setLabel(e.target.value)} className="w-36">
          <option value="all">All Object Classes</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>

        <span className="ml-auto font-mono text-xs text-slate-500">
          Showing {visible.length} recorded segments
        </span>
      </div>

      {/* Event Cards Grid */}
      {visible.length === 0 ? (
        <EmptyState
          title="No event segments match current filters"
          hint="Try adjusting the severity selector, clearing camera filters, or toggling 'Show reviewed'."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((s) => {
            const cam = calendars.cameras.find((c) => c.id === s.cameraId)!;
            const isAlert = s.severity === "alert";
            return (
              <Card key={s.id} className="overflow-hidden group hover:border-[#2fbfa4]/50">
                <Link to={`/review/${s.id}`} className="block relative overflow-hidden">
                  <div className="relative h-36" style={{ background: cx(cam ? cam.palette : ["#0d2c46", "#0b1f3a"]) }}>
                    {/* HUD scanline and vignette overlay */}
                    <div className="absolute inset-0 hud-scanlines opacity-30" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/60" />

                    {/* Viewfinder corner brackets */}
                    <div className="pointer-events-none absolute inset-2">
                      <div className="absolute left-0 top-0 h-2.5 w-2.5 border-l border-t border-white/40" />
                      <div className="absolute right-0 top-0 h-2.5 w-2.5 border-r border-t border-white/40" />
                      <div className="absolute bottom-0 left-0 h-2.5 w-2.5 border-b border-l border-white/40" />
                      <div className="absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r border-white/40" />
                    </div>

                    {/* Top status badges */}
                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 z-10">
                      <Badge tone={isAlert ? "red" : s.severity === "detection" ? "amber" : "teal"} dot={isAlert}>
                        {s.severity === "significant_motion" ? "MOTION" : s.severity}
                      </Badge>
                      {!s.reviewed && (
                        <span className="rounded bg-[#00e5ff]/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-[#38efff] border border-[#00e5ff]/30">
                          NEW
                        </span>
                      )}
                    </div>

                    {/* Timecode badge */}
                    <div className="absolute right-2.5 top-2.5 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-slate-300 backdrop-blur-sm border border-white/5 z-10">
                      {timeHHMM(s.start)} - {timeHHMM(s.end)}
                    </div>

                    {/* Bottom camera info */}
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-xs z-10">
                      <span className="font-semibold text-white drop-shadow">
                        {cam?.name ?? s.cameraId}
                      </span>
                      <span className="font-mono text-[10px] text-slate-300 bg-black/50 px-1.5 py-0.5 rounded">
                        {duration((s.end - s.start) / 1000)}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Event Metadata Footer */}
                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold capitalize text-[#f0f6fc] tracking-wide">
                      {s.label}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#2fbfa4] bg-[#2fbfa4]/10 px-2 py-0.5 rounded border border-[#2fbfa4]/20">
                      {(s.score * 100).toFixed(0)}% Conf
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.zones.map((z) => (
                      <Badge key={z} tone="slate">
                        {z}
                      </Badge>
                    ))}
                    {s.label === "loitering" && <Badge tone="amber">Dwell &gt; 600s</Badge>}
                    <span className="ml-auto text-[10px] font-mono text-slate-500">{timeAgo(s.end)}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5">
                    <button
                      onClick={() => toggleReview(s.id)}
                      className={`flex items-center gap-1.5 cursor-pointer font-mono text-[11px] font-semibold transition-colors ${
                        s.reviewed
                          ? "text-slate-500 hover:text-slate-300"
                          : "text-[#2fbfa4] hover:text-[#38efcb]"
                      }`}
                    >
                      <I.Check className="h-3.5 w-3.5" />
                      {s.reviewed ? "Reviewed" : "Mark as Reviewed"}
                    </button>
                    <Link
                      to={`/review/${s.id}`}
                      className="font-mono text-[11px] text-slate-400 hover:text-white"
                    >
                      Inspect →
                    </Link>
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