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
        title="Alerts"
        subtitle="Configure which review segments trigger web-push and webhook notifications"
        badge={
          <Badge tone="ok" dot>
            push enabled
          </Badge>
        }
        actions={
          <Button variant="solid" size="sm" onClick={handleTestDispatch}>
            <I.BellOn className="h-4 w-4" />
            {testSent ? "Test sent" : "Send test"}
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-obs-line px-5 py-3.5">
            <div>
              <p className="text-xs font-semibold text-obs-fg">Notification scopes</p>
              <p className="text-[11px] text-obs-fg-faint">Camera-level trigger bindings</p>
            </div>
            <Badge tone="accent">{scopes.filter((s) => s.enabled).length} enabled</Badge>
          </div>

          <div className="divide-y divide-obs-line">
            {scopes.map((s) => {
              const cam = cameras.find((c) => c.id === s.camera);
              return (
                <div key={s.id} className="flex items-center justify-between px-5 py-3.5 transition hover:bg-obs-1">
                  <div className="flex items-center gap-3">
                    <Badge tone={s.kind === "alert" ? "alert" : "ok"} dot={s.kind === "alert"}>
                      {s.kind}
                    </Badge>
                    <div>
                      <p className="text-sm text-obs-fg">{s.label}</p>
                      <p className="mt-0.5 text-[11px] font-mono text-obs-fg-faint">Assigned to: {cam?.name}</p>
                    </div>
                  </div>
                  <Toggle checked={s.enabled} onChange={() => toggle(s.id)} label={`toggle ${s.label}`} />
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
              Delivery channel
            </p>
            <div className="flex items-center justify-between border-b border-obs-line pb-3">
              <div>
                <span className="text-sm font-medium text-obs-fg">Browser web-push</span>
                <p className="mt-0.5 text-[11px] text-obs-fg-faint">Desktop and mobile notifications</p>
              </div>
              <Toggle checked={push} onChange={setPush} label="browser push" />
            </div>
            <p className="text-[11px] leading-relaxed text-obs-fg-faint font-mono">
              Subscriptions register per browser; dispatches only for segments matching an enabled scope.
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
              Recently dispatched
            </p>
            <div className="space-y-2">
              {[
                { t: "2m ago", m: "Loitering alert in dock_entry", cam: "Loading Dock", tone: "alert" as const },
                { t: "41m ago", m: "Face detected at doorway", cam: "Lobby Entrance", tone: "ok" as const },
                { t: "3h ago", m: "Vehicle arrived at dock_bay", cam: "Loading Dock", tone: "warn" as const },
              ].map((n, i) => (
                <div key={i} className="rounded-md border border-obs-line bg-obs-1 p-2.5 transition hover:border-obs-line-strong">
                  <div className="flex items-center justify-between">
                    <Badge tone={n.tone}>{n.cam}</Badge>
                    <span className="font-mono text-[10px] text-obs-fg-faint">{n.t}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-obs-fg">{n.m}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
