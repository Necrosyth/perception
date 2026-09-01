import { useEffect, useState } from "react";
import { Badge, Card, MetricCard, PageHeader } from "../components/ui";
import { getSystem, type SystemSummary, useCameras } from "../lib/api";
import { I } from "../components/icons";

export default function System() {
  const { cameras } = useCameras();
  const [sys, setSys] = useState<SystemSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await getSystem();
      if (!cancelled && s) setSys(s);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const trackCount = sys?.track_count ?? 0;
  const detectionCount = sys?.detection_count ?? 0;
  const eventCount = sys?.event_count ?? 0;
  const segmentCount = sys?.segment_count ?? 0;
  const embeddingCount = sys?.embedding_count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System"
        subtitle="Edge inference pipelines, tracked objects, camera streams, and perception modules"
        badge={
          <Badge tone={sys?.perception_rpc ? "ok" : "warn"} dot>
            {sys?.perception_rpc ? "perception online" : "perception rpc offline"}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Cameras"
          value={sys?.camera_count ?? cameras.length}
          unit="feeds"
          subtitle="Active RTSP streams"
          tone="accent"
          icon={<I.Grid className="h-4 w-4 text-obs-accent" />}
        />
        <MetricCard
          title="Tracks"
          value={trackCount}
          unit="objects"
          subtitle="Tracked object lifecycles"
          tone="ok"
          icon={<I.Crosshair className="h-4 w-4 text-obs-ok" />}
        />
        <MetricCard
          title="Detections"
          value={detectionCount}
          unit="rows"
          subtitle="Per-frame detections persisted"
          tone="warn"
          icon={<I.Eye className="h-4 w-4 text-obs-warn" />}
        />
        <MetricCard
          title="Review segments"
          value={segmentCount}
          unit="clips"
          subtitle={`${eventCount} zone events · ${embeddingCount} embeddings`}
          tone="accent"
          icon={<I.History className="h-4 w-4 text-obs-accent" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-obs-line px-5 py-3.5">
            <div>
              <p className="text-xs font-semibold text-obs-fg">Camera Streams</p>
              <p className="text-[11px] text-obs-fg-faint">RTSP / go2rtc endpoints</p>
            </div>
            <Badge tone="neutral">{cameras.filter((c) => c.enabled).length} active</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-obs-line text-left font-mono text-[10px] uppercase tracking-wider text-obs-fg-faint">
                  <th className="px-5 py-3 font-medium">Feed</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium text-right">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obs-line">
                {cameras.map((c) => (
                  <tr key={c.id} className="transition hover:bg-obs-1">
                    <td className="px-5 py-3 text-obs-fg font-medium">{c.name}</td>
                    <td className="px-3 py-3 text-obs-fg-dim font-mono truncate max-w-[220px]">{c.source || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={c.enabled ? "ok" : "slate"} dot={c.enabled}>
                        {c.enabled ? "STREAMING" : "OFF"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {cameras.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-xs text-obs-fg-faint">
                      No camera feeds configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-obs-line px-5 py-3.5">
            <div>
              <p className="text-xs font-semibold text-obs-fg">Perception Data Layer</p>
              <p className="text-[11px] text-obs-fg-faint">Live counters from Postgres + embed RPC</p>
            </div>
            <Badge tone="accent">tracks + events + embeddings</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-obs-line text-left font-mono text-[10px] uppercase tracking-wider text-obs-fg-faint">
                  <th className="px-5 py-3 font-medium">Store</th>
                  <th className="px-3 py-3 font-medium">Rows</th>
                  <th className="px-5 py-3 font-medium text-right">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obs-line">
                {[
                  { name: "tracks", rows: trackCount },
                  { name: "detections", rows: detectionCount },
                  { name: "events", rows: eventCount },
                  { name: "segments", rows: segmentCount },
                  { name: "embeddings (vector)", rows: embeddingCount },
                ].map((m) => (
                  <tr key={m.name} className="transition hover:bg-obs-1">
                    <td className="px-5 py-3 text-obs-fg font-medium">{m.name}</td>
                    <td className="px-3 py-3 text-obs-fg-dim font-mono">{m.rows}</td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={m.rows > 0 ? "ok" : "slate"} dot={m.rows > 0}>
                        {m.rows > 0 ? "POPULATED" : "IDLE"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-obs-line bg-obs-1 px-5 py-2.5 text-[11px] text-obs-fg-faint font-mono">
            {sys?.zones.length ? `Zones: ${sys.zones.join(", ")}` : "No zones configured."}
          </div>
        </Card>
      </div>
    </div>
  );
}