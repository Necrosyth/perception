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
          <circle cx="40" cy="40" r="35" fill="none" stroke="#0e1d30" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            stroke="url(#gauge-grad)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} 220`}
          />
          <defs>
            <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2FBFA4" />
              <stop offset="100%" stopColor="#00E5FF" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold text-white">
          {pct}%
        </span>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">{label}</p>
        {sub && <p className="mt-0.5 text-xs font-semibold text-white">{sub}</p>}
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
        title="System Health & Hardware Telemetry"
        subtitle="Edge inference pipelines, CUDA GPU utilization, active cameras, and perception module states"
        badge={
          <Badge tone="teal" dot={true}>
            EDGE ACCELERATION ACTIVE
          </Badge>
        }
      />

      {/* Hardware Telemetry KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 flex items-center">
          <CircularGauge
            pct={gpu.util}
            label="GPU Compute Load"
            sub={`${gpu.temperature}°C · ${gpu.name.split("(")[0]}`}
          />
        </Card>

        <MetricCard
          title="TensorRT Detector"
          value={systemStats.detector.fps.toFixed(1)}
          unit="FPS"
          subtitle={`Latency ${systemStats.detector.inferenceMs}ms · Load ${systemStats.detector.load}%`}
          tone="teal"
          icon={<I.Cpu className="h-4 w-4 text-[#2fbfa4]" />}
        />

        <MetricCard
          title="VRAM Allocation"
          value={gpu.memUsed}
          unit={`/ ${gpu.memTotal} MiB`}
          subtitle="CUDA Memory Pool · sm_89 cache"
          tone="cyan"
          icon={<I.Layers className="h-4 w-4 text-[#00e5ff]" />}
        />

        <MetricCard
          title="Edge Runtime Engine"
          value={systemStats.uptime}
          unit="Uptime"
          subtitle={`v${systemStats.version} · Containerized Microservices`}
          tone="amber"
          icon={<I.Gauge className="h-4 w-4 text-amber-400" />}
        />
      </div>

      {/* Detailed Tables Grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Cameras Hardware Table */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5 bg-[#081220]/90">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                Camera Stream Ingest
              </p>
              <p className="text-[10px] text-slate-500 font-mono">RTSP / WebRTC endpoints status</p>
            </div>
            <Badge tone="slate">{cams.filter((c) => c.enabled).length} Active Feeds</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">Camera Feeds</th>
                  <th className="px-3 py-3 font-semibold">FPS</th>
                  <th className="px-3 py-3 font-semibold">Motion</th>
                  <th className="px-5 py-3 font-semibold text-right">Stream State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {cams.map((c) => (
                  <tr key={c.id} className="transition hover:bg-[#0c1829]/50">
                    <td className="px-5 py-3 text-[#f0f6fc] font-sans font-medium">{c.name}</td>
                    <td className="px-3 py-3 text-slate-300">
                      {c.enabled ? (
                        <span className="text-[#2fbfa4] font-bold">{c.fps.toFixed(1)} FPS</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={c.hasMotion ? "amber" : "slate"} dot={c.hasMotion}>
                        {c.hasMotion ? "Active" : "Idle"}
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

        {/* Perception Modules Table */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5 bg-[#081220]/90">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                Perception AI Modules
              </p>
              <p className="text-[10px] text-slate-500 font-mono">Bound from config/aina.yaml</p>
            </div>
            <Badge tone="cyan">YOLO + CLIP</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">Module</th>
                  <th className="px-3 py-3 font-semibold">Config Key</th>
                  <th className="px-3 py-3 font-semibold">Rate</th>
                  <th className="px-5 py-3 font-semibold text-right">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {mods.map((m) => (
                  <tr key={m.name} className="transition hover:bg-[#0c1829]/50">
                    <td className="px-5 py-3 text-[#f0f6fc] font-bold">{m.name}</td>
                    <td className="px-3 py-3 text-slate-400 truncate max-w-[140px]">{m.key}</td>
                    <td className="px-3 py-3 text-slate-300">{m.fps ? `${m.fps} FPS` : "Async"}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => toggleMod(m.name)}
                        className="cursor-pointer select-none"
                      >
                        <Badge tone={m.enabled ? "teal" : "slate"} dot={m.enabled}>
                          {m.enabled ? "ACTIVE" : "DISABLED"}
                        </Badge>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-800/80 bg-[#060b13]/60 px-5 py-2.5 text-[10px] font-mono text-slate-500">
            Runtime engines reload dynamically on parameter adjustment without restarting RTSP streams.
          </div>
        </Card>
      </div>
    </div>
  );
}