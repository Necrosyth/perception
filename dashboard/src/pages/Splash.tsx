import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui";

const STEPS = [
  "Initializing Hardware-Accelerated Video Pipeline...",
  "Verifying TensorRT Detection Engines (YOLO + CLIP)...",
  "Loading Zone Polygon Matrix from aina.yaml...",
  "Connecting to go2rtc Multiplex Stream Mesh...",
  "Perception Online · Surveillance Ready.",
];

export default function SplashPage() {
  const [stepIndex, setStepIndex] = useState(0);

  return (
    <main className="relative flex h-full min-h-screen flex-col items-center justify-center overflow-hidden bg-[#060b13] text-[#f0f6fc] select-none">
      {/* Background Cyber Grid and Ambient Lights */}
      <div className="aina-grid-backdrop absolute inset-0 opacity-80" />
      <div className="absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-[#2fbfa4]/12 blur-3xl" />
      <div className="absolute -bottom-40 right-1/4 h-[400px] w-[600px] rounded-full bg-[#00e5ff]/8 blur-3xl" />

      {/* Main Glassmorphic Hero Container */}
      <div className="relative z-10 flex flex-col items-center max-w-xl px-6 text-center">
        {/* Brand Icon Crest */}
        <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-[#2fbfa4]/40 bg-gradient-to-br from-[#102946] to-[#07111e] p-4 shadow-[0_0_35px_rgba(47,191,164,0.3)] animate-pulse-glow">
          <img src="/hypotenuse-logo.png" alt="Hypotenuse Analytics" className="h-full w-full object-contain" />
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2fbfa4] opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-[#2fbfa4] border-2 border-[#060b13]" />
          </span>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-[#2fbfa4]/30 bg-[#2fbfa4]/10 px-3.5 py-1 mb-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2fbfa4] animate-ping" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#38efcb]">
            Hypotenuse SecOps · Edge Platform
          </span>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
          Surveillance <span className="text-[#2fbfa4]">Intelligence Lab</span>
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-slate-400 max-w-md">
          Next-generation real-time edge computer vision for facilities, loading docks, and perimeter security.
        </p>

        {/* Boot Sequence Telemetry Box */}
        <div className="mt-8 w-full rounded-xl border border-slate-800 bg-[#07111e]/90 p-4 backdrop-blur-md shadow-inner text-left font-mono">
          <div className="flex items-center justify-between text-[10px] text-slate-500 pb-2 border-b border-slate-800/80 mb-2">
            <span>BOOT DIAGNOSTIC SEQUENCE</span>
            <span className="text-[#2fbfa4]">STAGE {stepIndex + 1}/5</span>
          </div>
          <p className="text-xs text-[#38efcb] min-h-[20px] transition-all">
            &gt; {STEPS[stepIndex]}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStepIndex(i)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    stepIndex === i ? "w-6 bg-[#2fbfa4]" : "w-1.5 bg-slate-700 hover:bg-slate-500"
                  }`}
                />
              ))}
            </div>

            <Button
              size="xs"
              variant="ghost"
              onClick={() => setStepIndex((prev) => (prev + 1) % STEPS.length)}
            >
              Step Diagnostic →
            </Button>
          </div>
        </div>

        {/* Launch Dashboard Action */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          <Link to="/">
            <Button variant="solid" size="lg" className="w-48 shadow-lg shadow-[#2fbfa4]/25">
              Launch Dashboard →
            </Button>
          </Link>
          <a href="/docs/" target="_blank" rel="noreferrer">
            <Button variant="outline" size="lg">
              Read Documentation
            </Button>
          </a>
        </div>

        <p className="mt-6 font-mono text-[11px] tracking-wider text-slate-500">
          v0.1.0-alpha · Predict. Protect. Verify.
        </p>
      </div>

      <footer className="absolute bottom-4 z-10 text-[10px] font-mono tracking-[0.2em] text-slate-600 uppercase">
        &copy; {new Date().getFullYear()} Hypotenuse Analytics — All Rights Reserved.
      </footer>
    </main>
  );
}