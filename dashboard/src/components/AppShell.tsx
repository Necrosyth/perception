import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";
import { I } from "./icons";
import { Badge } from "./ui";
import { useCameras, getSystem, type SystemSummary } from "../lib/api";

const nav = [
  { to: "/", label: "Live View", icon: I.Grid, end: true },
  { to: "/birdseye", label: "Bird's Eye", icon: I.Crosshair },
  { to: "/review", label: "Events", icon: I.History },
  { to: "/explore", label: "Search", icon: I.Search },
  { to: "/zones", label: "Zones", icon: I.Zone },
  { to: "/system", label: "System", icon: I.Gauge },
  { to: "/notifications", label: "Alerts", icon: I.Bell },
  { to: "/settings", label: "Settings", icon: I.Gear },
];

export function AppShell() {
  const [time, setTime] = useState(new Date());
  const location = useLocation();
  const { cameras } = useCameras();
  const [sys, setSys] = useState<SystemSummary | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const s = await getSystem();
      if (alive) setSys(s);
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const online = cameras.filter((c) => c.enabled).length;
  const perceptionOk = sys?.perception_rpc ?? false;
  const threatLevel: "NOMINAL" | "ELEVATED" | "CRITICAL" =
    !perceptionOk ? "ELEVATED" : "NOMINAL";

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full min-h-screen bg-obs-0 text-obs-fg font-sans antialiased">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-obs-line bg-obs-1">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-6 border-b border-obs-line">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-obs-line-strong bg-obs-3">
            <img src="/hypotenuse-logo.png" alt="Hypotenuse" className="h-full w-full object-contain p-1" />
          </div>
          <div className="leading-tight overflow-hidden">
            <Link to="/" className="group block">
              <h2 className="font-display text-[15px] font-medium tracking-tight text-obs-fg">
                Observatory
              </h2>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-obs-fg-faint mt-0.5">
                Hypotenuse Sec-Ops
              </p>
            </Link>
          </div>
        </div>

        {/* Quick search */}
        <div className="px-3 pt-4 pb-1">
          <Link
            to="/explore"
            className="flex items-center gap-2.5 rounded-md border border-obs-line bg-obs-1 px-3 py-2 text-xs text-obs-fg-dim transition hover:border-obs-line-strong hover:text-obs-fg"
          >
            <I.Search className="h-3.5 w-3.5 text-obs-fg-faint" />
            <span className="flex-1 truncate">Search footage...</span>
            <kbd className="rounded border border-obs-line bg-obs-3 px-1.5 py-0.5 font-mono text-[9px] text-obs-fg-faint">
              /
            </kbd>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3 py-4 overflow-y-auto">
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-obs-fg-faint font-mono">
            Sections
          </div>
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={cn(
                  "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150 select-none",
                  isActive
                    ? "bg-obs-3 text-obs-fg"
                    : "text-obs-fg-dim hover:bg-obs-2 hover:text-obs-fg",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    isActive ? "text-obs-accent" : "text-obs-fg-faint group-hover:text-obs-fg-dim",
                  )}
                />
                <span>{item.label}</span>
                {isActive && (
                  <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-obs-accent" />
                )}
              </NavLink>
            );
          })}

          <div className="pt-4 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-obs-fg-faint font-mono">
            Resources
          </div>
          <a
            href="/docs/"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-obs-fg-dim transition-colors hover:bg-obs-2 hover:text-obs-fg"
          >
            <I.Book className="h-4 w-4 text-obs-fg-faint" />
            <span>Documentation</span>
          </a>
        </nav>

        {/* Footer status */}
        <div className="border-t border-obs-line bg-obs-1 p-4">
          <div className="rounded-md border border-obs-line bg-obs-2 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-medium text-obs-ok">
                <span className={cn("h-1.5 w-1.5 rounded-full", perceptionOk ? "bg-obs-ok" : "bg-obs-warn")} />
                Perception Engine
              </span>
              <span className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[9px] font-medium border",
                perceptionOk
                  ? "bg-obs-ok/10 text-obs-ok border-obs-ok/20"
                  : "bg-obs-warn/10 text-obs-warn border-obs-warn/20",
              )}>
                {perceptionOk ? "online" : "offline"}
              </span>
            </div>
            <div className="mt-2.5 space-y-1 font-mono text-[10px] text-obs-fg-dim">
              <div className="flex justify-between">
                <span>Model</span>
                <span className="text-obs-fg">YOLO26s · CLIP</span>
              </div>
              <div className="flex justify-between">
                <span>Deployment</span>
                <span className="text-obs-fg">Edge · on-device</span>
              </div>
              <div className="flex justify-between">
                <span>Objects tracked</span>
                <span className="text-obs-fg">{sys?.track_count ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-obs-1">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-obs-line bg-obs-1/80 px-6 z-10">
          <div className="flex items-center gap-3">
            <Badge tone={threatLevel === "NOMINAL" ? "ok" : threatLevel === "ELEVATED" ? "warn" : "alert"} dot>
              {threatLevel.toLowerCase()}
            </Badge>
            <span className="hidden sm:inline-block h-4 w-px bg-obs-line-strong" />
            <span className="hidden sm:flex items-center gap-2 text-xs font-mono text-obs-fg-dim">
              <span className="text-obs-fg-faint">{cameras.length} feeds</span>
              <span className="text-obs-line-strong">·</span>
              <span>{online} online</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 font-mono text-xs text-obs-fg-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-obs-ok" />
              <span>{time.toLocaleTimeString()}</span>
              <span className="text-obs-fg-faint">
                {time.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>

            <Link
              to="/notifications"
              className="relative flex h-8 w-8 items-center justify-center rounded-md border border-obs-line bg-obs-2 text-obs-fg-dim transition hover:border-obs-line-strong hover:text-obs-fg"
              title="Notifications"
            >
              <I.Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-obs-warn ring-2 ring-obs-1" />
            </Link>

            <Link
              to="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-obs-line bg-obs-2 text-obs-fg-dim transition hover:border-obs-line-strong hover:text-obs-fg"
              title="Settings"
            >
              <I.Gear className="h-4 w-4" />
            </Link>
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1 overflow-y-auto p-7 scroll-smooth">
          <div className="obs-rise">
            <Outlet />
          </div>
        </main>

        {/* Footer */}
        <footer className="flex h-12 shrink-0 items-center justify-between border-t border-obs-line bg-obs-1 px-6 text-[11px] text-obs-fg-dim">
          <div className="flex items-center gap-3">
            <span className="text-obs-fg-faint">Observatory · Hypotenuse Sec-Ops</span>
            <span className="hidden md:inline text-obs-line-strong">|</span>
            <span className="hidden md:inline text-obs-fg-faint">
              on-device inference · {cameras.length} cameras · no cloud dependency
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="transition hover:text-obs-fg">Terms</Link>
            <Link to="/privacy" className="transition hover:text-obs-fg">Privacy</Link>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-obs-ok" />
              <span className="font-mono">edge-alpha-01</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
