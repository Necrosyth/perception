import { useMemo, useState } from "react";
import { Badge, Button, Card, Input, PageHeader, Select } from "../components/ui";
import { I } from "../components/icons";
import { cameras } from "../lib/mock";

type Zone = { name: string; color: string; points: [number, number][]; rules?: string };

const ZONES: Zone[] = [
  { name: "dock_entry", color: "#2FBFA4", points: [[8, 30], [45, 26], [52, 74], [10, 78]], rules: "Intrusion + Loitering" },
  { name: "dock_bay", color: "#E8A33D", points: [[52, 44], [92, 40], [94, 86], [52, 86]], rules: "Vehicle Dwell" },
];

export default function Zones() {
  const [camera, setCamera] = useState("loading_dock");
  const cam = useMemo(() => cameras.find((c) => c.id === camera)!, [camera]);
  const [zones, setZones] = useState<Zone[]>(ZONES);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState("#00E5FF");
  const [mode, setMode] = useState<"view" | "draw">("view");
  const [hover, setHover] = useState<[number, number] | null>(null);

  const saveDraft = () => {
    if (draft.length < 3 || !draftName.trim()) return;
    setZones((z) => [
      ...z,
      { name: draftName.trim().toLowerCase().replace(/\s+/g, "_"), color: draftColor, points: draft, rules: "Standard Track Gate" },
    ]);
    setDraft([]);
    setDraftName("");
    setMode("view");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Zone Matrix & Geometric Polygon Editor"
        subtitle="Draw boundary coordinates per camera to trigger behavioral states (entered_zone, stationary, loitering)"
        badge={
          <Badge tone="teal" dot={true}>
            PERSISTED TO AINA.YAML
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Select value={camera} onChange={(e) => setCamera(e.target.value)} className="w-48">
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
              {mode === "draw" ? "Cancel Drawing" : "Draw New Zone"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Tactical Polygon Canvas */}
        <Card className="relative overflow-hidden p-1 border-slate-800 bg-[#07111e]">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            <svg
              viewBox="0 0 320 180"
              className={`block w-full h-full ${mode === "draw" ? "cursor-crosshair" : "cursor-default"}`}
              onClick={(e) => {
                if (mode !== "draw") return;
                const r = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width) * 320;
                const y = ((e.clientY - r.top) / r.height) * 180;
                setDraft((d) => [...d, [Math.round(x), Math.round(y)]]);
              }}
              onMouseMove={(e) => {
                if (mode !== "draw") return;
                const r = e.currentTarget.getBoundingClientRect();
                setHover([
                  Math.round(((e.clientX - r.left) / r.width) * 320),
                  Math.round(((e.clientY - r.top) / r.height) * 180),
                ]);
              }}
            >
              <defs>
                <linearGradient id="zonebg" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor={cam.palette[0]} />
                  <stop offset="1" stopColor={cam.palette[1]} />
                </linearGradient>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
                </pattern>
              </defs>

              <rect width="320" height="180" fill="url(#zonebg)" />
              <rect width="320" height="180" fill="url(#grid)" />

              {/* Viewfinder guidelines */}
              <line x1="50" y1="0" x2="50" y2="180" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="0" y1="75" x2="320" y2="75" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx="160" cy="90" r="30" fill="none" stroke="#2fbfa4" strokeOpacity="0.12" strokeWidth="1" />

              {/* Render existing zones */}
              {zones.map((z) => (
                <g key={z.name} className="transition-all">
                  <polygon
                    points={z.points.map((p) => p.join(",")).join(" ")}
                    fill={z.color}
                    fillOpacity="0.18"
                    stroke={z.color}
                    strokeWidth="1.75"
                  />
                  {z.points.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r="2" fill={z.color} />
                  ))}
                  <text
                    x={z.points[0][0] + 4}
                    y={z.points[0][1] - 4}
                    fontSize="7"
                    fill="#ffffff"
                    fontWeight="bold"
                    className="font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                  >
                    {z.name.toUpperCase()}
                  </text>
                </g>
              ))}

              {/* Render draft polygon */}
              {draft.length > 0 && (
                <>
                  <polygon
                    points={draft.map((p) => p.join(",")).join(" ")}
                    fill={draftColor}
                    fillOpacity="0.25"
                    stroke={draftColor}
                    strokeWidth="1.8"
                    strokeDasharray="4 3"
                  />
                  {draft.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={draftColor} stroke="#ffffff" strokeWidth="0.8" />
                  ))}
                </>
              )}

              {/* Cursor crosshair indicator */}
              {mode === "draw" && hover && (
                <g>
                  <circle cx={hover[0]} cy={hover[1]} r="3" fill="none" stroke="#00e5ff" strokeWidth="1" />
                  <circle cx={hover[0]} cy={hover[1]} r="1" fill="#00e5ff" />
                </g>
              )}
            </svg>

            {/* Overlaid status tags */}
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <Badge tone="navy" className="backdrop-blur-md bg-black/60">
                {cam.name}
              </Badge>
              {hover && mode === "draw" && (
                <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-[#00e5ff] backdrop-blur-md border border-white/10">
                  X: {hover[0]} · Y: {hover[1]}
                </span>
              )}
            </div>

            {mode === "draw" && (
              <div className="absolute right-3 top-3">
                <Badge tone="amber" dot={true}>
                  {draft.length} Vertex Points Placed (Click to add)
                </Badge>
              </div>
            )}
          </div>
        </Card>

        {/* Sidebar: Active Zones List and Draw Form */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                Defined Zones on Feed
              </p>
              <Badge tone="slate">{zones.length} Active</Badge>
            </div>

            <div className="space-y-2">
              {zones.map((z) => (
                <div
                  key={z.name}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#07111e] p-3 transition hover:border-slate-700"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-3 w-3 rounded-full shadow-[0_0_8px]" style={{ background: z.color, boxShadow: `0 0 8px ${z.color}` }} />
                    <div>
                      <p className="text-xs font-bold text-white font-mono">{z.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{z.points.length} vertices · {z.rules}</p>
                    </div>
                  </div>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300"
                    onClick={() => setZones((zs) => zs.filter((x) => x !== z))}
                  >
                    Delete
                  </Button>
                </div>
              ))}
              {zones.length === 0 && <p className="text-xs text-slate-500">No zones defined yet.</p>}
            </div>
          </Card>

          {mode === "draw" && (
            <Card className="p-4 space-y-3 border-[#2fbfa4]/40 bg-[#0c1a2e]/90 shadow-xl shadow-black/50 animate-in fade-in">
              <div>
                <p className="text-xs font-bold text-[#38efcb] font-display">New Zone Configuration</p>
                <p className="text-[11px] text-slate-400">Add at least 3 points on the video viewport</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Zone Unique Identifier</label>
                <Input
                  placeholder="e.g. dock_perimeter_north"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Zone Boundary Color</label>
                <div className="flex items-center gap-2">
                  {["#2FBFA4", "#00E5FF", "#E8A33D", "#EF4444", "#8B5CF6"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDraftColor(c)}
                      className={`h-7 w-7 rounded-lg border transition-all ${
                        draftColor === c ? "border-white scale-110 shadow-[0_0_10px_white]" : "border-transparent opacity-60"
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="solid"
                  className="w-full"
                  disabled={draft.length < 3 || !draftName.trim()}
                  onClick={saveDraft}
                >
                  Save Zone Polygon
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}