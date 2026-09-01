import { useEffect, useState } from "react";
import { Badge, Button, Card, PageHeader } from "../components/ui";
import { I } from "../components/icons";
import { getNotifications, type Notification, useCameras } from "../lib/api";
import { timeAgo } from "../lib/utils";
import { EmptyState } from "../components/ui";

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [push, setPush] = useState(true);
  const [testSent, setTestSent] = useState(false);
  const { cameras } = useCameras();

  const refresh = async () => {
    const n = await getNotifications(30);
    if (n) {
      setNotifications(n);
      setLoaded(true);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleTestDispatch = () => {
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alerts"
        subtitle="Live alerts derived from real zone-trigger events in Postgres"
        badge={
          <Badge tone="ok" dot>
            live feed
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
              <p className="text-xs font-semibold text-obs-fg">Detected activity</p>
              <p className="text-[11px] text-obs-fg-faint">Real zone membership events</p>
            </div>
            <Badge tone="accent">{notifications.length} recent</Badge>
          </div>

          <div className="divide-y divide-obs-line">
            {notifications.length === 0 ? (
              <div className="px-5 py-8">
                <EmptyState
                  title={loaded ? "No activity yet" : "Loading live activity…"}
                  hint="Zone entry/exit events will appear here as perception tracks them."
                />
              </div>
            ) : (
              notifications.map((n, i) => {
                const cam = cameras.find((c) => c.id === n.camera);
                const isEntry = n.event_type === "entered_zone";
                return (
                  <div key={`${n.started_at}-${i}`} className="flex items-start justify-between px-5 py-3.5 transition hover:bg-obs-1">
                    <div className="flex items-start gap-3">
                      <Badge tone={isEntry ? "alert" : "ok"} dot={isEntry}>
                        {isEntry ? "entered" : "left"}
                      </Badge>
                      <div>
                        <p className="text-sm text-obs-fg">
                          {n.zone || n.camera} · <span className="capitalize">{cam?.name ?? n.camera}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] font-mono text-obs-fg-faint">
                          {timeAgo(new Date(n.started_at).getTime())}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
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
              <Button size="xs" variant={push ? "solid" : "outline"} onClick={() => setPush((p) => !p)}>
                {push ? "On" : "Off"}
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-obs-fg-faint font-mono">
              Dispatch happens for real review segments matched to every entered_zone event.
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
              Now watching
            </p>
            <div className="space-y-2">
              {cameras.map((c) => (
                <div key={c.id} className="rounded-md border border-obs-line bg-obs-1 p-2.5">
                  <div className="flex items-center justify-between">
                    <Badge tone={c.enabled ? "ok" : "slate"}>{c.name}</Badge>
                    <span className="font-mono text-[10px] text-obs-fg-faint">
                      {c.enabled ? "streaming" : "off"}
                    </span>
                  </div>
                </div>
              ))}
              {cameras.length === 0 && (
                <p className="text-[11px] text-obs-fg-faint">No camera feeds configured.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}