import { useMemo, useState } from "react";
import { Badge, Button, Input, PageHeader, Segmented } from "../components/ui";
import { VideoTile } from "../components/VideoTile";
import { streamUrl, useCameras } from "../lib/api";
import { I } from "../components/icons";

type Mode = "all" | "motion" | "alerts";
type GridCols = "2" | "3" | "4";

export default function Live() {
  const [mode, setMode] = useState<Mode>("all");
  const [gridCols, setGridCols] = useState<GridCols>("3");
  const [filterQuery, setFilterQuery] = useState("");
  const { cameras, fromApi } = useCameras();

  const filtered = useMemo(() => {
    return cameras.filter((c) => {
      if (mode === "motion" && !c.hasMotion) return false;
      if (mode === "alerts" && !c.hasMotion) return false;
      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchZone = c.zones.some((z) => z.toLowerCase().includes(q));
        if (!matchName && !matchZone) return false;
      }
      return true;
    });
  }, [mode, cameras, filterQuery]);

  const activeCount = cameras.filter((c) => c.enabled).length;
  const motionCount = cameras.filter((c) => c.hasMotion).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Live View"
        subtitle={`${activeCount} camera feeds across the facility${fromApi ? " · go2rtc live pipeline" : ""}`}
        badge={
          <Badge tone={motionCount > 0 ? "warn" : "ok"} dot>
            {motionCount > 0 ? `${motionCount} with motion` : "All clear"}
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-44 sm:w-56">
              <I.Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-obs-fg-faint" />
              <Input
                placeholder="Filter cameras..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "all", label: "All" },
                { value: "motion", label: `Motion (${motionCount})` },
                { value: "alerts", label: "Priority" },
              ]}
            />

            <div className="hidden sm:flex items-center gap-1 border-l border-obs-line pl-2">
              {(["2", "3", "4"] as GridCols[]).map((cols) => (
                <Button
                  key={cols}
                  variant={gridCols === cols ? "subtle" : "ghost"}
                  size="xs"
                  onClick={() => setGridCols(cols)}
                  className="px-2"
                  title={`${cols} columns`}
                >
                  {cols}x
                </Button>
              ))}
            </div>
          </div>
        }
      />

      <div
        className={`grid gap-4 transition-all duration-300 ${
          gridCols === "2"
            ? "sm:grid-cols-2"
            : gridCols === "4"
              ? "sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
              : "sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {filtered.map((c) => (
          <VideoTile
            key={c.id}
            aspect="aspect-video"
            meta={{
              id: c.id,
              name: c.name,
              zones: c.zones,
              hasMotion: c.hasMotion,
              fps: c.fps,
              palette: c.palette,
              timestamp: c.lastActivity,
              live: c.enabled,
              streamUrl: fromApi && c.enabled ? streamUrl(c.id) : undefined,
              objects:
                !fromApi && c.hasMotion && c.name === "Warehouse — East"
                  ? [
                      { label: "person", box: [42, 34, 9, 22], color: "#C2A878", score: 0.94 },
                      { label: "forklift", box: [58, 46, 16, 14], color: "#D3A05F", score: 0.88 },
                    ]
                  : !fromApi && c.name === "Lobby Entrance"
                    ? [{ label: "person", box: [30, 22, 8, 24], color: "#C2A878", score: 0.96 }]
                    : undefined,
            }}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-obs-line bg-obs-2 p-12 text-center">
          <I.VideoOff className="h-10 w-10 text-obs-fg-faint" />
          <p className="mt-3 text-sm font-semibold text-obs-fg-dim">No cameras match the filter</p>
          <p className="mt-1 text-xs text-obs-fg-faint">Try clearing your search or switching to "All".</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setMode("all");
              setFilterQuery("");
            }}
          >
            Reset Filters
          </Button>
        </div>
      )}
    </div>
  );
}
