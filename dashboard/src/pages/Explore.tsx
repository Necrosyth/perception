import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Segmented, Select } from "../components/ui";
import { I } from "../components/icons";
import { cameras, labels, exploreResults } from "../lib/mock";
import type { ExploreHit } from "../lib/api";
import { exploreSummary, searchExplore } from "../lib/api";
import { timeAgo } from "../lib/utils";

const searchTypes = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Date" },
] as const;
type SortType = (typeof searchTypes)[number]["value"];

// Stage 1 mocks mapped onto the same shape the real /api/search returns, so the
// render path below is identical for "API down" fallback and live results.
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
    <div>
      <PageHeader
        title="Explore"
        subtitle="Semantic search across every recorded event — local CLIP encodings, no cloud APIs"
      />

      {/* query + filters */}
      <Card className="p-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <I.Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aina-slate/50" />
            <Input
              className="pl-9"
              placeholder="Try “man in red shirt near loading dock after 10pm”…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSimilarFrom(null);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={camera} onChange={(e) => setCamera(e.target.value)} className="w-36">
              <option value="all">All cameras</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select value={label} onChange={(e) => setLabel(e.target.value)} className="w-32">
              <option value="all">All labels</option>
              {labels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <Segmented<SortType>
            value={type}
            onChange={setType}
            options={searchTypes.map((t) => ({ value: t.value, label: t.label }))}
          />
          <span className="hidden text-[11px] text-aina-slate/60 sm:inline">
            {fromApi
              ? "live: structured filters → pgvector KNN from real footage"
              : "API offline — showing mock results"}
          </span>
        </div>
      </Card>

      {/* no query: label summary grid */}
      {showLanding ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(summary.length ? summary : mockSummary).map(({ label: lbl, count }) => (
            <Card
              key={lbl}
              className="cursor-pointer p-3 transition hover:border-aina-teal/50"
              onClick={() => setLabel(lbl)}
            >
              <div className="mb-2 h-14 rounded" style={{ background: `linear-gradient(135deg, #0d2c46, #0b1f3a)` }} />
              <p className="text-sm font-medium capitalize text-aina-frost">{lbl}</p>
              <p className="text-[11px] text-aina-slate">{count} clip{count === 1 ? "" : "s"}</p>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <p className="mt-4 text-[11px] text-aina-slate">
            {similarFrom ? `Similar to ${similarFrom.label || "selection"} · ` : ""}
            {results.length} ranked result{results.length === 1 ? "" : "s"}
          </p>
          {results.length === 0 ? (
            <div className="mt-6">
              <EmptyState title="Nothing matched those filters" hint="Try a shorter query, or remove a camera/label filter." />
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {results.map((r) => {
                const cam = cameras.find((c) => c.id === r.camera)!;
                return (
                  <Card key={r.embedding_id} className="overflow-hidden">
                    <button className="block w-full cursor-pointer" onClick={() => setSelected(r)}>
                      <div className="relative h-36" style={{ background: r.thumbnail ? "var(--aina-bg,#0b1f3a)" : cx(cam.palette) }}>
                        {r.thumbnail ? (
                          <img src={r.thumbnail} alt={r.label} className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 3px)" }} />
                        )}
                        <div className="absolute left-2 top-2 flex gap-1">
                          <Badge tone="teal">{r.label}</Badge>
                          {r.zone && <Badge tone="slate">{r.zone}</Badge>}
                        </div>
                        {r.similarity != null && (
                          <div className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-aina-frost">
                            {(r.similarity * 100).toFixed(0)}%
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 text-xs font-semibold text-aina-frost">{cam?.name ?? r.camera}</div>
                      </div>
                    </button>
                    <div className="flex items-center justify-between p-2.5">
                      <div className="text-[11px] text-aina-slate">
                        {r.captured_at ? timeAgo(r.captured_at * 1000) : "—"}
                        {r.model !== "mock" && <p className="mt-0.5 max-w-44 truncate text-aina-frost/80">{r.model}</p>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setSimilarFrom(r)} title="Find similar objects">
                        <I.Crosshair className="h-3.5 w-3.5" /> similar
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* detail dialog */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <Card className="w-full max-w-2xl overflow-hidden">
            <div className="relative h-56" style={{ background: selected.thumbnail ? "var(--aina-bg,#0b1f3a)" : cx(cameras.find((c) => c.id === selected.camera)!.palette) }}>
              {selected.thumbnail ? (
                <img src={selected.thumbnail} alt={selected.label} className="absolute inset-0 h-full w-full object-contain" />
              ) : (
                <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 3px)" }} />
              )}
              <div className="absolute left-2 top-2 flex gap-1.5">
                <Badge tone="teal">{selected.label}</Badge>
                <Badge tone={selected.zone ? "amber" : "slate"}>{selected.zone ?? "no zone"}</Badge>
              </div>
              <button className="absolute right-2 top-2 cursor-pointer rounded bg-black/50 px-2 py-1 text-xs text-aina-frost" onClick={() => setSelected(null)}>✕</button>
              {selected.captured_at && (
                <div className="absolute bottom-2 left-2 rounded bg-black/40 px-2 py-0.5 font-mono text-[10px]">
                  {new Date(selected.captured_at * 1000).toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-aina-slate/10 p-3">
              <div className="text-xs text-aina-slate">
                {camName(selected.camera)} · similarity {selected.similarity != null ? (selected.similarity * 100).toFixed(1) : "—"}%
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSimilarFrom(selected)}>Find similar</Button>
                <Button size="sm" onClick={() => setSelected(null)}>Close</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}