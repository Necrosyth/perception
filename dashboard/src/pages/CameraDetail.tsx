import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, PageHeader, Segmented, Toggle } from "../components/ui";
import { VideoTile } from "../components/VideoTile";
import { getSegments, streamUrl, useCameras, type Segment } from "../lib/api";
import { timeHHMMSS } from "../lib/utils";
import { I } from "../components/icons";

export default function CameraDetail() {
  const { cameraId = "" } = useParams();
  const { cameras, fromApi } = useCameras();
  const cam = useMemo(() => cameras.find((c) => c.id === cameraId) ?? cameras[0], [cameras, cameraId]);
  const [showZones, setShowZones] = useState(true);
  const [zoom, setZoom] = useState<"1x" | "2x">("1x");
  const [snapshotTaken, setSnapshotTaken] = useState(false);
  const [recent, setRecent] = useState<Segment[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const segs = await getSegments({ camera: cameraId, limit: 8 });
      if (!cancelled && segs) setRecent(segs);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [cameraId]);

  const takeSnapshot = () => {
    setSnapshotTaken(true);
    setTimeout(() => setSnapshotTaken(false), 2500);
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-obs-fg-faint">
        <Link to="/" className="text-obs-fg-dim hover:text-obs-fg transition-colors flex items-center gap-1">
          <I.Grid className="h-3 w-3" /> Live View
        </Link>
        <span>/</span>
        <span className="text-obs-fg">{cam.name}</span>
      </div>

      <PageHeader
        title={cam.name}
        subtitle={`RTSP ingest via go2rtc · ${cam.source || "live feed"}`}
        badge={
          <Badge tone={cam.hasMotion ? "warn" : "ok"} dot>
            {cam.hasMotion ? "motion detected" : "feed nominal"}
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
              {snapshotTaken ? "Captured" : "Snapshot"}
            </Button>
            {cam.ptz && (
              <Button variant="outline" size="sm">
                <I.Crosshair className="h-3.5 w-3.5" /> PTZ
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="relative">
          <VideoTile
            aspect="aspect-video"
            showControls={false}
            meta={{
              id: cam.id,
              name: zoom === "2x" ? `${cam.name} · Substream` : cam.name,
              zones: showZones ? cam.zones : [],
              hasMotion: cam.hasMotion,
              fps: cam.fps,
              palette: cam.palette,
              timestamp: Date.now(),
              live: cam.enabled,
              streamUrl: fromApi && cam.enabled ? streamUrl(cam.id) : undefined,
              objects: [],
            }}
          />
        </div>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
              Overlays
            </p>
            <div className="flex items-center justify-between border-b border-obs-line pb-2.5">
              <span className="text-sm text-obs-fg">Zone boundaries</span>
              <Toggle checked={showZones} onChange={setShowZones} label="zones" />
            </div>
          </Card>

          <Card className="p-4 space-y-3 font-mono text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
              Stream
            </p>
            <div className="space-y-2.5 text-obs-fg-dim">
              <div className="flex justify-between">
                <span>Ingest FPS</span>
                <span className="text-obs-fg">{cam.fps.toFixed(1)} FPS</span>
              </div>
              <div className="flex justify-between">
                <span>Inference</span>
                <span className="text-obs-fg">{cam.fps.toFixed(1)} FPS</span>
              </div>
              <div className="flex justify-between">
                <span>Bitrate</span>
                <span className="text-obs-fg">{cam.bitrate}</span>
              </div>
              <div className="flex justify-between">
                <span>Codec</span>
                <span className="text-obs-fg">H.265 / HEVC</span>
              </div>
              <div className="flex justify-between">
                <span>Timecode</span>
                <span className="text-obs-fg">{timeHHMMSS(Date.now())}</span>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
                Recent detections
              </p>
              <Link to={`/review?camera=${cameraId}`} className="text-[11px] text-obs-accent hover:text-obs-accent-strong font-mono">
                View all
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.length === 0 ? (
                <p className="text-xs text-obs-fg-faint">No review segments for this camera yet.</p>
              ) : (
                recent.map((s) => (
                  <Link key={s.id} to={`/review/${s.id}`}>
                    <Badge tone={s.severity === "alert" ? "alert" : "accent"} className="cursor-pointer transition hover:bg-obs-accent/20">
                      {s.label} · {timeHHMMSS(new Date(s.started_at).getTime())}
                    </Badge>
                  </Link>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
