import { useEffect, useMemo, useState } from "react";
import { Badge, Card, PageHeader } from "../components/ui";
import { I } from "../components/icons";
import { getSystem, type SystemSummary } from "../lib/api";

type DeploymentConfig = {
  deployment_target?: string;
  config_path?: string;
};

type Row = { label: string; value: string; mono?: boolean };

export default function Settings() {
  const [sys, setSys] = useState<SystemSummary | null>(null);
  const [cfg, setCfg] = useState<DeploymentConfig | null>(null);

  useEffect(() => {
    let alive = true;
    getSystem().then((s) => alive && setSys(s));
    // /config is a lightweight echo endpoint on the API.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    fetch("/config", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => alive && setCfg(c))
      .catch(() => alive && setCfg(null));
    return () => {
      alive = false;
      clearTimeout(timer);
      ctl.abort();
    };
  }, []);

  const pipeline: Row[] = useMemo(
    () => [
      { label: "Deployment target", value: cfg?.deployment_target ?? "edge" },
      { label: "Config source", value: cfg?.config_path ?? "/etc/aina/aina.yaml", mono: true },
      { label: "Object detector", value: "YOLO26s" },
      { label: "Embeddings model", value: "OpenCLIP ViT-H/14 · 1024-dim" },
      { label: "Search index", value: "pgvector (KNN)" },
      { label: "Streaming", value: "go2rtc restream (TCP)" },
    ],
    [cfg],
  );

  const dataset: Row[] = useMemo(
    () => [
      { label: "Cameras", value: String(sys?.camera_count ?? "—") },
      { label: "Objects tracked", value: String(sys?.track_count ?? "—") },
      { label: "Detections", value: String(sys?.detection_count ?? "—") },
      { label: "Events", value: String(sys?.event_count ?? "—") },
      { label: "Recorded segments", value: String(sys?.segment_count ?? "—") },
      { label: "Embeddings indexed", value: String(sys?.embedding_count ?? "—") },
    ],
    [sys],
  );

  const perceptionOk = sys?.perception_rpc ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuration"
        subtitle="Read-only view of the deployed pipeline and live datastore"
        badge={
          <Badge tone={perceptionOk ? "ok" : "warn"} dot>
            {perceptionOk ? "pipeline online" : "perception offline"}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6 space-y-5">
          <div>
            <h3 className="font-display text-lg font-medium text-obs-fg flex items-center gap-2">
              <I.Cpu className="h-5 w-5 text-obs-accent" /> Perception & streaming
            </h3>
            <p className="text-xs text-obs-fg-dim">Detector, embeddings, and how cameras are restreamed</p>
          </div>
          <div className="divide-y divide-obs-line">
            {pipeline.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-obs-fg-dim">{r.label}</span>
                <span className={r.mono ? "font-mono text-xs text-obs-fg" : "text-obs-fg"}>{r.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 space-y-5">
          <div>
            <h3 className="font-display text-lg font-medium text-obs-fg flex items-center gap-2">
              <I.Layers className="h-5 w-5 text-obs-accent" /> Live datastore
            </h3>
            <p className="text-xs text-obs-fg-dim">Current counts from the local postgres database</p>
          </div>
          <div className="divide-y divide-obs-line">
            {dataset.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-obs-fg-dim">{r.label}</span>
                <span className="font-mono text-xs text-obs-fg">{r.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <p className="text-[11px] text-obs-fg-faint">
        Configuration is declared in <span className="font-mono text-obs-accent">config/aina.yaml</span> and
        applied at deploy time. Changes require editing that file and restarting the perception service.
      </p>
    </div>
  );
}