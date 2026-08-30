import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Segmented, Select } from "../components/ui";
import { I } from "../components/icons";
import { cameras, exploreResults, labels } from "../lib/mock";
import { timeAgo } from "../lib/utils";

const searchTypes = [
  { value: "relevance", label: "Relevance" },
  { value: "thumbnail", label: "Thumbnail" },
  { value: "description", label: "Description" },
] as const;
type SearchType = (typeof searchTypes)[number]["value"] | "date";

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
  const [type, setType] = useState<SearchType>("relevance");
  const [selected, setSelected] = useState<string | null>(null);
  const [similarFrom, setSimilarFrom] = useState<string | null>(null);

  const summary = useMemo(() => {
    const counts = new Map<string, { n: number; seed: number }>();
    for (const r of exploreResults) {
      const c = counts.get(r.label) ?? { n: 0, seed: r.thumbSeed };
      c.n += 1;
      counts.set(r.label, c);
    }
    return [...counts.entries()];
  }, []);

  const results = useMemo(() => {
    let list = exploreResults;
    if (camera !== "all") list = list.filter((r) => r.cameraId === camera);
    if (label !== "all") list = list.filter((r) => r.label === label);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = [r.label, r.caption ?? "", r.zones.join(" "), camName(r.cameraId)].join(" ").toLowerCase();
        return q.split(/\s+/).every((tok) => hay.includes(tok));
      });
    }
    if (similarFrom) {
      const src = exploreResults.find((r) => r.id === similarFrom);
      if (src) {
        list = list
          .map((r) => ({ r, d: Math.abs(r.thumbSeed - src.thumbSeed) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 8)
          .map((x) => x.r);
      }
    }
    if (type === "relevance") list = [...list].sort((a, b) => b.score - a.score);
    if (type === "date") list = [...list].sort((a, b) => a.start - b.start);
    return list;
  }, [query, camera, label, type, similarFrom]);

  const selectedRes = exploreResults.find((r) => r.id === selected);

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
              placeholder="Try “man in red shirt near loading dock” or “truck at dock bay”…"
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
            <label className="flex items-center gap-1.5 text-xs text-aina-slate">
              <input type="checkbox" className="accent-aina-teal" defaultChecked /> has snapshot
            </label>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <Segmented<SearchType> value={type} onChange={setType} options={[...searchTypes, { value: "date", label: "Date" }]} />
          <span className="hidden text-[11px] text-aina-slate/60 sm:inline">
            semantic: LLM parses query → structured filters → pgvector KNN in the narrowed set
          </span>
        </div>
      </Card>

      {/* no query: default summary */}
      {!query.trim() && camera === "all" && label === "all" && !similarFrom ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {summary.map(([lbl, c]) => (
            <Card
              key={lbl}
              className="cursor-pointer p-3 transition hover:border-aina-teal/50"
              onClick={() => setLabel(lbl)}
            >
              <div className="mb-2 h-14 rounded" style={{ background: `linear-gradient(135deg, #0d2c46, #0b1f3a)` }} />
              <p className="text-sm font-medium capitalize text-aina-frost">{lbl}</p>
              <p className="text-[11px] text-aina-slate">{c.n} events</p>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <p className="mt-4 text-[11px] text-aina-slate">
            {similarFrom ? `Similar to ${exploreResults.find((r) => r.id === similarFrom)?.label} · ` : ""}
            {results.length} ranked result{results.length === 1 ? "" : "s"}
          </p>
          {results.length === 0 ? (
            <div className="mt-6">
              <EmptyState title="Nothing matched those filters" hint="Try a shorter query, or remove a camera/label filter." />
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {results.map((r) => {
                const cam = cameras.find((c) => c.id === r.cameraId)!;
                return (
                  <Card key={r.id} className="overflow-hidden">
                    <button className="block w-full cursor-pointer" onClick={() => setSelected(r.id)}>
                      <div className="relative h-36" style={{ background: cx(cam.palette) }}>
                        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 3px)" }} />
                        <div className="absolute left-2 top-2 flex gap-1">
                          <Badge tone="teal">{r.label}</Badge>
                          {r.zones[0] && <Badge tone="slate">{r.zones[0]}</Badge>}
                        </div>
                        <div className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-aina-frost">
                          {(r.score * 100).toFixed(0)}%
                        </div>
                        <div className="absolute bottom-2 left-2 text-xs font-semibold text-aina-frost">{cam.name}</div>
                      </div>
                    </button>
                    <div className="flex items-center justify-between p-2.5">
                      <div className="text-[11px] text-aina-slate">
                        {timeAgo(r.start)}
                        {r.caption && <p className="mt-0.5 max-w-44 truncate text-aina-frost/80">{r.caption}</p>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setSimilarFrom(r.id)} title="Find similar objects">
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
      {selectedRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <Card className="w-full max-w-2xl overflow-hidden" >
            <div className="relative h-56" style={{ background: cx(cameras.find((c) => c.id === selectedRes.cameraId)!.palette) }}>
              <div className="absolute left-2 top-2 flex gap-1.5">
                <Badge tone="teal">{selectedRes.label}</Badge>
                <Badge tone={selectedRes.zones.length ? "amber" : "slate"}>{selectedRes.zones.length ? selectedRes.zones.join(", ") : "no zone"}</Badge>
              </div>
              <button className="absolute right-2 top-2 cursor-pointer rounded bg-black/50 px-2 py-1 text-xs text-aina-frost" onClick={() => setSelected(null)}>✕</button>
              <div className="absolute bottom-2 left-2 rounded bg-black/40 px-2 py-0.5 font-mono text-[10px]">
                {new Date(selectedRes.start).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-aina-slate/10 p-3">
              <div className="text-xs text-aina-slate">
                {camName(selectedRes.cameraId)} · similarity {(selectedRes.score * 100).toFixed(1)}%
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSimilarFrom(selectedRes.id)}>Find similar</Button>
                <Button size="sm" onClick={() => setSelected(null)}>View event</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}