import { useState } from "react";
import { Badge, Card, MetricCard, PageHeader, Toggle } from "../components/ui";
import { cameras as initialCameras, modules as initialModules, systemStats } from "../lib/mock";
import { I } from "../components/icons";

function CircularGauge({ pct, label, sub }: { pct: number; label: string; sub?: string }) {
  const strokeDash = (pct / 100) * 220;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r="35" fill="none" stroke="#242a34" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            stroke="#c2a878"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} 220`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-medium text-obs-fg">
          {pct}%
        </span>
      </div>
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-obs-fg-dim">{label}</p>
        {sub && <p className="mt-0.5 text-xs font-medium text-obs-fg">{sub}</p>}
      </div>
    </div>
  );
}

export default function System() {
  const [cams, setCams] = useState(initialCameras);
  const [mods, setMods] = useState(initialModules);
  const gpu = systemStats.gpu;

  const toggleCam = (id: string) => {
    setCams((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled, fps: !c.enabled ? 11.9 : 0 } : c)),
    );
  };

  const toggleMod = (name: string) => {
    setMods((prev) =>
      prev.map((m) => (m.name === name ? { ...m, enabled: !m.enabled } : m)),
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="System"
        subtitle="Edge inference pipelines, GPU utilization, camera streams, and perception modules"
        badge={
          <Badge tone="ok" dot>
            on-device inference
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 flex items-center">
          <CircularGauge
            pct={gpu.util}
            label="GPU load"
            sub={`${gpu.temperature}°C · ${gpu.name.split("(")[0]}`}
          />
        </Card>

        <MetricCard
          title="Detector"
          value={systemStats.detector.fps.toFixed(1)}
          unit="FPS"
          subtitle={`Latency ${systemStats.detector.inferenceMs}ms · Load ${systemStats.detector.load}%`}
          tone="accent"
          icon={<I.Cpu className="h-4 w-4 text-obs-accent" />}
        />

        <MetricCard
          title="VRAM"
          value={gpu.memUsed}
          unit={`/ ${gpu.memTotal} MiB`}
          subtitle="CUDA memory pool"
          tone="ok"
          icon={<I.Layers className="h-4 w-4 text-obs-ok" />}
        />

        <MetricCard
          title="Runtime"
          value={systemStats.uptime}
          unit="uptime"
          subtitle={`v${systemStats.version}`}
          tone="warn"
          icon={<I.Gauge className="h-4 w-4 text-obs-warn" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-obs-line px-5 py-3.5">
            <div>
              <p className="text-xs font-semibold text-obs-fg">Camera Streams</p>
              <p className="text-[11px] text-obs-fg-faint">RTSP / WebRTC endpoints</p>
            </div>
            <Badge tone="neutral">{cams.filter((c) => c.enabled).length} active</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-obs-line text-left font-mono text-[10px] uppercase tracking-wider text-obs-fg-faint">
                  <th className="px-5 py-3 font-medium">Feed</th>
                  <th className="px-3 py-3 font-medium">FPS</th>
                  <th className="px-3 py-3 font-medium">Motion</th>
                  <th className="px-5 py-3 font-medium text-right">Stream</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obs-line">
                {cams.map((c) => (
                  <tr key={c.id} className="transition hover:bg-obs-1">
                    <td className="px-5 py-3 text-obs-fg font-medium">{c.name}</td>
                    <td className="px-3 py-3 text-obs-fg-dim">
                      {c.enabled ? (
                        <span className="text-obs-ok font-medium">{c.fps.toFixed(1)} FPS</span>
                      ) : (
                        <span className="text-obs-fg-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={c.hasMotion ? "warn" : "slate"} dot={c.hasMotion}>
                        {c.hasMotion ? "active" : "idle"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Toggle checked={c.enabled} onChange={() => toggleCam(c.id)} label={`Toggle ${c.name}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-obs-line px-5 py-3.5">
            <div>
              <p className="text-xs font-semibold text-obs-fg">Perception Modules</p>
              <p className="text-[11px] text-obs-fg-faint">Detection, tracking, and search pipelines</p>
            </div>
            <Badge tone="accent">YOLO + CLIP</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-obs-line text-left font-mono text-[10px] uppercase tracking-wider text-obs-fg-faint">
                  <th className="px-5 py-3 font-medium">Module</th>
                  <th className="px-3 py-3 font-medium">Config</th>
                  <th className="px-3 py-3 font-medium">Rate</th>
                  <th className="px-5 py-3 font-medium text-right">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obs-line">
                {mods.map((m) => (
                  <tr key={m.name} className="transition hover:bg-obs-1">
                    <td className="px-5 py-3 text-obs-fg font-medium">{m.name}</td>
                    <td className="px-3 py-3 text-obs-fg-dim truncate max-w-[150px]">{m.key}</td>
                    <td className="px-3 py-3 text-obs-fg-dim">{m.fps ? `${m.fps} FPS` : "async"}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => toggleMod(m.name)} className="cursor-pointer select-none">
                        <Badge tone={m.enabled ? "ok" : "slate"} dot={m.enabled}>
                          {m.enabled ? "ACTIVE" : "DISABLED"}
                        </Badge>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-obs-line bg-obs-1 px-5 py-2.5 text-[11px] text-obs-fg-faint font-mono">
            Modules reload dynamically without restarting RTSP streams.
          </div>
        </Card>
      </div>
    </div>
  );
}
