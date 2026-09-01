import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Segmented, Select } from "../components/ui";
import { MockScene } from "../components/VideoTile";
import { I } from "../components/icons";
import type { ExploreHit } from "../lib/api";
import { exploreSummary, searchExplore, useCameras } from "../lib/api";
import { timeAgo } from "../lib/utils";

const searchTypes = [
  { value: "relevance", label: "Best match" },
  { value: "date", label: "Newest first" },
] as const;
type SortType = (typeof searchTypes)[number]["value"];

const PROMPT_SUGGESTIONS = [
  "person near entrance",
  "red vehicle",
  "truck in loading area",
  "car after dark",
];

export default function Explore() {
  const [query, setQuery] = useState("");
  const [camera, setCamera] = useState("all");
  const [label, setLabel] = useState("all");
  const [type, setType] = useState<SortType>("relevance");
  const [selected, setSelected] = useState<ExploreHit | null>(null);
  const [similarFrom, setSimilarFrom] = useState<ExploreHit | null>(null);

  const [results, setResults] = useState<ExploreHit[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [summary, setSummary] = useState<{ label: string; count: number }[]>([]);
  const { cameras } = useCameras();
  const labels = useMemo(
    () => Array.from(new Set(summary.map((s) => s.label))).sort(),
    [summary],
  );

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
      setResults(hits ?? []);
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

  const showLanding = !debouncedQuery && camera === "all" && label === "all" && !similarFrom;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Search"
        subtitle="Natural-language search across recorded footage using on-device visual embeddings"
        badge={
          <Badge tone="accent" dot>
            {fromApi ? "live vector index" : "local embeddings"}
          </Badge>
        }
      />

      <Card className="p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <I.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-obs-fg-faint" />
            <Input
              className="pl-10 h-11 text-sm bg-obs-1"
              placeholder='Try “forklift carrying pallet near bay 2” or “person in dark jacket after midnight”'
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSimilarFrom(null);
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-obs-fg-faint hover:text-obs-fg"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={camera} onChange={(e) => setCamera(e.target.value)} className="w-44 h-11">
              <option value="all">All cameras</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select value={label} onChange={(e) => setLabel(e.target.value)} className="w-40 h-11">
              <option value="all">All labels</option>
              {labels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-obs-fg-faint">
            Suggestions:
          </span>
          {PROMPT_SUGGESTIONS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setQuery(p);
                setSimilarFrom(null);
              }}
              className="rounded-md border border-obs-line bg-obs-1 px-2.5 py-1 text-xs text-obs-fg-dim transition hover:border-obs-accent/40 hover:text-obs-fg cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between border-t border-obs-line pt-3 gap-2">
          <Segmented<SortType>
            value={type}
            onChange={setType}
            options={searchTypes.map((t) => ({ value: t.value, label: t.label }))}
          />
          <span className="font-mono text-[11px] text-obs-fg-faint">
            {fromApi ? "Connected to vector pipeline" : "Vector pipeline unreachable"}
          </span>
        </div>
      </Card>

      {showLanding ? (
        summary.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-mono uppercase tracking-wider text-obs-fg-dim">
              Index by detected class
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {(summary).map(({ label: lbl, count }) => (
                <Card
                  key={lbl}
                  className="cursor-pointer p-4 transition hover:border-obs-accent/40 hover:bg-obs-3 group"
                  onClick={() => setLabel(lbl)}
                >
                  <div className="mb-3 h-16 overflow-hidden rounded-md border border-obs-line relative">
                    <MockScene c1="#1c2833" c2="#141a20" />
                  </div>
                  <p className="text-sm font-medium capitalize text-obs-fg group-hover:text-obs-accent-strong transition-colors">
                    {lbl}
                  </p>
                  <p className="text-[11px] text-obs-fg-faint font-mono mt-0.5">{count} clips</p>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title="Vector index is still building"
            hint="Perception is generating CLIP embeddings for recorded tracks. Once embeddings are indexed, searchable classes will appear here."
          />
        )
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-obs-fg-dim">
              {similarFrom ? (
                <span className="text-obs-accent font-medium">
                  Showing footage visually similar to #{similarFrom.embedding_id} ({similarFrom.label}) ·{" "}
                </span>
              ) : null}
              {results.length} result{results.length === 1 ? "" : "s"}
            </p>
            {similarFrom && (
              <Button size="xs" variant="ghost" onClick={() => setSimilarFrom(null)}>
                Clear pivot
              </Button>
            )}
          </div>

          {results.length === 0 ? (
            <EmptyState
              title="No footage matches your search"
              hint="Try broadening your terms or removing a camera filter."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((r) => {
                const cam = cameras.find((c) => c.id === r.camera);
                return (
                  <Card key={r.embedding_id} className="overflow-hidden group hover:border-obs-line-strong">
                    <button className="block w-full cursor-pointer text-left" onClick={() => setSelected(r)}>
                      <div className="relative h-40 overflow-hidden">
                        {r.thumbnail ? (
                          <img src={r.thumbnail} alt={r.label} className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <>
                            <MockScene
                              c1={cam ? cam.palette[0] : "#1d222a"}
                              c2={cam ? cam.palette[1] : "#161a20"}
                            />
                            <div className="absolute left-[42%] top-[48%] h-[28%] w-[30%] rounded-sm border border-obs-accent" />
                          </>
                        )}

                        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 z-10">
                          <Badge tone="accent">{r.label}</Badge>
                          {r.zone && <Badge tone="slate">{r.zone}</Badge>}
                        </div>

                        {r.similarity != null && (
                          <div className="absolute right-2.5 top-2.5 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] font-medium text-obs-accent-strong border border-obs-accent/30 backdrop-blur-sm z-10">
                            {(r.similarity * 100).toFixed(0)}% match
                          </div>
                        )}

                        <div className="absolute bottom-2 left-2.5 text-xs text-obs-fg drop-shadow z-10">
                          <span className="font-medium">{cam?.name ?? r.camera}</span>
                        </div>
                      </div>
                    </button>

                    <div className="p-3 flex items-center justify-between border-t border-obs-line">
                      <div className="font-mono text-[11px] text-obs-fg-faint">
                        {r.captured_at ? timeAgo(r.captured_at * 1000) : "—"}
                      </div>
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => setSimilarFrom(r)}
                        title="Find visually similar footage"
                      >
                        <I.Crosshair className="h-3 w-3" /> Similar
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Search result">
        {selected && (
          <div className="space-y-4 p-5">
            <div className="relative h-64 overflow-hidden rounded-md border border-obs-line">
              {selected.thumbnail ? (
                <img src={selected.thumbnail} alt={selected.label} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <MockScene
                  c1={cameras.find((c) => c.id === selected.camera)?.palette[0] ?? "#1d222a"}
                  c2={cameras.find((c) => c.id === selected.camera)?.palette[1] ?? "#161a20"}
                />
              )}

              <div className="absolute left-3 top-3 flex items-center gap-2">
                <Badge tone="accent" dot>
                  {selected.label}
                </Badge>
                <Badge tone={selected.zone ? "warn" : "slate"}>
                  {selected.zone ?? "No zone"}
                </Badge>
              </div>

              {selected.captured_at && (
                <div className="absolute bottom-3 left-3 rounded bg-black/55 px-2.5 py-1 font-mono text-xs text-obs-fg-dim backdrop-blur-sm z-10">
                  {new Date(selected.captured_at * 1000).toLocaleString()}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-obs-line pt-3">
              <div className="font-mono text-xs text-obs-fg-dim">
                <span>Camera: <strong className="text-obs-fg">{cameras.find((c) => c.id === selected.camera)?.name ?? selected.camera}</strong></span>
                <span className="mx-2">·</span>
                <span>Similarity: <strong className="text-obs-accent-strong">{selected.similarity != null ? (selected.similarity * 100).toFixed(1) : "—"}%</strong></span>
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
                  Find similar
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
