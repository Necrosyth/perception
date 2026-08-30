import { useState } from "react";
import { Badge, Button, Card, PageHeader, Toggle } from "../components/ui";
import { I } from "../components/icons";
import { cameras } from "../lib/mock";

type Scope = { id: string; label: string; kind: "alert" | "detection"; camera: string; enabled: boolean };

const INITIAL: Scope[] = [
  { id: "s1", label: "person in dock_entry", kind: "alert", camera: "loading_dock", enabled: true },
  { id: "s2", label: "loitering past dwell", kind: "alert", camera: "loading_dock", enabled: true },
  { id: "s3", label: "any alert", kind: "alert", camera: "parking_north", enabled: false },
  { id: "s4", label: "vehicle at gate", kind: "detection", camera: "parking_south", enabled: false },
  { id: "s5", label: "face at doorway", kind: "detection", camera: "lobby", enabled: true },
];

export default function Notifications() {
  const [scopes, setScopes] = useState(INITIAL);
  const [push, setPush] = useState(true);
  const toggle = (id: string) => setScopes((s) => s.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Web-push delivery when a review segment matches a scope — matched server-side on segment creation"
        actions={
          <Button variant="solid" size="sm"><I.BellOn className="h-4 w-4" /> Push enabled</Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          <div className="border-b border-aina-slate/10 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-aina-slate">Notification scopes</p>
          </div>
          {scopes.map((s) => {
            const cam = cameras.find((c) => c.id === s.camera);
            return (
              <div key={s.id} className="flex items-center justify-between border-b border-aina-slate/8 px-4 py-3 last:border-0">
                <div className="flex items-center gap-2.5">
                  <Badge tone={s.kind === "alert" ? "red" : "teal"}>{s.kind}</Badge>
                  <div>
                    <p className="text-sm text-aina-frost">{s.label}</p>
                    <p className="text-[11px] text-aina-slate">on {cam?.name}</p>
                  </div>
                </div>
                <Toggle checked={s.enabled} onChange={() => toggle(s.id)} label={`toggle ${s.label}`} />
              </div>
            );
          })}
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <p className="mb-1 text-xs uppercase tracking-wider text-aina-slate">Delivery</p>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Browser push (Web Push / VAPID)</span>
              <Toggle checked={push} onChange={setPush} label="browser push" />
            </div>
            <p className="text-[11px] leading-5 text-aina-slate/70">
              Subscriptions registered per browser; delivery only for segments matching an enabled scope on the segment's camera.
            </p>
          </Card>

          <Card className="p-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-aina-slate">Recents</p>
            <div className="space-y-1.5 text-xs">
              {[
                { t: "2m ago", m: "loitering in dock_entry · 09:25", tone: "red" as const },
                { t: "41m ago", m: "person at Lobby Entrance · 13:05", tone: "teal" as const },
                { t: "3h ago", m: "truck at dock_bay · 14:40", tone: "amber" as const },
              ].map((n, i) => (
                <div key={i} className="flex items-center justify-between rounded border border-aina-slate/10 px-2.5 py-2">
                  <span className="text-aina-frost/90">{n.m}</span>
                  <span className="text-[10px] text-aina-slate">{n.t}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}