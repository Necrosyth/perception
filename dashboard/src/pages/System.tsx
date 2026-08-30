import { Badge, Card, PageHeader, Toggle } from "../components/ui";
import { cameras, modules, systemStats } from "../lib/mock";

function Gauge({ pct }: { pct: number }) {
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle cx="20" cy="20" r="15.5" fill="none" stroke="#1a2c49" strokeWidth="4" />
        <circle
          cx="20" cy="20" r="15.5" fill="none" stroke="#2FBFA4" strokeWidth="4"
          strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm text-aina-frost">{pct}%</span>
    </div>
  );
}

export default function System() {
  const gpu = systemStats.gpu;
  return (
    <div>
      <PageHeader title="System" subtitle="Per-camera FPS, per-module state (straight from config/aina.yaml), GPU utilization" />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-4 p-4">
          <Gauge pct={Math.round((gpu.util / 100) * 100)} />
          <div>
            <p className="text-xs uppercase tracking-wider text-aina-slate">GPU util</p>
            <p className="mt-0.5 text-sm font-medium text-aina-frost">{gpu.name}</p>
            <p className="mt-1 font-mono text-[11px] text-aina-slate">{gpu.memUsed} / {gpu.memTotal} MiB · {gpu.temperature}°C</p>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-aina-slate">Detector</p>
          <p className="mt-1 font-mono text-2xl text-aina-teal">{systemStats.detector.fps.toFixed(1)} <span className="text-xs text-aina-slate">fps</span></p>
          <p className="mt-1 font-mono text-[11px] text-aina-slate">inference {systemStats.detector.inferenceMs} ms · load {systemStats.detector.load}% · {systemStats.detector.pending} pending</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-aina-slate">Runtime</p>
          <p className="mt-1 text-sm font-medium text-aina-frost">upy {systemStats.uptime}</p>
          <p className="mt-1 font-mono text-[11px] text-aina-slate">v{systemStats.version} · deployment target: <Badge tone="teal">edge</Badge></p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-aina-slate/10 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-aina-slate">Cameras</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-aina-slate/70">
                <th className="px-4 py-2 font-medium">Camera</th>
                <th className="px-2 py-2 font-medium">FPS</th>
                <th className="px-2 py-2 font-medium">Motion</th>
                <th className="px-4 py-2 font-medium">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {cameras.map((c) => (
                <tr key={c.id} className="border-t border-aina-slate/8">
                  <td className="px-4 py-2 text-aina-frost">{c.name}</td>
                  <td className="px-2 py-2 font-mono text-xs text-aina-slate">{c.enabled ? c.fps.toFixed(1) : "—"}</td>
                  <td className="px-2 py-2"><Badge tone={c.hasMotion ? "amber" : "slate"}>{c.hasMotion ? "motion" : "idle"}</Badge></td>
                  <td className="px-4 py-2"><Toggle checked={c.enabled} onChange={() => {}} label={`toggle ${c.name}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-aina-slate/10 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-aina-slate">Perception modules</p>
            <p className="text-[10px] text-aina-slate/60">pulled from config/aina.yaml — toggle behaviors here, never by code</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-aina-slate/70">
                <th className="px-4 py-2 font-medium">Module</th>
                <th className="px-2 py-2 font-medium">Key</th>
                <th className="px-2 py-2 font-medium">FPS</th>
                <th className="px-4 py-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.name} className="border-t border-aina-slate/8">
                  <td className="px-4 py-2 font-mono text-xs text-aina-frost">{m.name}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-aina-slate">{m.key}</td>
                  <td className="px-2 py-2 font-mono text-xs text-aina-slate">{m.fps || "—"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={m.enabled ? "teal" : "slate"}>{m.enabled ? "enabled" : "disabled"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-aina-slate/10 px-4 py-2 text-[10px] text-aina-slate/50">{modules[1].notes} (time-based tracker params)</p>
        </Card>
      </div>
    </div>
  );
}