import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Card, EmptyState, PageHeader, Select, Segmented, Toggle } from "../components/ui";
import { MockScene } from "../components/VideoTile";
import { dateLabel, duration, timeAgo, timeHHMM } from "../lib/utils";
import { calendars, labels, type Severity } from "./reviewData";
import { I } from "../components/icons";

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
          <Badge tone={alertsCount > 0 ? "alert" : "ok"} dot>
            {alertsCount > 0 ? `${alertsCount} unresolved` : "all clear"}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-obs-fg-dim font-medium select-none">
              <span>Show reviewed</span>
              <Toggle checked={showReviewed} onChange={setShowReviewed} label="show reviewed" />
            </label>
          </div>
        }
      />

      {/* Calendar Day Horizon Strip */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-obs-fg-faint">
            Activity by day
          </span>
          <div className="flex items-center gap-4 font-mono text-[10px] text-obs-fg-dim">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-obs-warn" /> alerts
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-obs-accent" /> detections
            </span>
          </div>
        </div>

        <div className="flex min-w-max gap-2">
          {calendars.days.map((d) => {
            const isSelected = selectedDay === d.yyyymmdd;
            const max = Math.max(1, ...calendars.days.map((x) => x.alerts + x.detections));
            const bars = Math.round(((d.alerts + d.detections) / max) * 40);
            return (
              <button
                key={d.yyyymmdd}
                onClick={() => setSelectedDay(d.yyyymmdd)}
                className={`w-20 shrink-0 cursor-pointer rounded-md border p-2.5 transition-colors select-none ${
                  isSelected
                    ? "border-obs-accent/50 bg-obs-accent/10"
                    : "border-obs-line bg-obs-1 hover:border-obs-line-strong hover:bg-obs-2"
                }`}
              >
                <p
                  className={`text-center font-mono text-[10px] font-semibold uppercase tracking-wider ${
                    isSelected ? "text-obs-fg" : "text-obs-fg-dim"
                  }`}
                >
                  {dateLabel(d.yyyymmdd)}
                </p>

                {/* density bars */}
                <svg viewBox="0 0 40 26" className="mx-auto mt-2 h-[26px] w-full" aria-hidden>
                  {Array.from({ length: 40 }).map((_, i) => (
                    <rect
                      key={i}
                      x={i}
                      width={1}
                      y={0}
                      height={i < bars ? 26 : 0}
                      fill={isSelected ? "#d8c294" : "rgba(216,194,148,0.45)"}
                    />
                  ))}
                </svg>

                <div className="mt-1.5 flex items-center justify-center gap-2 font-mono text-[10px]">
                  <span className="flex items-center gap-1 font-medium text-obs-warn">
                    <svg viewBox="0 0 10 10" className="h-2 w-2 fill-current" aria-hidden>
                      <path d="M5 1 9 9H1Z" />
                    </svg>
                    {d.alerts}
                  </span>
                  <span className="flex items-center gap-1 font-medium text-obs-accent">
                    <svg viewBox="0 0 10 10" className="h-1.5 w-1.5 fill-current" aria-hidden>
                      <circle cx="5" cy="5" r="4" />
                    </svg>
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

        <span className="ml-auto font-mono text-xs text-obs-fg-faint">
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
              <Card key={s.id} className="overflow-hidden group hover:border-obs-line-strong">
                <Link to={`/review/${s.id}`} className="block relative overflow-hidden">
                  <div className="relative h-36 overflow-hidden">
                    <MockScene c1={cam?.palette[0] ?? "#1d222a"} c2={cam?.palette[1] ?? "#161a20"} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/45" />

                    {/* Object box for realism */}
                    <div
                      className="absolute rounded-sm border"
                      style={{
                        left: "38%", top: "46%", width: "34%", height: "30%",
                        borderColor: "var(--color-obs-accent)",
                      }}
                    >
                      <span
                        className="absolute -top-4.5 left-0 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
                        style={{ background: "#c2a878", color: "#0c0e11" }}
                      >
                        {s.label} · {(s.score * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Top status badges */}
                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 z-10">
                      <Badge tone={isAlert ? "alert" : s.severity === "detection" ? "warn" : "ok"} dot={isAlert}>
                        {s.severity === "significant_motion" ? "motion" : s.severity}
                      </Badge>
                      {!s.reviewed && (
                        <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[9px] font-medium text-obs-accent-strong border border-obs-accent/30">
                          NEW
                        </span>
                      )}
                    </div>

                    {/* Timecode */}
                    <div className="absolute right-2.5 top-2.5 rounded bg-black/50 px-2 py-0.5 font-mono text-[10px] text-obs-fg-dim backdrop-blur-sm z-10">
                      {timeHHMM(s.start)} &ndash; {timeHHMM(s.end)}
                    </div>

                    {/* Bottom camera info */}
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-xs z-10">
                      <span className="font-medium text-obs-fg drop-shadow">
                        {cam?.name ?? s.cameraId}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Metadata */}
                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize text-obs-fg">
                      {s.label}
                    </span>
                    <span className="font-mono text-xs text-obs-fg-dim">
                      {duration((s.end - s.start) / 1000)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.zones.map((z) => (
                      <Badge key={z} tone="slate">
                        {z}
                      </Badge>
                    ))}
                    {s.label === "loitering" && <Badge tone="warn">Dwell &gt; 600s</Badge>}
                    <span className="ml-auto text-[10px] font-mono text-obs-fg-faint">{timeAgo(s.end)}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-obs-line pt-2.5">
                    <button
                      onClick={() => toggleReview(s.id)}
                      className={`flex items-center gap-1.5 cursor-pointer font-mono text-[11px] font-medium transition-colors ${
                        s.reviewed
                          ? "text-obs-fg-faint hover:text-obs-fg-dim"
                          : "text-obs-accent hover:text-obs-accent-strong"
                      }`}
                    >
                      <I.Check className="h-3.5 w-3.5" />
                      {s.reviewed ? "Reviewed" : "Mark reviewed"}
                    </button>
                    <Link
                      to={`/review/${s.id}`}
                      className="font-mono text-[11px] text-obs-fg-dim hover:text-obs-fg"
                    >
                      Inspect
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