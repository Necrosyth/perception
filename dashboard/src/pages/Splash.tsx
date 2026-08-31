import { Link } from "react-router-dom";
import { Button } from "../components/ui";

export default function SplashPage() {
  return (
    <main className="relative flex h-full min-h-screen flex-col items-center justify-center overflow-hidden bg-obs-0 text-obs-fg select-none">
      {/* Layered neutral backdrop — no glow, no grid */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_-10%,rgba(194,168,120,0.06),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_110%,rgba(138,163,173,0.05),transparent_55%)]" />

      <div className="relative z-10 flex flex-col items-center max-w-xl px-6 text-center obs-rise">
        {/* Brand mark */}
        <div className="mb-7 flex h-20 w-20 items-center justify-center rounded-lg border border-obs-line-strong bg-obs-2">
          <img src="/hypotenuse-logo.png" alt="Observatory" className="h-full w-full object-contain p-3" />
        </div>

        <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-obs-accent">
          Hypotenuse Sec-Ops
        </p>

        <h1 className="font-display text-4xl font-medium tracking-tight text-obs-fg sm:text-[44px]">
          Observatory
        </h1>

        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-obs-fg-dim">
          A calm view over the whole facility. Live feeds, recorded events, and
          on-device detection in one quiet, focused interface.
        </p>

        {/* Status line */}
        <div className="mt-8 flex items-center gap-3 rounded-full border border-obs-line bg-obs-2 px-5 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-obs-ok" />
          <span className="font-mono text-[11px] text-obs-fg-dim">6 cameras online · perception ready</span>
        </div>

        <div className="mt-9 flex flex-col sm:flex-row items-center gap-3">
          <Link to="/">
            <Button variant="solid" size="lg" className="w-52">
              Enter Observatory
            </Button>
          </Link>
          <a href="/docs/" target="_blank" rel="noreferrer">
            <Button variant="outline" size="lg">
              Read the docs
            </Button>
          </a>
        </div>
      </div>

      <footer className="absolute bottom-5 z-10 flex items-center gap-4 font-mono text-[10px] tracking-[0.15em] text-obs-fg-faint uppercase">
        <span>&copy; {new Date().getFullYear()} Hypotenuse Analytics</span>
        <span className="text-obs-line-strong">·</span>
        <Link to="/terms" className="transition hover:text-obs-fg">Terms</Link>
        <span className="text-obs-line-strong">·</span>
        <Link to="/privacy" className="transition hover:text-obs-fg">Privacy</Link>
      </footer>
    </main>
  );
}
