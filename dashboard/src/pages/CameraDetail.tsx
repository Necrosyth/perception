import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, Segmented, Toggle } from "../components/ui";
import { VideoTile } from "../components/VideoTile";
import { streamUrl, useCameras } from "../lib/api";
import { timeHHMMSS } from "../lib/utils";

export default function CameraDetail() {
  const { cameraId = "loading_dock" } = useParams();
  const { cameras, fromApi } = useCameras();
  const cam = useMemo(() => cameras.find((c) => c.id === cameraId) ?? cameras[0], [cameras, cameraId]);
  const [showZones, setShowZones] = useState(true);
  const [showObjects, setShowObjects] = useState(true);
  const [zoom, setZoom] = useState<"1x" | "2x">("1x");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-aina-slate">
        <Link to="/" className="hover:text-aina-teal">Live</Link>
        <span>/</span>
        <span className="text-aina-frost">{cam.name}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-aina-frost">{cam.name}</h1>
        <div className="flex items-center gap-2">
          <Segmented<"1x" | "2x"> value={zoom} onChange={setZoom} options={[{ value: "1x", label: "Main" }, { value: "2x", label: "Sub" }]} />
          <Button variant="solid" size="sm">Snapshot</Button>
          {cam.ptz && <Button variant="outline" size="sm">PTZ presets</Button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
        <div className="relative">
          <VideoTile
            meta={{
              id: cam.id,
              name: zoom === "2x" ? `${cam.name} — sub` : cam.name,
              zones: showZones ? cam.zones : [],
              hasMotion: cam.hasMotion,
              fps: cam.fps,
              palette: cam.palette,
              timestamp: Date.now(),
              live: cam.enabled,
              streamUrl: fromApi && cam.enabled ? streamUrl(cam.id) : undefined,
              objects: showObjects
                ? [
                    { label: "person", box: [34, 28, 10, 26] as [number, number, number, number], color: "#2FBFA4" },
                    ...(cameraId === "loading_dock" ? [{ label: "truck", box: [48, 50, 30, 22] as [number, number, number, number], color: "#E8A33D" }] : []),
                  ]
                : [],
            }}
          />
          {cam.hasMotion && (
            <div className="absolute right-3 top-12 flex items-center gap-1.5 rounded bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-aina-amber">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aina-amber" /> motion detected
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Card className="p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-aina-slate">Overlays</p>
            <div className="flex items-center justify-between border-b border-aina-slate/10 py-2">
              <span className="text-sm">Zones</span>
              <Toggle checked={showZones} onChange={setShowZones} label="zones" />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Objects</span>
              <Toggle checked={showObjects} onChange={setShowObjects} label="objects" />
            </div>
          </Card>

          <Card className="p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-aina-slate">Stream</p>
            <div className="space-y-1.5 text-xs text-aina-slate">
              <p className="flex justify-between"><span>Input</span><span className="font-mono text-aina-frost">{cam.fps.toFixed(1)} fps</span></p>
              <p className="flex justify-between"><span>Detect</span><span className="font-mono text-aina-frost">{cam.fps.toFixed(1)} fps</span></p>
              <p className="flex justify-between"><span>Bitrate</span><span className="font-mono text-aina-frost">{cam.bitrate}</span></p>
              <p className="flex justify-between"><span>Now</span><span className="font-mono text-aina-frost">{timeHHMMSS(Date.now())}</span></p>
            </div>
          </Card>

          <Card className="p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-aina-slate">Recent activity</p>
            <div className="flex flex-wrap gap-1.5">
              {(cameraId === "loading_dock"
                ? ["person · 09:22", "loitering · 09:25", "truck · 14:40", "license_plate · 16:27"]
                : cameraId === "lobby"
                  ? ["person · 08:40", "face · 13:05"]
                  : ["forklift · 09:05", "person · 07:31"]
              ).map((t) => (
                <Link key={t} to={`/review?camera=${cameraId}`}>
                  <Badge tone="teal" className="cursor-pointer hover:bg-aina-teal/25">{t}</Badge>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}