import { useState } from "react";

const DOTS = 3;

export default function SplashPage() {
  const [step, setStep] = useState(0);

  return (
    <main className="relative flex h-full min-h-screen flex-col items-center justify-center overflow-hidden bg-aina-navy-deep text-aina-frost">
      <div className="aina-grid-backdrop absolute inset-0" />
      <div className="absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-aina-teal/10 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <img src="/hypotenuse-logo.png" alt="Hypotenuse Analytics mark" className="mb-8 h-20 w-20 drop-shadow-[0_0_22px_rgba(47,191,164,0.45)]" />

        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.45em] text-aina-teal">
          Hypotenuse Analytics
        </p>
        <h1 className="text-5xl font-light tracking-tight text-aina-frost sm:text-6xl">
          Surveillance <span className="font-semibold text-aina-teal">Intelligence Lab</span>
        </h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-aina-slate">
          Surveillance intelligence dashboard. Predict. Protect. Verify.
        </p>

        <div className="mt-10 flex items-center gap-2 text-aina-teal" aria-label="booting">
          {Array.from({ length: DOTS }).map((_, i) => (
            <button
              key={i}
              data-testid={`boot-dot-${i}`}
              onClick={() => setStep(step + 1)}
              aria-hidden
              tabIndex={-1}
              className={`h-2 w-2 rounded-full transition-all ${
                step % DOTS === i ? "scale-125 bg-aina-teal" : "bg-aina-teal/25"
              }`}
            />
          ))}
        </div>

        <p className="mt-6 font-mono text-[11px] tracking-wider text-aina-slate/70">
          v0.1.0-alpha · connecting perceptions
        </p>
      </div>

      <footer className="absolute bottom-6 z-10 text-[11px] tracking-[0.2em] text-aina-slate/50 uppercase">
        &copy; {new Date().getFullYear()} Hypotenuse Analytics — Predict. Protect. Verify.
      </footer>
    </main>
  );
}