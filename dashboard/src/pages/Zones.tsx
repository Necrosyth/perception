import { useMemo, useState } from "react";
import { Badge, Button, Card, PageHeader, Select } from "../components/ui";
import { I } from "../components/icons";
import { cameras } from "../lib/mock";

type Zone = { name: string; color: string; points: [number, number][] };

const ZONES: Zone[] = [
  { name: "dock_entry", color: "#2FBFA4", points: [[8, 30], [45, 26], [52, 74], [10, 78]] },
  { name: "dock_bay", color: "#E8A33D", points: [[52, 44], [92, 40], [94, 86], [52, 86]] },
];

export default function Zones() {
  const [camera, setCamera] = useState("loading_dock");
  const cam = useMemo(() => cameras.find((c) => c.id === camera)!, [camera]);
  const [zones, setZones] = useState<Zone[]>(ZONES);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [draftName, setDraftName] = useState("");
  const [mode, setMode] = useState<"view" | "draw">("view");
  const [hover, setHover] = useState<[number, number] | null>(null);

  const saveDraft = () => {
    if (draft.length < 3 || !draftName.trim()) return;
    setZones((z) => [...z, { name: draftName.trim(), color: "#7aa7f5", points: draft }]);
    setDraft([]);
    setDraftName("");
    setMode("view");
  };

  return (
    <div>
      <PageHeader
        title="Zones"
        subtitle="Draw zone polygons per camera — zones gate behavioral events (entered_zone, loitering)"
        actions={
          <>
            <Select value={camera} onChange={(e) => setCamera(e.target.value)} className="w-44">
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Button variant={mode === "draw" ? "solid" : "outline"} onClick={() => { setMode(mode === "draw" ? "view" : "draw"); setDraft([]); }}>
              <I.Zone className="h-4 w-4" /> {mode === "draw" ? "Cancel draw" : "Draw zone"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="relative overflow-hidden">
          <svg
            viewBox="0 0 320 180"
            className="block w-full cursor-crosshair"
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
              setHover([((e.clientX - r.left) / r.width) * 320, ((e.clientY - r.top) / r.height) * 180]);
            }}
          >
            <defs>
              <linearGradient id="zonebg" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor={cam.palette[0]} />
                <stop offset="1" stopColor={cam.palette[1]} />
              </linearGradient>
            </defs>
            <rect width="320" height="180" fill="url(#zonebg)" />
            {/* scene guides — dock bay / racks */}
            <line x1="50" y1="0" x2="50" y2="180" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="2" />
            <line x1="0" y1="75" x2="320" y2="75" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="2" />
            <circle cx="160" cy="96" r="26" fill="none" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1.5" />

            {zones.map((z) => (
              <g key={z.name}>
                <polygon points={z.points.map((p) => p.join(",")).join(" ")} fill={z.color} fillOpacity="0.14" stroke={z.color} strokeWidth="1.6" />
                <text x={z.points[0][0] + 3} y={z.points[0][1] - 4} fontSize="8" fill={z.color} fontWeight="700">{z.name}</text>
              </g>
            ))}

            {draft.length > 0 && (
              <>
                <polygon points={draft.map((p) => p.join(",")).join(" ")} fill="#7aa7f5" fillOpacity="0.12" stroke="#7aa7f5" strokeWidth="1.6" strokeDasharray="4 3" />
                {draft.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#7aa7f5" />
                ))}
              </>
            )}
            {mode === "draw" && hover && (
              <circle cx={hover[0]} cy={hover[1]} r="2.2" fill="#7aa7f5" stroke="#fff" strokeWidth="0.6" />
            )}
          </svg>
          <div className="absolute left-2 top-2">
            <Badge tone="navy">{cam.name}</Badge>
          </div>
          {mode === "draw" && (
            <div className="absolute right-2 top-2">
              <Badge tone="amber">{draft.length} point{draft.length === 1 ? "" : "s"} placed — click on the scene to add vertices</Badge>
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card className="p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-aina-slate">Zones on {cam.name}</p>
            <div className="space-y-2">
              {zones.map((z) => (
                <div key={z.name} className="flex items-center justify-between rounded border border-aina-slate/10 px-2.5 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: z.color }} />
                    {z.name}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setZones((zs) => zs.filter((x) => x !== z))}
                  >
                    delete
                  </Button>
                </div>
              ))}
              {zones.length === 0 && <p className="text-xs text-aina-slate">No zones drawn yet.</p>}
            </div>
          </Card>

          {mode === "draw" && (
            <Card className="p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-aina-slate">New zone</p>
              <input
                className="mb-2 w-full rounded-md border border-aina-slate/25 bg-aina-navy-deep/60 px-3 py-1.5 text-sm outline-none focus:border-aina-teal/70"
                placeholder="zone name (e.g. south_bay)"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
              <Button size="sm" variant="solid" className="w-full" disabled={draft.length < 3 || !draftName.trim()} onClick={saveDraft}>
                Save zone
              </Button>
              <p className="mt-2 text-[10px] leading-4 text-aina-slate/70">
                Saved polygons persist to <span className="font-mono">config/aina.yaml</span> (Stage 10) and gate behavioral events in the orchestrator.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}