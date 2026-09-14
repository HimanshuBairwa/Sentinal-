"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * HUD AMBIENT LAYER — the always-on Iron-Man interface chrome:
 * viewport corner brackets, a slow CRT sweep, and a drifting particle
 * constellation (canvas, single rAF loop, ~60 particles, paused when
 * the tab is hidden and under prefers-reduced-motion).
 *
 * PERFORMANCE: one canvas + one rAF loop for ALL particles (never
 * per-particle DOM nodes); visibility-gated; DPR-capped at 2.
 */
export function HUDAmbientLayer() {
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Particle constellation — canvas keeps the main thread free.
  useEffect(() => {
    if (reduceMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = window.innerWidth * DPR;
      canvas.height = window.innerHeight * DPR;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();

    const COUNT = 64;
    const P = 0.35; // link probability threshold (dist² based)
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.12 * DPR,
      vy: (Math.random() - 0.5) * 0.12 * DPR,
      r: (Math.random() * 1.1 + 0.5) * DPR,
    }));

    const LINK_DIST = 130 * DPR;

    const tick = () => {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      }
      // Constellation links
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST * P / P) {
            const alpha = 0.10 * (1 - Math.sqrt(d2) / LINK_DIST);
            if (alpha <= 0.02) continue;
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx.lineWidth = 0.6 * DPR;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const p of particles) {
        ctx.fillStyle = "rgba(125, 211, 252, 0.5)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, [reduceMotion]);

  if (reduceMotion) return null;

  return (
    <>
      {/* Drifting constellation field */}
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0 opacity-60" aria-hidden="true" />

      {/* Viewport corner brackets — the FUI signature */}
      <div className="hud-corner hud-corner-tl" aria-hidden="true" />
      <div className="hud-corner hud-corner-tr" aria-hidden="true" />
      <div className="hud-corner hud-corner-bl" aria-hidden="true" />
      <div className="hud-corner hud-corner-br" aria-hidden="true" />

      {/* Slow CRT sweep — a soft cyan band gliding over everything */}
      <div
        className="crt-sweep pointer-events-none fixed inset-x-0 top-0 z-[5] h-28 bg-gradient-to-b from-transparent via-cyan-400/[0.045] to-transparent"
        aria-hidden="true"
      />
    </>
  );
}

/**
 * BOOT SEQUENCE — the Stark power-on moment. Full-screen overlay that runs
 * once per session on first authenticated load: flicker-on, self-test log
 * lines, progress bar, then "SYSTEMS ONLINE" and dissolve.
 */
const BOOT_LINES = [
  "SENTINEL CORE v4.2.1 — initializing…",
  "mounting secure enclave … OK",
  "loading threat models [rules, velocity, ml-gbt] … OK",
  "establishing kafka streams … 6 partitions online",
  "clickhouse olap … 3 replicas verified",
  "syncing geo-intelligence db … 241,930 ranges",
  "verifying jwt ring (rs256) … keys valid",
  "calibrating anomaly detectors … done",
  "ALL SYSTEMS NOMINAL — WELCOME, OPERATOR",
];

export function BootSequence({ onDone }: { onDone: () => void }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [phase, setPhase] = useState<"boot" | "online" | "done">("boot");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      // Reduced motion: skip the ceremony, straight to the app.
      const t = setTimeout(onDone, 150);
      return () => clearTimeout(t);
    }
    // Reveal one log line every ~160ms — snappy, not sluggish.
    let i = 0;
    const lineTimer = setInterval(() => {
      i += 1;
      setVisibleLines(i);
      if (i >= BOOT_LINES.length) {
        clearInterval(lineTimer);
        setTimeout(() => setPhase("online"), 320);
        setTimeout(() => setPhase("done"), 1150);
        setTimeout(onDone, 1450);
      }
    }, 160);
    return () => clearInterval(lineTimer);
  }, [onDone, reduceMotion]);

  if (phase === "done") return null;

  return (
    <div
      className={`fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[#020617] transition-opacity duration-500 ${
        phase === "online" ? "opacity-90" : "opacity-100"
      }`}
      role="status"
      aria-label="System boot sequence"
    >
      {/* Scanline texture + subtle vignette */}
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:repeating-linear-gradient(0deg,transparent_0_2px,rgba(2,6,23,0.35)_2px_4px)]" />
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_45%,#020617_100%)]" />

      <div className="boot-flicker relative flex w-full max-w-xl flex-col items-center px-8">
        {/* Center emblem */}
        <div className="relative mb-10 flex h-32 w-32 items-center justify-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="reticle-ring absolute inset-0 rounded-full border border-cyan-400/40"
              style={{ animationDelay: `${i * 1.13}s` }}
            />
          ))}
          <svg viewBox="0 0 48 48" className="relative h-20 w-20 drop-shadow-[0_0_18px_rgba(34,211,238,0.6)]">
            <path
              d="M24 4 L40 10 V24 C40 34.5 33.4 41.6 24 44 C14.6 41.6 8 34.5 8 24 V10 Z"
              stroke="#22d3ee"
              strokeWidth="1.5"
              fill="rgba(34,211,238,0.08)"
            />
            <path d="M24 14 L32 17.5 V24 C32 30.5 28.4 34.9 24 36.2 C19.6 34.9 16 30.5 16 24 V17.5 Z" fill="rgba(34,211,238,0.18)" />
            <circle cx="24" cy="24" r="3" fill="#22d3ee" className="animate-pulse" />
          </svg>
        </div>

        {/* Self-test log */}
        <div className="h-[210px] w-full overflow-hidden font-mono text-[11px] leading-relaxed text-emerald-300/80">
          {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
            <p key={i} className="boot-line">
              <span className="text-cyan-500/70">[{(i * 137 + 40).toString(16).padStart(4, "0").toUpperCase()}]</span>{" "}
              {line}
            </p>
          ))}
          {phase === "boot" && <span className="inline-block h-3.5 w-2 animate-[blink_1.2s_steps(2,start)_infinite] bg-cyan-400" />}
        </div>

        {/* Progress bar */}
        <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-400 transition-[width] duration-150"
            style={{ width: `${(visibleLines / BOOT_LINES.length) * 100}%` }}
          />
        </div>

        {phase === "online" && (
          <p className="mt-6 font-mono text-sm tracking-[0.35em] text-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]">
            SYSTEMS ONLINE
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * TELEMETRY TICKER — bottom-of-screen scrolling status band. Duplicate the
 * track once for a seamless loop; content derived from live events.
 */
export function TelemetryTicker({ items }: { items: string[] }) {
  const reduceMotion = useReducedMotion();
  const doubled = useMemo(() => [...items, ...items], [items]);
  if (reduceMotion || items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-cyan-500/10 bg-[#020617]/85">
      <div className="mx-auto max-w-[1600px] overflow-hidden py-1">
        <div className="ticker-track flex w-max gap-10 whitespace-nowrap font-mono text-[10px] text-cyan-300/50">
          {doubled.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-cyan-400/70" />
              {item}
            </span>
          ))}
        </div>
      </div>
      {/* Left/right fade masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#020617] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#020617] to-transparent" />
    </div>
  );
}

/**
 * HUD STAT CHIP — tiny corner readouts (latency, uptime, ticks) sprinkled
 * through the interface. Styled like a flight instrument readout.
 */
export function HUDStatChip({
  label,
  value,
  tone = "cyan",
}: {
  label: string;
  value: string;
  tone?: "cyan" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    cyan: "text-cyan-300 border-cyan-500/25 bg-cyan-500/[0.07]",
    emerald: "text-emerald-300 border-emerald-500/25 bg-emerald-500/[0.07]",
    amber: "text-amber-300 border-amber-500/25 bg-amber-500/[0.07]",
    rose: "text-rose-300 border-rose-500/25 bg-rose-500/[0.07]",
  }[tone];
  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] ${toneClass}`}>
      <span className="uppercase tracking-wider opacity-60">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
