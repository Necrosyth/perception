import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils";
import { I } from "./icons";

const nav = [
  { to: "/", label: "Live View", icon: I.Grid, end: true },
  { to: "/birdseye", label: "Birds Eye", icon: I.Crosshair },
  { to: "/review", label: "Events", icon: I.History },
  { to: "/explore", label: "Explore", icon: I.Search },
  { to: "/zones", label: "Zones", icon: I.Zone },
  { to: "/system", label: "System", icon: I.Gauge },
  { to: "/notifications", label: "Notifications", icon: I.Bell },
];

const docs = { href: "/docs/", label: "Documentation", icon: I.Book };

export function AppShell() {
  const now = new Date();
  return (
    <div className="flex h-full min-h-screen bg-aina-navy-deep text-aina-frost">
      <aside className="flex w-56 shrink-0 flex-col border-r border-aina-slate/10 bg-aina-navy">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img src="/hypotenuse-logo.png" alt="" className="h-8 w-8" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide">
              Surveillance <span className="text-aina-teal">Intelligence Lab</span>
            </p>
            <p className="text-[9px] uppercase tracking-[0.22em] text-aina-slate/60">Hypotenuse Analytics</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-aina-teal/12 text-aina-teal"
                      : "text-aina-slate hover:bg-aina-navy-deep/60 hover:text-aina-frost",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
          <a
            key={docs.href}
            href={docs.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-aina-slate transition-colors hover:bg-aina-navy-deep/60 hover:text-aina-frost"
          >
            <docs.icon className="h-4 w-4" />
            {docs.label}
          </a>
        </nav>

        <div className="border-t border-aina-slate/10 px-4 py-3 text-[10px] leading-5 text-aina-slate/60">
          <p className="flex items-center gap-1.5 text-aina-teal">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aina-teal/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-aina-teal" />
            </span>
            Perception online
          </p>
          <p className="mt-1">v0.1.0-alpha · edge</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto p-5">
          <Outlet />
        </main>
        <footer className="flex items-center justify-between border-t border-aina-slate/10 bg-aina-navy px-5 py-2 text-[11px] text-aina-slate/70">
          <span className="flex items-center gap-3">
            <span>Predict. Protect. Verify.</span>
            <span className="hidden sm:inline">detector 11.9 fps · 6 cameras</span>
          </span>
          <span>{now.toLocaleString()}</span>
        </footer>
      </div>
    </div>
  );
}