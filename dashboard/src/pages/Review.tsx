import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Card, EmptyState, PageHeader, Select, Segmented, Toggle } from "../components/ui";
import { MockScene } from "../components/VideoTile";
import { dateLabel, duration, timeAgo, timeHHMM } from "../lib/utils";
import { type Severity } from "./reviewData";
import { getSegments, markSegmentReviewed, type Segment, useCameras } from "../lib/api";
import { I } from "../components/icons";

function segStart(s: Segment) {
  return new Date(s.started_at).getTime();
}
function segEnd(s: Segment) {
  return new Date(s.ended_at).getTime();
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Day = { yyyymmdd: string; alerts: number; detections: number };

function groupByDay(segs: Segment[]): Day[] {
  const map = new Map<string, { alerts: number; detections: number }>();
  for (const s of segs) {
    const d = new Date(s.started_at);
    const key = dayKey(d);
    const cur = map.get(key) ?? { alerts: 0, detections: 0 };
    if (s.severity === "alert") cur.alerts += 1;
    else cur.detections += 1;
    map.set(key, cur);
  }
  return [...map.entries()].map(([yyyymmdd, v]) => ({ yyyymmdd, ...v }));
}

export default function Review() {
  const [params] = useSearchParams();
  const initialCamera = params.get("camera") ?? "all";
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [camera, setCamera] = useState(initialCamera);
  const [label, setLabel] = useState("all");
  const [showReviewed, setShowReviewed] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [fromApi, setFromApi] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const { cameras } = useCameras();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const segs = await getSegments({ camera: camera === "all" ? undefined : camera, limit: 500 });
      if (cancelled) return;
      if (segs) {
        setSegments(segs);
        setFromApi(true);
        setLabels((prev) =>
          Array.from(new Set([...prev, ...segs.map((s) => s.label)])).sort(),
        );
        setReviewed(new Set(segs.filter((s) => s.reviewed).map((s) => s.id)));
      }
    };
    load();
    const poll = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [camera]);

  const days = useMemo(() => groupByDay(segments), [segments]);

  useEffect(() => {
    if (!selectedDay && days.length) setSelectedDay(days[0].yyyymmdd);
  }, [days, selectedDay]);

  const visible = useMemo(
    () =>
      segments
        .filter(
          (s) =>
            (severity === "all" || s.severity === severity) &&
            (camera === "all" || s.camera === camera) &&
            (label === "all" || s.label === label) &&
            (showReviewed || !reviewed.has(s.id)) &&
            (!selectedDay || dayKey(new Date(s.started_at)) === selectedDay),
        )
        .sort((a, b) => segEnd(b) - segEnd(a)),
    [segments, severity, camera, label, showReviewed, reviewed, selectedDay],
  );

  const toggleReviewed = async (s: Segment) => {
    const target = !s.reviewed;
    const ok = await markSegmentReviewed(s.id, target);
    if (ok) {
      setSegments((prev) => prev.map((x) => (x.id === s.id ? { ...x, reviewed: target } : x)));
      setReviewed((prev) => {
        const next = new Set(prev);
        if (target) next.add(s.id);
        else next.delete(s.id);
        return next;
      });
    }
  };

  const alertsCount = visible.filter((s) => s.severity === "alert").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Events & Review Journal"
        subtitle="Timeline journal of real perception segments — one per finalized track"
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

        {days.length === 0 ? (
          <p className="text-xs text-obs-fg-faint">No recorded segments yet — perception is building the index.</p>
        ) : (
          <div className="flex min-w-max gap-2">
            {days.map((d) => {
              const isSelected = selectedDay === d.yyyymmdd;
              const max = Math.max(1, ...days.map((x) => x.alerts + x.detections));
              const bars = Math.round(((d.alerts + d.detections) / max) * 40);
              return (
                <button
                  key={d.yyyymmdd}
                  onClick={() => setSelectedDay(d.yyyymmdd === selectedDay ? "" : d.yyyymmdd)}
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
        )}
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
          <option value="all">All Cameras ({cameras.length})</option>
          {cameras.map((c) => (
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
          title={
            fromApi
              ? "No event segments match current filters"
              : "No review segments available"
          }
          hint={
            fromApi
              ? "Try adjusting the severity selector, clearing camera filters, or toggling 'Show reviewed'."
              : "Perception is recording tracks — segments will appear here shortly."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((s) => {
            const cam = cameras.find((c) => c.id === s.camera);
            const isAlert = s.severity === "alert";
            const start = segStart(s);
            const end = segEnd(s);
            return (
              <Card key={s.id} className="overflow-hidden group hover:border-obs-line-strong">
                <Link to={`/review/${s.id}`} className="block relative overflow-hidden">
                  <div className="relative h-36 overflow-hidden">
                    <MockScene c1={cam?.palette[0] ?? "#1d222a"} c2={cam?.palette[1] ?? "#161a20"} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/45" />

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
                        {s.label}
                      </span>
                    </div>

                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 z-10">
                      <Badge tone={isAlert ? "alert" : s.severity === "detection" ? "warn" : "ok"} dot={isAlert}>
                        {s.severity}
                      </Badge>
                      {!s.reviewed && (
                        <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[9px] font-medium text-obs-accent-strong border border-obs-accent/30">
                          NEW
                        </span>
                      )}
                    </div>

                    <div className="absolute right-2.5 top-2.5 rounded bg-black/50 px-2 py-0.5 font-mono text-[10px] text-obs-fg-dim backdrop-blur-sm z-10">
                      {timeHHMM(start)} &ndash; {timeHHMM(end)}
                    </div>

                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-xs z-10">
                      <span className="font-medium text-obs-fg drop-shadow">
                        {cam?.name ?? s.camera}
                      </span>
                    </div>
                  </div>
                </Link>

                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize text-obs-fg">{s.label}</span>
                    <span className="font-mono text-xs text-obs-fg-dim">
                      {duration((end - start) / 1000)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="ml-auto text-[10px] font-mono text-obs-fg-faint">{timeAgo(end)}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-obs-line pt-2.5">
                    <button
                      onClick={() => toggleReviewed(s)}
                      className={`flex items-center gap-1.5 rounded font-mono text-[11px] font-medium transition-colors select-none ${
                        s.reviewed ? "text-obs-accent hover:text-obs-fg" : "text-obs-fg-dim hover:text-obs-fg"
                      }`}
                      title={s.reviewed ? "Mark as unreviewed" : "Mark as reviewed"}
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