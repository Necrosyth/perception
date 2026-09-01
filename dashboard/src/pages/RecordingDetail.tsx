import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card } from "../components/ui";
import { I } from "../components/icons";
import { getSegment, getSegmentPlay, type Segment, useCameras } from "../lib/api";
import { duration, timeHHMM, timeHHMMSS } from "../lib/utils";
import { EmptyState } from "../components/ui";

export default function RecordingDetail() {
  const { segmentId = "" } = useParams();
  const { cameras } = useCameras();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [seg, setSeg] = useState<Segment | null>(null);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [liveUrl, setLiveUrl] = useState<string>("");
  const [clipIndex, setClipIndex] = useState(0);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setClipIndex(0);
    const load = async () => {
      if (!segmentId) return;
      const s = await getSegment(segmentId);
      if (!s) {
        setMissing(true);
        return;
      }
      setSeg(s);
      const play = await getSegmentPlay(segmentId);
      if (play?.live_url) setLiveUrl(play.live_url);
      if (play?.recordings?.length) setRecordings(play.recordings);
    };
    load();
  }, [segmentId]);

  const cam = useMemo(() => cameras.find((c) => c.id === seg?.camera), [cameras, seg]);
  const start = seg ? new Date(seg.started_at).getTime() : 0;
  const end = seg ? new Date(seg.ended_at).getTime() : 0;
  const [playing, setPlaying] = useState(false);
  const [exported, setExported] = useState(false);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const seekBy = (deltaSec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + deltaSec));
  };

  const jumpTo = (fraction: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = (v.duration || 0) * Math.max(0, Math.min(1, fraction));
  };

  const activeSrc = recordings.length ? recordings[Math.min(clipIndex, recordings.length - 1)] : liveUrl;

  if (missing || !seg) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-mono text-obs-fg-faint">
          <Link to="/review" className="text-obs-fg-dim hover:text-obs-fg transition-colors flex items-center gap-1">
            <I.History className="h-3 w-3" /> Events
          </Link>
          <span>/</span>
          <span className="text-obs-fg">Segment not found</span>
        </div>
        <EmptyState title="Recording segment unavailable" hint="This review segment may have been pruned." />
      </div>
    );
  }

  const handleExport = () => {
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs font-mono text-obs-fg-faint">
        <Link to="/review" className="text-obs-fg-dim hover:text-obs-fg transition-colors flex items-center gap-1">
          <I.History className="h-3 w-3" /> Events
        </Link>
        <span>/</span>
        <span className="text-obs-fg">{seg.label} · {cam?.name ?? seg.camera}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-lg border border-obs-line bg-obs-2">
            <div className="aspect-video relative overflow-hidden bg-black">
              {activeSrc ? (
                <video
                  ref={videoRef}
                  key={activeSrc}
                  className="absolute inset-0 h-full w-full object-cover"
                  src={activeSrc}
                  autoPlay
                  muted
                  playsInline
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
              ) : (
                <EmptyState title="No recording yet" hint="Recording is continuous; a clip will be available shortly." />
              )}

              <div className="absolute left-4 top-4 flex items-center gap-2 z-10">
                <Badge tone={seg.severity === "alert" ? "alert" : "ok"} dot>
                  {seg.severity}
                </Badge>
                <Badge tone="neutral">{seg.camera}</Badge>
              </div>

              <div className="absolute right-4 top-4 rounded bg-black/55 px-2.5 py-1 font-mono text-xs text-obs-fg-dim backdrop-blur-sm z-10">
                {recordings.length > 0 ? "recorded clip" : liveUrl ? "live" : "—"}
              </div>

              <div className="absolute bottom-4 left-4 rounded bg-black/55 px-3 py-1 font-mono text-xs text-obs-fg-dim backdrop-blur-sm z-10">
                START: {timeHHMMSS(start)} &mdash; END: {timeHHMMSS(end)}
              </div>
            </div>
          </div>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-obs-fg-dim">
              <span className="text-obs-fg">{timeHHMM(start)}</span>
              <span className="text-obs-fg">{timeHHMM(end)}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={togglePlay}
                  disabled={!activeSrc}
                >
                  {playing ? <I.Pause className="h-4 w-4" /> : <I.Play className="h-4 w-4" />}
                  {playing ? "Pause" : "Play"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => jumpTo(0)} title="Jump to start" disabled={!activeSrc}>
                  Start
                </Button>
                <Button size="sm" variant="outline" onClick={() => seekBy(-5)} disabled={!activeSrc}>
                  -5s
                </Button>
                <Button size="sm" variant="outline" onClick={() => seekBy(5)} disabled={!activeSrc}>
                  +5s
                </Button>
                <Button size="sm" variant="outline" onClick={() => jumpTo(1)} title="Jump to end" disabled={!activeSrc}>
                  End
                </Button>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <span className="rounded-md border border-obs-line bg-obs-2 px-3 py-1.5 text-obs-fg-dim">
              Camera: <span className="text-obs-accent-strong font-medium">{cam?.name ?? seg.camera}</span>
            </span>
            <span className="rounded-md border border-obs-line bg-obs-2 px-3 py-1.5 text-obs-fg-dim">
              Duration: <span className="text-obs-accent-strong font-medium">{duration((end - start) / 1000)}</span>
            </span>
            <span className="rounded-md border border-obs-line bg-obs-2 px-3 py-1.5 text-obs-fg-dim">
              Severity: <span className="text-obs-accent-strong font-medium capitalize">{seg.severity}</span>
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
              Recorded clips
            </p>
            <div className="space-y-2">
              {recordings.length ? (
                recordings.map((r, i) => (
                  <button
                    key={r}
                    onClick={() => setClipIndex(i)}
                    className={`flex w-full items-center justify-between rounded-md border p-2.5 font-mono text-[11px] transition-colors select-none ${
                      i === clipIndex
                        ? "border-obs-accent/40 bg-obs-accent/10 text-obs-fg"
                        : "border-obs-line bg-obs-1 text-obs-fg-dim hover:border-obs-accent/40"
                    }`}
                  >
                    <span>clip {i + 1}</span>
                    <span className="text-obs-accent">{i === clipIndex ? "now playing" : "load"}</span>
                  </button>
                ))
              ) : (
                <p className="text-[11px] text-obs-fg-faint">No clips found yet.</p>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-2.5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
              Actions
            </p>
            <Button variant="solid" size="sm" className="w-full" onClick={handleExport}>
              <I.Download className="h-4 w-4" />
              {exported ? "Export started" : "Record highlight"}
            </Button>
            <Link to={`/explore`} className="block">
              <Button variant="outline" size="sm" className="w-full">
                <I.Search className="h-4 w-4" /> Find similar
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}