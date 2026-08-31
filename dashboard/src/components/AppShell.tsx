import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";
import { I } from "./icons";
import { Badge } from "./ui";

const nav = [
  { to: "/", label: "Live View", icon: I.Grid, end: true },
  { to: "/birdseye", label: "Birds Eye", icon: I.Crosshair },
  { to: "/review", label: "Events & Review", icon: I.History },
  { to: "/explore", label: "Semantic Explore", icon: I.Search },
  { to: "/zones", label: "Zone Matrix", icon: I.Zone },
  { to: "/system", label: "System Health", icon: I.Gauge },
  { to: "/notifications", label: "Alert Dispatch", icon: I.Bell },
  { to: "/settings", label: "Settings & Config", icon: I.Gear },
];

const docs = { href: "/docs/", label: "Documentation", icon: I.Book };

export function AppShell() {
  const [time, setTime] = useState(new Date());
  const [threatLevel] = useState<"NOMINAL" | "ELEVATED" | "CRITICAL">("NOMINAL");
  const location = useLocation();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full min-h-screen bg-[#060b13] text-[#f0f6fc] font-sans antialiased selection:bg-[#2fbfa4]/30 selection:text-[#2fbfa4]">
      {/* Sleek Enterprise Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800/80 bg-gradient-to-b from-[#09121f] via-[#070e18] to-[#050910] z-20 shadow-2xl">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800/60">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#102a45] to-[#0a1626] border border-[#2fbfa4]/30 p-2 shadow-[0_0_15px_rgba(47,191,164,0.15)]">
            <img src="/hypotenuse-logo.png" alt="Hypotenuse" className="h-full w-full object-contain" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2fbfa4] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#2fbfa4] border border-[#060b13]" />
            </span>
          </div>
          <div className="leading-tight overflow-hidden">
            <Link to="/" className="group block">
              <h2 className="text-sm font-bold tracking-tight text-white font-display flex items-center gap-1">
                SURVEILLANCE <span className="text-[#2fbfa4] font-extrabold">LAB</span>
              </h2>
              <p className="text-[9px] uppercase tracking-[0.22em] text-slate-400 font-mono mt-0.5">
                HYPOTENUSE SEC-OPS
              </p>
            </Link>
          </div>
        </div>

        {/* Global Quick Search Prompt */}
        <div className="px-3 pt-3 pb-1">
          <Link
            to="/explore"
            className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-[#060c16]/90 px-3 py-2 text-xs text-slate-400 transition hover:border-[#2fbfa4]/40 hover:text-slate-200 shadow-inner"
          >
            <I.Search className="h-3.5 w-3.5 text-slate-500" />
            <span className="flex-1 truncate">Semantic Search...</span>
            <kbd className="rounded border border-slate-800 bg-slate-900/80 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
              /
            </kbd>
          </Link>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 space-y-1 px-3 py-3 overflow-y-auto">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 font-mono">
            Navigation
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
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-150 select-none",
                  isActive
                    ? "bg-gradient-to-r from-[#2fbfa4]/15 to-[#2fbfa4]/5 text-[#38efcb] font-semibold border border-[#2fbfa4]/30 shadow-[0_0_15px_-3px_rgba(47,191,164,0.15)]"
                    : "text-slate-400 hover:bg-[#0e1c2e]/60 hover:text-slate-100 border border-transparent",
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#2fbfa4] shadow-[0_0_8px_#2fbfa4]" />
                )}
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    isActive ? "text-[#2fbfa4]" : "text-slate-500 group-hover:text-slate-300",
                  )}
                />
                <span className="tracking-wide">{item.label}</span>
              </NavLink>
            );
          })}

          <div className="pt-3 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 font-mono">
            Resources
          </div>
          <a
            key={docs.href}
            href={docs.href}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition-all hover:bg-[#0e1c2e]/60 hover:text-slate-100 border border-transparent"
          >
            <docs.icon className="h-4 w-4 text-slate-500 group-hover:text-slate-300" />
            <span className="tracking-wide">{docs.label}</span>
            <span className="ml-auto text-[10px] text-slate-500">↗</span>
          </a>
        </nav>

        {/* Sidebar Telemetry & System Status Card */}
        <div className="border-t border-slate-800/80 bg-[#050b12]/90 p-4 text-[11px] font-mono">
          <div className="rounded-xl border border-slate-800/90 bg-[#081220] p-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[#2fbfa4] font-semibold text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2fbfa4] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2fbfa4]" />
                </span>
                Perception Engine
              </span>
              <span className="rounded bg-[#2fbfa4]/15 px-1.5 py-0.2 text-[9px] font-bold text-[#38efcb] border border-[#2fbfa4]/30">
                11.9 FPS
              </span>
            </div>
            <div className="mt-2.5 space-y-1 text-[10px] text-slate-400">
              <div className="flex justify-between">
                <span>Model</span>
                <span className="text-slate-200">RT-DETR (v0.1a)</span>
              </div>
              <div className="flex justify-between">
                <span>Deployment</span>
                <span className="text-slate-200">Edge · TensorRT</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#060b13]">
        {/* Top Operational Status Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800/80 bg-[#081220]/80 px-6 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <Badge tone="teal" dot={true}>
              SYSTEM ONLINE
            </Badge>
            <span className="hidden sm:inline-block h-3.5 w-px bg-slate-800" />
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="text-slate-500">THREAT MATRIX:</span>
              <span
                className={cn(
                  "font-bold",
                  threatLevel === "NOMINAL"
                    ? "text-[#2fbfa4]"
                    : threatLevel === "ELEVATED"
                      ? "text-amber-400"
                      : "text-red-400",
                )}
              >
                {threatLevel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Clock */}
            <div className="hidden md:flex items-center gap-2 rounded-lg border border-slate-800 bg-[#060c16]/80 px-3 py-1 font-mono text-xs text-slate-300 shadow-inner">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2fbfa4]" />
              <span>{time.toLocaleTimeString()}</span>
              <span className="text-[10px] text-slate-500 uppercase">{time.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>

            {/* Quick Links */}
            <Link
              to="/notifications"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-[#091524] text-slate-400 transition hover:border-[#2fbfa4]/50 hover:text-slate-100"
              title="Notifications"
            >
              <I.Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-[#081220]" />
            </Link>

            <Link
              to="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-[#091524] text-slate-400 transition hover:border-[#2fbfa4]/50 hover:text-slate-100"
              title="Settings"
            >
              <I.Gear className="h-4 w-4" />
            </Link>
          </div>
        </header>

        {/* Page View Body */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth bg-radial-gradient">
          <Outlet />
        </main>

        {/* Tactical Footer */}
        <footer className="flex h-9 shrink-0 items-center justify-between border-t border-slate-800/80 bg-[#070e1a] px-6 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-300">PREDICT. PROTECT. VERIFY.</span>
            <span className="hidden md:inline text-slate-600">|</span>
            <span className="hidden md:inline text-slate-400">Detector 11.9 FPS · 6 Cameras Streamed · Zero Cloud Dep</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2fbfa4]" />
              Edge Node Alpha-01
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}