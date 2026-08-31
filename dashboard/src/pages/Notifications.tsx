import { useState } from "react";
import { Badge, Button, Card, PageHeader, Toggle } from "../components/ui";
import { I } from "../components/icons";
import { cameras } from "../lib/mock";

type Scope = { id: string; label: string; kind: "alert" | "detection"; camera: string; enabled: boolean };

const INITIAL: Scope[] = [
  { id: "s1", label: "Person in dock_entry", kind: "alert", camera: "loading_dock", enabled: true },
  { id: "s2", label: "Loitering past dwell time (600s)", kind: "alert", camera: "loading_dock", enabled: true },
  { id: "s3", label: "Perimeter breach", kind: "alert", camera: "parking_north", enabled: true },
  { id: "s4", label: "Vehicle at gate", kind: "detection", camera: "parking_south", enabled: false },
  { id: "s5", label: "Unrecognized face at doorway", kind: "detection", camera: "lobby", enabled: true },
];

export default function Notifications() {
  const [scopes, setScopes] = useState(INITIAL);
  const [push, setPush] = useState(true);
  const [testSent, setTestSent] = useState(false);

  const toggle = (id: string) => setScopes((s) => s.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));

  const handleTestDispatch = () => {
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alert Dispatch & Web-Push Triggers"
        subtitle="Edge orchestrator dispatches web-push & webhook notifications whenever an incoming review segment matches active scope rules"
        badge={
          <Badge tone="teal" dot={true}>
            VAPID WEB-PUSH READY
          </Badge>
        }
        actions={
          <Button variant="solid" size="sm" onClick={handleTestDispatch}>
            <I.BellOn className="h-4 w-4" />
            {testSent ? "Test Alert Fired ✓" : "Test Push Dispatch"}
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Scopes Table */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5 bg-[#081220]/90">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                Active Notification Scopes
              </p>
              <p className="text-[10px] text-slate-500 font-mono">Camera-level trigger bindings</p>
            </div>
            <Badge tone="cyan">{scopes.filter((s) => s.enabled).length} Enabled</Badge>
          </div>

          <div className="divide-y divide-slate-800/60">
            {scopes.map((s) => {
              const cam = cameras.find((c) => c.id === s.camera);
              return (
                <div key={s.id} className="flex items-center justify-between px-5 py-3.5 transition hover:bg-[#0c1829]/50">
                  <div className="flex items-center gap-3">
                    <Badge tone={s.kind === "alert" ? "red" : "teal"} dot={s.kind === "alert"}>
                      {s.kind}
                    </Badge>
                    <div>
                      <p className="text-xs font-bold text-[#f0f6fc]">{s.label}</p>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">Assigned to: {cam?.name}</p>
                    </div>
                  </div>
                  <Toggle checked={s.enabled} onChange={() => toggle(s.id)} label={`toggle ${s.label}`} />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Sidebar: Delivery Channels & Recent Log */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Push Delivery Channel
            </p>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-xs font-semibold text-slate-200">Browser Web-Push (VAPID)</span>
                <p className="text-[10px] text-slate-400">Desktop and mobile notification alerts</p>
              </div>
              <Toggle checked={push} onChange={setPush} label="browser push" />
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500 font-mono">
              Subscriptions registered per client browser; dispatches only for segments matching an enabled scope.
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Recent Dispatched Alerts
            </p>
            <div className="space-y-2">
              {[
                { t: "2m ago", m: "Loitering alert in dock_entry", cam: "Loading Dock", tone: "red" as const },
                { t: "41m ago", m: "Face detected at doorway", cam: "Lobby Entrance", tone: "teal" as const },
                { t: "3h ago", m: "Vehicle arrived at dock_bay", cam: "Loading Dock", tone: "amber" as const },
              ].map((n, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-800 bg-[#07111e] p-2.5 transition hover:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <Badge tone={n.tone}>{n.cam}</Badge>
                    <span className="font-mono text-[10px] text-slate-500">{n.t}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-200">{n.m}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}