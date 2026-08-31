import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, PageHeader, Segmented, Toggle } from "../components/ui";
import { VideoTile } from "../components/VideoTile";
import { streamUrl, useCameras } from "../lib/api";
import { timeHHMMSS } from "../lib/utils";
import { I } from "../components/icons";

export default function CameraDetail() {
  const { cameraId = "loading_dock" } = useParams();
  const { cameras, fromApi } = useCameras();
  const cam = useMemo(() => cameras.find((c) => c.id === cameraId) ?? cameras[0], [cameras, cameraId]);
  const [showZones, setShowZones] = useState(true);
  const [showObjects, setShowObjects] = useState(true);
  const [zoom, setZoom] = useState<"1x" | "2x">("1x");
  const [snapshotTaken, setSnapshotTaken] = useState(false);

  const takeSnapshot = () => {
    setSnapshotTaken(true);
    setTimeout(() => setSnapshotTaken(false), 2500);
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb Header */}
      <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
        <Link to="/" className="text-slate-400 hover:text-[#2fbfa4] transition-colors flex items-center gap-1">
          <I.Grid className="h-3 w-3" /> Live Matrix
        </Link>
        <span>/</span>
        <span className="text-[#38efcb] font-semibold">{cam.name}</span>
      </div>

      <PageHeader
        title={cam.name}
        subtitle={`RTSP Ingest: rtsp://edge-node:8554/${cam.id} · Resolution 1080p @ ${cam.fps.toFixed(1)} FPS`}
        badge={
          <Badge tone={cam.hasMotion ? "amber" : "teal"} dot={true}>
            {cam.hasMotion ? "MOTION TRIGGER" : "FEED NOMINAL"}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Segmented<"1x" | "2x">
              value={zoom}
              onChange={setZoom}
              options={[
                { value: "1x", label: "Main 1080p" },
                { value: "2x", label: "Sub 480p" },
              ]}
            />
            <Button variant="solid" size="sm" onClick={takeSnapshot}>
              <I.Camera className="h-3.5 w-3.5" />
              {snapshotTaken ? "Captured ✓" : "Snapshot"}
            </Button>
            {cam.ptz && (
              <Button variant="outline" size="sm">
                <I.Crosshair className="h-3.5 w-3.5" /> PTZ Control
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Main High-Res Viewport */}
        <div className="relative">
          <VideoTile
            aspect="aspect-video"
            showControls={false}
            meta={{
              id: cam.id,
              name: zoom === "2x" ? `${cam.name} — Substream` : cam.name,
              zones: showZones ? cam.zones : [],
              hasMotion: cam.hasMotion,
              fps: cam.fps,
              palette: cam.palette,
              timestamp: Date.now(),
              live: cam.enabled,
              streamUrl: fromApi && cam.enabled ? streamUrl(cam.id) : undefined,
              objects: showObjects
                ? [
                    { label: "person", box: [34, 28, 10, 26] as [number, number, number, number], color: "#2FBFA4", score: 0.95 },
                    ...(cameraId === "loading_dock"
                      ? [{ label: "truck", box: [48, 50, 30, 22] as [number, number, number, number], color: "#E8A33D", score: 0.89 }]
                      : []),
                  ]
                : [],
            }}
          />

          {cam.hasMotion && (
            <div className="absolute right-4 top-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-black/70 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-amber-400 backdrop-blur-md shadow-lg shadow-black/60 z-20">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              Active Track Breached
            </div>
          )}
        </div>

        {/* Sidebar Telemetry and Controls */}
        <div className="space-y-4">
          {/* Overlays Toggle */}
          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              HUD Overlays & Metadata
            </p>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <span className="text-xs font-medium text-slate-200">Zone Boundaries</span>
              <Toggle checked={showZones} onChange={setShowZones} label="zones" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-200">Detection Bounding Boxes</span>
              <Toggle checked={showObjects} onChange={setShowObjects} label="objects" />
            </div>
          </Card>

          {/* Stream Telemetry */}
          <Card className="p-4 space-y-3 font-mono text-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Stream Telemetry
            </p>
            <div className="space-y-2 text-slate-400">
              <div className="flex justify-between">
                <span>Ingest FPS</span>
                <span className="text-[#f0f6fc] font-bold">{cam.fps.toFixed(1)} FPS</span>
              </div>
              <div className="flex justify-between">
                <span>Inference Pipeline</span>
                <span className="text-[#2fbfa4] font-bold">{cam.fps.toFixed(1)} FPS</span>
              </div>
              <div className="flex justify-between">
                <span>Bitrate</span>
                <span className="text-[#f0f6fc] font-bold">{cam.bitrate}</span>
              </div>
              <div className="flex justify-between">
                <span>Codec</span>
                <span className="text-slate-300">H.265 / HEVC</span>
              </div>
              <div className="flex justify-between">
                <span>Synced Timecode</span>
                <span className="text-slate-300">{timeHHMMSS(Date.now())}</span>
              </div>
            </div>
          </Card>

          {/* Recent Events on this camera */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                Recent Detections
              </p>
              <Link to={`/review?camera=${cameraId}`} className="text-[10px] text-[#2fbfa4] hover:underline font-mono">
                View All →
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {(cameraId === "loading_dock"
                ? ["person · 09:22", "loitering · 09:25", "truck · 14:40", "plate · 16:27"]
                : cameraId === "lobby"
                  ? ["person · 08:40", "face · 13:05"]
                  : ["forklift · 09:05", "person · 07:31"]
              ).map((t) => (
                <Link key={t} to={`/review?camera=${cameraId}`}>
                  <Badge tone="teal" className="cursor-pointer transition hover:bg-[#2fbfa4]/25 hover:border-[#2fbfa4]/60">
                    {t}
                  </Badge>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}