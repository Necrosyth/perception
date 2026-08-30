import { useMemo, useState } from "react";
import { PageHeader, Segmented } from "../components/ui";
import { VideoTile } from "../components/VideoTile";
import { streamUrl, useCameras } from "../lib/api";
import { I } from "../components/icons";

type Mode = "live" | "motion" | "grid";

export default function Live() {
  const [mode, setMode] = useState<Mode>("live");
  const [grouped, setGrouped] = useState(false);
  const { cameras, fromApi } = useCameras();

  const visible = useMemo(() => cameras.filter((c) => (mode === "motion" ? c.hasMotion : c.enabled)), [mode, cameras]);
  const streaming = visible.filter((c) => c.enabled).length;

  return (
    <div>
      <PageHeader
        title="Live View"
        subtitle={`${streaming} of ${cameras.length} cameras streaming${fromApi ? "" : " · mock"}`}
        actions={
          <>
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "live", label: "Live" },
                { value: "motion", label: "Motion" },
                { value: "grid", label: "Grid" },
              ]}
            />
            <button
              onClick={() => setGrouped((v) => !v)}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-aina-slate/25 px-3 text-sm text-aina-slate hover:text-aina-teal"
              title="Toggle image grid layout"
            >
              <I.Grid className="h-4 w-4" /> Image grid
            </button>
          </>
        }
      />

      <div className={`grid gap-3 ${grouped ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"}`}>
        {visible.map((c) => (
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
                      { label: "person", box: [42, 34, 9, 22], color: "#2FBFA4" },
                      { label: "forklift", box: [58, 46, 16, 14], color: "#E8A33D" },
                    ]
                  : !fromApi && c.name === "Lobby Entrance"
                    ? [{ label: "person", box: [30, 22, 8, 24], color: "#2FBFA4" }]
                    : undefined,
            }}
          />
        ))}
      </div>

      {mode === "motion" && !visible.length && (
        <p className="mt-8 text-center text-sm text-aina-slate">No camera currently reports motion.</p>
      )}
    </div>
  );
}