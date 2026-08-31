import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Segmented, Select } from "../components/ui";
import { I } from "../components/icons";
import { cameras, labels, exploreResults } from "../lib/mock";
import type { ExploreHit } from "../lib/api";
import { exploreSummary, searchExplore } from "../lib/api";
import { timeAgo } from "../lib/utils";

const searchTypes = [
  { value: "relevance", label: "Relevance Rank" },
  { value: "date", label: "Newest First" },
] as const;
type SortType = (typeof searchTypes)[number]["value"];

function mockHits(): ExploreHit[] {
  return exploreResults.map((r) => ({
    embedding_id: r.id,
    track_id: Number(r.id.split("_")[1]),
    camera: r.cameraId,
    zone: r.zones[0] ?? null,
    label: r.label,
    confidence: r.score,
    captured_at: new Date(r.start).getTime() / 1000,
    similarity: r.score,
    thumbnail: null,
    model: "mock",
  }));
}

function camName(id: string) {
  return cameras.find((c) => c.id === id)?.name ?? id;
}

function cx(c1: [string, string]) {
  return `linear-gradient(135deg, ${c1[0]}, ${c1[1]})`;
}

const PROMPT_SUGGESTIONS = [
  "Forklift near loading dock",
  "Person in red high-vis vest",
  "Unauthorized vehicle at night",
  "Loitering near entrance",
];

export default function Explore() {
  const [query, setQuery] = useState("");
  const [camera, setCamera] = useState("all");
  const [label, setLabel] = useState("all");
  const [type, setType] = useState<SortType>("relevance");
  const [selected, setSelected] = useState<ExploreHit | null>(null);
  const [similarFrom, setSimilarFrom] = useState<ExploreHit | null>(null);

  const [results, setResults] = useState<ExploreHit[]>(mockHits());
  const [fromApi, setFromApi] = useState(false);
  const [summary, setSummary] = useState<{ label: string; count: number }[]>([]);

  const debouncedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const hits = await searchExplore({
        q: debouncedQuery,
        camera,
        label,
        similar: similarFrom?.embedding_id,
        sort: type,
        limit: 24,
      });
      if (cancelled) return;
      setResults(hits ?? mockHits());
      setFromApi(hits !== null);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, camera, label, type, similarFrom?.embedding_id, similarFrom]);

  useEffect(() => {
    let cancelled = false;
    exploreSummary().then((s) => {
      if (cancelled) return;
      if (s && s.length) setSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const mockSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of exploreResults) counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
    return [...counts.entries()].map(([l, c]) => ({ label: l, count: c }));
  }, []);

  const showLanding = !debouncedQuery && camera === "all" && label === "all" && !similarFrom;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Semantic Vector Explore"
        subtitle="Natural language multi-camera search powered by local Jina-CLIP visual embeddings & pgvector KNN"
        badge={
          <Badge tone="cyan" dot={true}>
            {fromApi ? "LIVE PGVECTOR KNN" : "LOCAL CLIP EMBEDDINGS"}
          </Badge>
        }
      />

      {/* Futuristic AI Search Command Bar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <I.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              className="pl-10 h-11 text-sm bg-[#060b13]/90 border-slate-700/80 focus:border-[#2fbfa4]"
              placeholder="Search visual memory: “forklift carrying pallet near bay 2”, “person in dark jacket after midnight”..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSimilarFrom(null);
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 hover:text-white"
              >
                CLEAR ✕
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={camera} onChange={(e) => setCamera(e.target.value)} className="w-40 h-11">
              <option value="all">All 6 Cameras</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select value={label} onChange={(e) => setLabel(e.target.value)} className="w-36 h-11">
              <option value="all">All Labels</option>
              {labels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Prompt suggestions pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
            Suggested Prompts:
          </span>
          {PROMPT_SUGGESTIONS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setQuery(p);
                setSimilarFrom(null);
              }}
              className="rounded-lg border border-slate-800 bg-[#07111e] px-2.5 py-1 text-xs text-slate-400 transition hover:border-[#2fbfa4]/40 hover:text-[#38efcb] cursor-pointer"
            >
              + {p}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between border-t border-slate-800/80 pt-3 gap-2">
          <Segmented<SortType>
            value={type}
            onChange={setType}
            options={searchTypes.map((t) => ({ value: t.value, label: t.label }))}
          />
          <span className="font-mono text-[11px] text-slate-500">
            {fromApi ? "Connected to Vector Pipeline (512-dim)" : "Simulated Local Embedding Vectors"}
          </span>
        </div>
      </Card>

      {/* Default Category Grid */}
      {showLanding ? (
        <div className="space-y-3">
          <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Index Catalog by Detected Class
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(summary.length ? summary : mockSummary).map(({ label: lbl, count }) => (
              <Card
                key={lbl}
                className="cursor-pointer p-4 transition hover:border-[#2fbfa4]/60 hover:shadow-lg hover:shadow-[#2fbfa4]/10 group"
                onClick={() => setLabel(lbl)}
              >
                <div
                  className="mb-3 h-16 rounded-lg relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, #102a45, #081220)` }}
                >
                  <div className="absolute inset-0 hud-scanlines opacity-20" />
                  <div className="absolute bottom-1.5 right-2 font-mono text-[10px] text-[#2fbfa4] font-bold">
                    {count} CLIPS
                  </div>
                </div>
                <p className="text-sm font-bold capitalize text-white group-hover:text-[#38efcb] transition-colors">
                  {lbl}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">Filter by class →</p>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-slate-400">
              {similarFrom ? (
                <span className="text-[#2fbfa4] font-bold">
                  Finding visual vectors similar to #{similarFrom.embedding_id} ({similarFrom.label}) ·{" "}
                </span>
              ) : null}
              {results.length} Ranked visual vector match{results.length === 1 ? "" : "es"}
            </p>
            {similarFrom && (
              <Button size="xs" variant="ghost" onClick={() => setSimilarFrom(null)}>
                Clear Similarity Pivot ✕
              </Button>
            )}
          </div>

          {results.length === 0 ? (
            <EmptyState
              title="No surveillance clips match your semantic query"
              hint="Try broadening search terms or removing specific camera constraints."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((r) => {
                const cam = cameras.find((c) => c.id === r.camera);
                return (
                  <Card key={r.embedding_id} className="overflow-hidden group hover:border-[#2fbfa4]/50">
                    <button className="block w-full cursor-pointer text-left" onClick={() => setSelected(r)}>
                      <div
                        className="relative h-40 overflow-hidden"
                        style={{
                          background: r.thumbnail
                            ? "#07111e"
                            : cx(cam ? cam.palette : ["#0d2c46", "#0b1f3a"]),
                        }}
                      >
                        {r.thumbnail ? (
                          <img src={r.thumbnail} alt={r.label} className="h-full w-full object-cover" />
                        ) : (
                          <>
                            <div className="absolute inset-0 hud-scanlines opacity-30" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/60" />
                          </>
                        )}

                        {/* Badges */}
                        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 z-10">
                          <Badge tone="teal">{r.label}</Badge>
                          {r.zone && <Badge tone="slate">{r.zone}</Badge>}
                        </div>

                        {r.similarity != null && (
                          <div className="absolute right-2.5 top-2.5 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] font-bold text-[#38efcb] border border-[#2fbfa4]/30 backdrop-blur-sm z-10">
                            {(r.similarity * 100).toFixed(0)}% MATCH
                          </div>
                        )}

                        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-xs text-white drop-shadow z-10">
                          <span className="font-semibold">{cam?.name ?? r.camera}</span>
                        </div>
                      </div>
                    </button>

                    <div className="p-3 flex items-center justify-between border-t border-slate-800/80">
                      <div className="font-mono text-[11px] text-slate-400">
                        {r.captured_at ? timeAgo(r.captured_at * 1000) : "—"}
                      </div>
                      <Button
                        size="xs"
                        variant="glow"
                        onClick={() => setSimilarFrom(r)}
                        title="Search for identical visual vectors"
                      >
                        <I.Crosshair className="h-3 w-3" /> Find Similar
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* High-Precision Semantic Detail Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Visual Vector Match Details">
        {selected && (
          <div className="space-y-4 p-5">
            <div
              className="relative h-64 overflow-hidden rounded-xl border border-slate-800"
              style={{
                background: selected.thumbnail
                  ? "#07111e"
                  : cx(cameras.find((c) => c.id === selected.camera)?.palette ?? ["#0d2c46", "#0b1f3a"]),
              }}
            >
              <div className="absolute inset-0 hud-scanlines opacity-25" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50" />

              <div className="absolute left-3 top-3 flex items-center gap-2">
                <Badge tone="teal" dot={true}>
                  {selected.label}
                </Badge>
                <Badge tone={selected.zone ? "amber" : "slate"}>
                  {selected.zone ?? "No Zone Assigned"}
                </Badge>
              </div>

              {selected.captured_at && (
                <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2.5 py-1 font-mono text-xs text-slate-300 backdrop-blur-md border border-white/5">
                  CAPTURED: {new Date(selected.captured_at * 1000).toLocaleString()}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
              <div className="font-mono text-xs text-slate-400">
                <span>Camera: <strong className="text-white">{camName(selected.camera)}</strong></span>
                <span className="mx-2">·</span>
                <span>Cosine Distance: <strong className="text-[#2fbfa4]">{selected.similarity != null ? (selected.similarity * 100).toFixed(1) : "—"}%</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSimilarFrom(selected);
                    setSelected(null);
                  }}
                >
                  Cascade Similar Vectors
                </Button>
                <Button size="sm" variant="solid" onClick={() => setSelected(null)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}