import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input, PageHeader, Select } from "../components/ui";
import { I } from "../components/icons";
import { createZone, deleteZone, getZones, streamUrl, type ZoneRow, useCameras } from "../lib/api";

const ZONE_COLORS = ["#C2A878", "#8AA3AD", "#D3A05F", "#C06F66", "#8FAE8D"];

export default function Zones() {
  const { cameras } = useCameras();
  const [camera, setCamera] = useState<string>("");
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState("#8AA3AD");
  const [mode, setMode] = useState<"view" | "draw">("view");
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (cameras.length && !camera) setCamera(cameras[0].id);
  }, [cameras, camera]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const z = await getZones();
      if (cancelled) return;
      if (z) setZones(z);
      setLoaded(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const camZones = useMemo(
    () => zones.filter((z) => z.camera === camera),
    [zones, camera],
  );

  const saveDraft = async () => {
    if (draft.length < 3 || !draftName.trim() || !camera) return;
    const name = draftName.trim().toLowerCase().replace(/\s+/g, "_");
    const created = await createZone(camera, name, draft);
    if (created) {
      const z = await getZones();
      if (z) setZones(z);
    }
    setDraft([]);
    setDraftName("");
    setMode("view");
  };

  const removeZone = async (id: string) => {
    await deleteZone(id);
    const z = await getZones();
    if (z) setZones(z);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Zones"
        subtitle="Define boundary polygons per camera to trigger behavioral states"
        badge={
          <Badge tone="ok" dot>
            persisted
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Select value={camera} onChange={(e) => setCamera(e.target.value)} className="w-52">
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              variant={mode === "draw" ? "danger" : "solid"}
              size="sm"
              onClick={() => {
                setMode(mode === "draw" ? "view" : "draw");
                setDraft([]);
              }}
            >
              <I.Zone className="h-4 w-4" />
              {mode === "draw" ? "Cancel drawing" : "Draw new zone"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="relative overflow-hidden p-1 border-obs-line bg-obs-1">
          <div className="relative aspect-video overflow-hidden rounded bg-black">
            {camera && streamUrl(camera) && !videoFailed ? (
              <video
                className="absolute inset-0 z-0 h-full w-full bg-black object-cover"
                src={streamUrl(camera)}
                autoPlay
                muted
                loop
                playsInline
                onError={() => setVideoFailed(true)}
              />
            ) : (
              <div className="absolute inset-0 z-0 h-full w-full bg-[#161c25]">
                <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 70% 18%, rgba(255,255,255,0.10) 0%, transparent 75%)" }} />
                <div className="absolute inset-0" style={{ background: "radial-gradient(circle, transparent 70%, rgba(0,0,0,0.55) 100%)" }} />
              </div>
            )}

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className={`block relative z-10 w-full h-full ${mode === "draw" ? "cursor-crosshair" : "cursor-default"}`}
              onClick={(e) => {
                if (mode !== "draw") return;
                const r = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width) * 100;
                const y = ((e.clientY - r.top) / r.height) * 100;
                setDraft((d) => [...d, [x, y]]);
              }}
              onMouseMove={(e) => {
                if (mode !== "draw") return;
                const r = e.currentTarget.getBoundingClientRect();
                setHover([
                  ((e.clientX - r.left) / r.width) * 100,
                  ((e.clientY - r.top) / r.height) * 100,
                ]);
              }}
            >
              <defs>
                <radialGradient id="zlight" cx="0.7" cy="0.18" r="0.75">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.10" />
                  <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="zvignette" cx="0.5" cy="0.45" r="0.8">
                  <stop offset="0.7" stopColor="#000000" stopOpacity="0" />
                  <stop offset="1" stopColor="#000000" stopOpacity="0.55" />
                </radialGradient>
              </defs>

              {camZones.map((z, ci) => {
                const color = ZONE_COLORS[ci % ZONE_COLORS.length];
                return (
                  <g key={z.id}>
                    <polygon
                      points={z.polygon.map((p) => p.join(",")).join(" ")}
                      fill={color}
                      fillOpacity="0.16"
                      stroke={color}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    {z.polygon.map((p, i) => (
                      <circle key={i} cx={p[0]} cy={p[1]} r="2" fill={color} />
                    ))}
                    <text
                      x={z.polygon[0][0] + 5}
                      y={z.polygon[0][1] - 5}
                      fontSize="7"
                      fill="#ece7dd"
                      fontWeight="500"
                      className="font-mono"
                    >
                      {z.name.toUpperCase()}
                    </text>
                  </g>
                );
              })}

              {draft.length > 0 && (
                <>
                  <polygon
                    points={draft.map((p) => p.join(",")).join(" ")}
                    fill={draftColor}
                    fillOpacity="0.22"
                    stroke={draftColor}
                    strokeWidth="1.6"
                    strokeDasharray="4 3"
                    strokeLinejoin="round"
                  />
                  {draft.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={draftColor} stroke="#0c0e11" strokeWidth="0.8" />
                  ))}
                </>
              )}

              {mode === "draw" && hover && (
                <circle cx={hover[0]} cy={hover[1]} r="3" fill="none" stroke="#8aa3ad" strokeWidth="1" />
              )}
            </svg>

            <div className="absolute left-3 top-3 flex items-center gap-2">
              <Badge tone="neutral" className="bg-black/50">
                {camera}
              </Badge>
              {hover && mode === "draw" && (
                <span className="rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-obs-info backdrop-blur-sm">
                  X: {hover[0].toFixed(0)} · Y: {hover[1].toFixed(0)}
                </span>
              )}
            </div>

            {mode === "draw" && (
              <div className="absolute right-3 top-3">
                <Badge tone="warn" dot>
                  {draft.length} vertex points
                </Badge>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
                Defined zones
              </p>
              <Badge tone="slate">{loaded ? zones.length : "…"}</Badge>
            </div>

            <div className="space-y-2">
              {zones.length === 0 && loaded && (
                <p className="text-xs text-obs-fg-faint">No zones persisted yet.</p>
              )}
              {zones.map((z, ci) => (
                <div
                  key={z.id}
                  className="flex items-center justify-between rounded-md border border-obs-line bg-obs-1 p-3 transition hover:border-obs-line-strong"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-3 w-3 rounded-full" style={{ background: ZONE_COLORS[ci % ZONE_COLORS.length] }} />
                    <div>
                      <p className="text-xs font-medium text-obs-fg font-mono">{z.name}</p>
                      <p className="text-[10px] text-obs-fg-faint font-mono">{z.camera} · {z.polygon.length} vertices</p>
                    </div>
                  </div>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-obs-alert hover:text-obs-alert"
                    onClick={() => removeZone(z.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          {mode === "draw" && (
            <Card className="p-4 space-y-3 border-obs-accent/30 bg-obs-2 obs-rise">
              <div>
                <p className="text-sm font-medium text-obs-fg">New zone</p>
                <p className="text-[11px] text-obs-fg-dim">Add at least 3 points on the viewport</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-obs-fg-dim">Identifier</label>
                <Input
                  placeholder="e.g. dock_perimeter_north"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-obs-fg-dim">Boundary color</label>
                <div className="flex items-center gap-2">
                  {ZONE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDraftColor(c)}
                      className={`h-7 w-7 rounded-md border transition-all ${
                        draftColor === c ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-1 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="solid"
                  className="w-full"
                  disabled={draft.length < 3 || !draftName.trim()}
                  onClick={saveDraft}
                >
                  Save polygon
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}