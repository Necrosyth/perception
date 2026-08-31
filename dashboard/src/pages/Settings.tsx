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
  const [themeAccent, setThemeAccent] = useState("teal");

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

  // Network & RTSP state
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
    { id: "general", label: "General & Node", icon: I.Gear },
    { id: "perception", label: "Perception & AI", icon: I.Cpu },
    { id: "storage", label: "Storage & Retention", icon: I.Layers },
    { id: "network", label: "Stream & go2rtc", icon: I.Video },
    { id: "privacy", label: "Security & Privacy", icon: I.Shield },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & Configuration"
        subtitle="Manage surveillance node identity, edge perception models, retention cycles, and network restreaming"
        badge={
          <Badge tone="teal" dot={true}>
            PERSISTED TO AINA.YAML
          </Badge>
        }
        actions={
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[#2fbfa4] animate-in fade-in">
                <I.Check className="h-4 w-4" /> Changes Applied
              </span>
            )}
            <Button variant="solid" size="md" onClick={handleSave}>
              Save Configuration
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Navigation Tabs */}
        <div className="space-y-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-semibold transition-all select-none ${
                  active
                    ? "bg-gradient-to-r from-[#2fbfa4]/20 to-[#2fbfa4]/5 text-[#38efcb] border border-[#2fbfa4]/30 shadow-md shadow-black/40"
                    : "text-slate-400 hover:bg-[#0c1829] hover:text-slate-200 border border-transparent"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-[#2fbfa4]" : "text-slate-500"}`} />
                <span>{t.label}</span>
              </button>
            );
          })}

          <div className="pt-4">
            <Card className="p-3.5 border-slate-800/80 bg-[#07111e]/90">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Active Config Source
              </p>
              <p className="mt-1 font-mono text-xs text-[#2fbfa4] truncate">config/aina.yaml</p>
              <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                Settings update both runtime memory and persisted YAML configuration.
              </p>
            </Card>
          </div>
        </div>

        {/* Tab Content Panels */}
        <div className="space-y-5">
          {/* General Tab */}
          {tab === "general" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-white font-display">General Node Identity</h3>
                <p className="text-xs text-slate-400">Configure site labeling and dashboard presentation</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Site Facility Name</label>
                  <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Edge Node Identifier</label>
                  <Input value={nodeId} onChange={(e) => setNodeId(e.target.value)} />
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-200">OSD Telemetry Watermark</p>
                    <p className="text-xs text-slate-400">Display timestamp, camera label, and FPS on live streams</p>
                  </div>
                  <Toggle checked={osdWatermark} onChange={setOsdWatermark} label="OSD watermark" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Audio Alarm Tone</p>
                    <p className="text-xs text-slate-400">Play chime on high severity zone breaches</p>
                  </div>
                  <Toggle checked={audioAlerts} onChange={setAudioAlerts} label="Audio alerts" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Theme Visual Accent</p>
                    <p className="text-xs text-slate-400">Custom dashboard color highlight</p>
                  </div>
                  <Select value={themeAccent} onChange={(e) => setThemeAccent(e.target.value)} className="w-40">
                    <option value="teal">Cyber Teal (Default)</option>
                    <option value="cyan">Neon Cyan</option>
                    <option value="amber">Tactical Amber</option>
                    <option value="emerald">Obsidian Emerald</option>
                  </Select>
                </div>
              </div>
            </Card>
          )}

          {/* Perception Tab */}
          {tab === "perception" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-white font-display">Perception & AI Inference Engine</h3>
                <p className="text-xs text-slate-400">Select detector models, adjust confidence cutoffs, and tracking heuristics</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Object Detector Architecture</label>
                  <Select value={detectorModel} onChange={(e) => setDetectorModel(e.target.value)}>
                    <option value="yolo26s">YOLO26s · TensorRT Engine (sm_89 optimized) [Recommended]</option>
                    <option value="rtdetr">RT-DETR-v2 · High Accuracy Transformer</option>
                    <option value="yolov9e">YOLOv9-E · Extended Precision</option>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 rounded-xl border border-slate-800 bg-[#07111e] p-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">Detection Confidence</span>
                      <span className="font-mono text-[#2fbfa4] font-bold">{confThreshold}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="95"
                      value={confThreshold}
                      onChange={(e) => setConfThreshold(Number(e.target.value))}
                      className="w-full accent-[#2fbfa4] cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-500">Filters false positive bounding boxes</p>
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-800 bg-[#07111e] p-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">NMS IOU Overlap</span>
                      <span className="font-mono text-[#2fbfa4] font-bold">{iouThreshold}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="80"
                      value={iouThreshold}
                      onChange={(e) => setIouThreshold(Number(e.target.value))}
                      className="w-full accent-[#2fbfa4] cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-500">Suppresses duplicate boxes around same subject</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Multi-Object Tracker Algorithm</label>
                  <Select value={trackerType} onChange={(e) => setTrackerType(e.target.value)}>
                    <option value="bytetrack">ByteTrack (Low-confidence association, 12-frame buffer)</option>
                    <option value="ocsort">OC-SORT (Observation-Centric Sort)</option>
                    <option value="deepsort">DeepSORT (Visual Re-ID Embeddings)</option>
                  </Select>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/80 pt-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Local Vector Embeddings (CLIP)</p>
                    <p className="text-xs text-slate-400">Generate INT8 Jina-CLIP visual embeddings for natural language search</p>
                  </div>
                  <Toggle checked={clipEmbeddings} onChange={setClipEmbeddings} label="CLIP embeddings" />
                </div>
              </div>
            </Card>
          )}

          {/* Storage Tab */}
          {tab === "storage" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-white font-display">Storage & Retention Rules</h3>
                <p className="text-xs text-slate-400">Manage continuous video rings and anomaly clip lifecycles</p>
              </div>

              {/* Quota Progress Bar */}
              <div className="rounded-xl border border-slate-800 bg-[#07111e] p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">Local Disk Pool (/var/surveillance/media)</span>
                  <span className="font-mono text-slate-300">184.2 GB / 500 GB (36.8%)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full bg-gradient-to-r from-[#2fbfa4] to-[#00e5ff]" style={{ width: "36.8%" }} />
                </div>
                <p className="text-[10px] text-slate-500 font-mono">SSD NVMe Pool · 315.8 GB Available Free Space</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">24/7 Continuous Recording (Days)</label>
                  <Input
                    type="number"
                    value={continuousDays}
                    onChange={(e) => setContinuousDays(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Event Clips & Review Segments (Days)</label>
                  <Input
                    type="number"
                    value={eventDays}
                    onChange={(e) => setEventDays(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/80 pt-4">
                <div>
                  <p className="text-sm font-medium text-slate-200">Automatic FIFO Disk Cleanup</p>
                  <p className="text-xs text-slate-400">Purge oldest non-starred footage when disk usage exceeds 90%</p>
                </div>
                <Toggle checked={autoEvict} onChange={setAutoEvict} label="Auto evict" />
              </div>
            </Card>
          )}

          {/* Network & go2rtc Tab */}
          {tab === "network" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-white font-display">go2rtc Mesh & RTSP Stream Ingest</h3>
                <p className="text-xs text-slate-400">Stream restreaming, WebRTC latency reduction, and codec proxying</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">RTSP Transport Protocol</label>
                  <Select value={rtspTransport} onChange={(e) => setRtspTransport(e.target.value)}>
                    <option value="tcp">TCP (Reliable, avoids packet drops)</option>
                    <option value="udp">UDP (Ultra low latency)</option>
                    <option value="http">HTTP Tunneling</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">go2rtc WebRTC Port</label>
                  <Input value={webrtcPort} onChange={(e) => setWebrtcPort(e.target.value)} />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#07111e] p-4 font-mono text-xs text-slate-300 space-y-1.5">
                <p className="text-slate-500 uppercase tracking-wider text-[10px]">Restream Endpoints</p>
                <p className="text-[#2fbfa4]">http://localhost:1984/api/streams</p>
                <p className="text-slate-400">rtsp://localhost:8554/live/[camera_id]</p>
              </div>
            </Card>
          )}

          {/* Privacy & Security Tab */}
          {tab === "privacy" && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-white font-display">Security & Privacy Compliance</h3>
                <p className="text-xs text-slate-400">GDPR automated blurring and operator permission audit trails</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Face Blurring Mask</p>
                    <p className="text-xs text-slate-400">Automatically redact detected facial features on non-admin views</p>
                  </div>
                  <Toggle checked={privacyMasking} onChange={setPrivacyMasking} label="Face blurring" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-200">License Plate Anonymization</p>
                    <p className="text-xs text-slate-400">Apply Gaussian blur over ANPR plate regions</p>
                  </div>
                  <Toggle checked={anonymizePlates} onChange={setAnonymizePlates} label="License plates" />
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-medium text-slate-300">Audit Logging Verbosity</label>
                  <Select value={auditLogLevel} onChange={(e) => setAuditLogLevel(e.target.value)}>
                    <option value="verbose">Verbose (Log all viewer interactions and clip exports)</option>
                    <option value="standard">Standard (Security events only)</option>
                    <option value="minimal">Minimal (System critical only)</option>
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
