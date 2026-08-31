import { useState } from "react";
import { Badge, Button, Card, Input, PageHeader, Select, Toggle } from "../components/ui";
import { I } from "../components/icons";

type SettingsTab = "general" | "perception" | "storage" | "network" | "privacy";

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [saved, setSaved] = useState(false);

  // General state
  const [siteName, setSiteName] = useState("HQ Distribution Facility — Main Hub");
  const [nodeId, setNodeId] = useState("edge-node-alpha-01");
  const [osdWatermark, setOsdWatermark] = useState(true);
  const [audioAlerts, setAudioAlerts] = useState(true);

  // Perception state
  const [detectorModel, setDetectorModel] = useState("yolo26s");
  const [confThreshold, setConfThreshold] = useState(65);
  const [iouThreshold, setIouThreshold] = useState(45);
  const [trackerType, setTrackerType] = useState("bytetrack");
  const [clipEmbeddings, setClipEmbeddings] = useState(true);

  // Storage state
  const [continuousDays, setContinuousDays] = useState(14);
  const [eventDays, setEventDays] = useState(60);
  const [autoEvict, setAutoEvict] = useState(true);

  // Network state
  const [rtspTransport, setRtspTransport] = useState("tcp");
  const [webrtcPort, setWebrtcPort] = useState("1984");

  // Privacy state
  const [privacyMasking, setPrivacyMasking] = useState(false);
  const [anonymizePlates, setAnonymizePlates] = useState(false);
  const [auditLogLevel, setAuditLogLevel] = useState("verbose");

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "general", label: "General", icon: I.Gear },
    { id: "perception", label: "Perception", icon: I.Cpu },
    { id: "storage", label: "Storage", icon: I.Layers },
    { id: "network", label: "Streaming", icon: I.Video },
    { id: "privacy", label: "Security", icon: I.Shield },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Node identity, perception models, retention, and streaming configuration"
        badge={
          <Badge tone="ok" dot>
            persisted
          </Badge>
        }
        actions={
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 font-mono text-xs font-medium text-obs-ok obs-rise">
                <I.Check className="h-4 w-4" /> Changes applied
              </span>
            )}
            <Button variant="solid" size="md" onClick={handleSave}>
              Save
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-md px-3.5 py-2.5 text-[13px] font-medium transition-colors select-none ${
                  active
                    ? "bg-obs-3 text-obs-fg"
                    : "text-obs-fg-dim hover:bg-obs-2 hover:text-obs-fg"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-obs-accent" : "text-obs-fg-faint"}`} />
                <span>{t.label}</span>
              </button>
            );
          })}

          <div className="pt-5">
            <Card className="p-3.5 border-obs-line bg-obs-1">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-obs-fg-faint">
                Config source
              </p>
              <p className="mt-1 font-mono text-xs text-obs-accent-strong truncate">config/aina.yaml</p>
              <p className="mt-1 text-[11px] text-obs-fg-faint leading-relaxed">
                Changes update runtime memory and the persisted YAML configuration.
              </p>
            </Card>
          </div>
        </div>

        <div className="space-y-5">
          {tab === "general" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="font-display text-lg font-medium text-obs-fg">Node identity</h3>
                <p className="text-xs text-obs-fg-dim">Site labeling and dashboard presentation</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm text-obs-fg-dim">Site facility name</label>
                  <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-obs-fg-dim">Edge node identifier</label>
                  <Input value={nodeId} onChange={(e) => setNodeId(e.target.value)} />
                </div>
              </div>

              <div className="border-t border-obs-line pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-obs-fg">OSD watermark</p>
                    <p className="text-xs text-obs-fg-dim">Timestamp, camera label, and FPS on live streams</p>
                  </div>
                  <Toggle checked={osdWatermark} onChange={setOsdWatermark} label="OSD watermark" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-obs-fg">Audio alarm tone</p>
                    <p className="text-xs text-obs-fg-dim">Play a chime on high-severity zone breaches</p>
                  </div>
                  <Toggle checked={audioAlerts} onChange={setAudioAlerts} label="Audio alerts" />
                </div>
              </div>
            </Card>
          )}

          {tab === "perception" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="font-display text-lg font-medium text-obs-fg">Perception engine</h3>
                <p className="text-xs text-obs-fg-dim">Detection model, confidence cutoffs, tracking heuristics</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm text-obs-fg-dim">Object detector</label>
                  <Select value={detectorModel} onChange={(e) => setDetectorModel(e.target.value)}>
                    <option value="yolo26s">YOLO26s · TensorRT engine [Recommended]</option>
                    <option value="rtdetr">RT-DETR-v2 · transformer</option>
                    <option value="yolov9e">YOLOv9-E · extended precision</option>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 rounded-md border border-obs-line bg-obs-1 p-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-obs-fg-dim">Detection confidence</span>
                      <span className="font-mono text-obs-accent-strong font-medium">{confThreshold}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="95"
                      value={confThreshold}
                      onChange={(e) => setConfThreshold(Number(e.target.value))}
                      className="w-full accent-obs-accent cursor-pointer"
                    />
                    <p className="text-[11px] text-obs-fg-faint">Filters low-confidence boxes</p>
                  </div>
                  <div className="space-y-2 rounded-md border border-obs-line bg-obs-1 p-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-obs-fg-dim">NMS IOU overlap</span>
                      <span className="font-mono text-obs-accent-strong font-medium">{iouThreshold}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="80"
                      value={iouThreshold}
                      onChange={(e) => setIouThreshold(Number(e.target.value))}
                      className="w-full accent-obs-accent cursor-pointer"
                    />
                    <p className="text-[11px] text-obs-fg-faint">Suppresses duplicate boxes</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm text-obs-fg-dim">Multi-object tracker</label>
                  <Select value={trackerType} onChange={(e) => setTrackerType(e.target.value)}>
                    <option value="bytetrack">ByteTrack (low-confidence association)</option>
                    <option value="ocsort">OC-SORT (observation-centric)</option>
                    <option value="deepsort">DeepSORT (visual re-ID)</option>
                  </Select>
                </div>

                <div className="flex items-center justify-between border-t border-obs-line pt-4">
                  <div>
                    <p className="text-sm text-obs-fg">Local vector embeddings (CLIP)</p>
                    <p className="text-xs text-obs-fg-dim">Generate visual embeddings for search</p>
                  </div>
                  <Toggle checked={clipEmbeddings} onChange={setClipEmbeddings} label="CLIP embeddings" />
                </div>
              </div>
            </Card>
          )}

          {tab === "storage" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="font-display text-lg font-medium text-obs-fg">Storage & retention</h3>
                <p className="text-xs text-obs-fg-dim">Continuous video rings and clip lifecycles</p>
              </div>

              <div className="rounded-md border border-obs-line bg-obs-1 p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-obs-fg-dim">Local pool (/var/surveillance/media)</span>
                  <span className="font-mono text-obs-fg">184.2 GB / 500 GB (36.8%)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-obs-4">
                  <div className="h-full bg-obs-accent" style={{ width: "36.8%" }} />
                </div>
                <p className="text-[11px] text-obs-fg-faint font-mono">SSD NVMe pool · 315.8 GB free</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm text-obs-fg-dim">Continuous recording (days)</label>
                  <Input type="number" value={continuousDays} onChange={(e) => setContinuousDays(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-obs-fg-dim">Event clips (days)</label>
                  <Input type="number" value={eventDays} onChange={(e) => setEventDays(Number(e.target.value))} />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-obs-line pt-4">
                <div>
                  <p className="text-sm text-obs-fg">Automatic cleanup</p>
                  <p className="text-xs text-obs-fg-dim">Purge oldest footage when disk exceeds 90%</p>
                </div>
                <Toggle checked={autoEvict} onChange={setAutoEvict} label="Auto evict" />
              </div>
            </Card>
          )}

          {tab === "network" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="font-display text-lg font-medium text-obs-fg">Streaming</h3>
                <p className="text-xs text-obs-fg-dim">go2rtc restreaming and WebRTC</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm text-obs-fg-dim">RTSP transport</label>
                  <Select value={rtspTransport} onChange={(e) => setRtspTransport(e.target.value)}>
                    <option value="tcp">TCP (reliable)</option>
                    <option value="udp">UDP (low latency)</option>
                    <option value="http">HTTP tunneling</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-obs-fg-dim">WebRTC port</label>
                  <Input value={webrtcPort} onChange={(e) => setWebrtcPort(e.target.value)} />
                </div>
              </div>

              <div className="rounded-md border border-obs-line bg-obs-1 p-4 font-mono text-xs text-obs-fg-dim space-y-1.5">
                <p className="text-obs-fg-faint uppercase tracking-wider text-[10px]">Restream endpoints</p>
                <p className="text-obs-accent-strong">http://localhost:1984/api/streams</p>
                <p className="text-obs-fg-faint">rtsp://localhost:8554/live/[camera_id]</p>
              </div>
            </Card>
          )}

          {tab === "privacy" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="font-display text-lg font-medium text-obs-fg">Security & privacy</h3>
                <p className="text-xs text-obs-fg-dim">Automated redaction and audit trails</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-obs-fg">Face blurring</p>
                    <p className="text-xs text-obs-fg-dim">Redact faces on non-admin views</p>
                  </div>
                  <Toggle checked={privacyMasking} onChange={setPrivacyMasking} label="Face blurring" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-obs-fg">License plate anonymization</p>
                    <p className="text-xs text-obs-fg-dim">Blur plate regions in recorded clips</p>
                  </div>
                  <Toggle checked={anonymizePlates} onChange={setAnonymizePlates} label="License plates" />
                </div>
                <div className="space-y-1.5 pt-2">
                  <label className="text-sm text-obs-fg-dim">Audit logging</label>
                  <Select value={auditLogLevel} onChange={(e) => setAuditLogLevel(e.target.value)}>
                    <option value="verbose">Verbose (all viewer interactions)</option>
                    <option value="standard">Standard (security events only)</option>
                    <option value="minimal">Minimal (critical only)</option>
                  </Select>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
