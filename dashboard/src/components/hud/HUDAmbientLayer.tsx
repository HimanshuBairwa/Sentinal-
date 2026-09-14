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
  // (Skipped only under reduced motion: it is inherently continuous.)
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

    const COUNT = 85;
    // (removed link-probability hack — direct distance threshold now)
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.22 * DPR,
      vy: (Math.random() - 0.5) * 0.22 * DPR,
      r: (Math.random() * 1.5 + 0.8) * DPR,
    }));

    const LINK_DIST = 175 * DPR;

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
          if (d2 < LINK_DIST * LINK_DIST) {
            const alpha = 0.42 * (1 - Math.sqrt(d2) / LINK_DIST);
            if (alpha <= 0.02) continue;
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx.lineWidth = 1.1 * DPR;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const p of particles) {
        // Larger particles read as indigo accents; the rest bright cyan
        ctx.fillStyle = p.r > 2 * DPR ? "rgba(129, 140, 248, 0.85)" : "rgba(103, 232, 249, 0.9)";
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

  // REDUCED MOTION: draw the constellation ONCE inside an effect (never
  // during render) — a frozen starfield, plus all structural HUD chrome.
  useEffect(() => {
    if (!reduceMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * DPR;
    canvas.height = window.innerHeight * DPR;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    // Frozen constellation: particles + links, no animation.
    const stars = Array.from({ length: 85 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (Math.random() * 1.5 + 0.8) * DPR,
    }));
    const LINK = 175 * DPR;
    for (let i = 0; i < stars.length; i++) {
      const a = stars[i];
      for (let j = i + 1; j < stars.length; j++) {
        const b = stars[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK) {
          const alpha = 0.42 * (1 - d / LINK);
          ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
          ctx.lineWidth = 1.1 * DPR;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const s of stars) {
      ctx.fillStyle = s.r > 2 * DPR ? "rgba(129, 140, 248, 0.85)" : "rgba(103, 232, 249, 0.9)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [reduceMotion]);

  return (
    <>
      {/* Constellation canvas — animated normally, frozen under RM */}
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />

      {/* Viewport corner brackets — the FUI signature */}
      <div className="hud-corner hud-corner-tl" aria-hidden="true" />
      <div className="hud-corner hud-corner-tr" aria-hidden="true" />
      <div className="hud-corner hud-corner-bl" aria-hidden="true" />
      <div className="hud-corner hud-corner-br" aria-hidden="true" />

      {/* CRT sweep — a pronounced cyan band gliding over everything */}
      <div
        className="crt-sweep pointer-events-none fixed inset-x-0 top-0 z-[5] h-40 bg-gradient-to-b from-transparent via-cyan-400/[0.09] to-transparent"
        aria-hidden="true"
      />
      {/* Second sweep offset in time — layered like Stark's multi-beam HUD */}
      <div
        className="crt-sweep pointer-events-none fixed inset-x-0 top-0 z-[5] h-24 bg-gradient-to-b from-transparent via-indigo-400/[0.07] to-transparent"
        style={{ animationDelay: "6.5s" }}
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

/**
 * TACTICAL RADAR — the Stark centerpiece. A sweeping radar scope with range
 * rings, degree ticks, crosshairs, and live threat blips positioned by
 * deterministic hash (stable per event id). The sweep is SMIL — zero JS per
 * frame — and blips breathe on staggered delays so the scope feels alive.
 */
export function TacticalRadar({
  threats,
  size = 320,
}: {
  threats: { id: string; score: number; action: string }[];
  size?: number;
}) {
  const reduceMotion = useReducedMotion();
  const SWEEP_PERIOD = 4.5; // seconds per rotation

  // Deterministic polar position per threat id — stable, no re-randomizing.
  const blips = useMemo(
    () =>
      threats.slice(0, 12).map((t) => {
        let h = 0;
        for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) | 0;
        const angle = (Math.abs(h) % 360) * (Math.PI / 180);
        const dist = 18 + (Math.abs(h >> 7) % 26); // 18–44% of radius
        const critical = t.action === "BLOCK" || t.score >= 80;
        return {
          id: t.id,
          x: 50 + dist * Math.cos(angle),
          y: 50 + dist * Math.sin(angle),
          critical,
          score: t.score,
        };
      }),
    [threats]
  );

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_0_25px_rgba(34,211,238,0.25)]">
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.10)" />
            <stop offset="100%" stopColor="rgba(2,6,23,0.9)" />
          </radialGradient>
          <linearGradient id="beamGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(34,211,238,0.55)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </linearGradient>
          <filter id="blipGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        {/* Scope background */}
        <circle cx="50" cy="50" r="48" fill="url(#radarBg)" stroke="rgba(34,211,238,0.35)" strokeWidth="0.5" />

        {/* Range rings */}
        {[14, 26, 38].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(34,211,238,0.16)" strokeWidth="0.4" strokeDasharray="1 2" />
        ))}

        {/* Degree ticks every 30° */}
        {[...Array(12)].map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={50 + 44 * Math.cos(a)} y1={50 + 44 * Math.sin(a)}
              x2={50 + 47.5 * Math.cos(a)} y2={50 + 47.5 * Math.sin(a)}
              stroke="rgba(34,211,238,0.4)" strokeWidth="0.6"
            />
          );
        })}

        {/* Crosshair axes */}
        <line x1="50" y1="4" x2="50" y2="96" stroke="rgba(34,211,238,0.10)" strokeWidth="0.4" />
        <line x1="4" x2="96" y1="50" y2="50" stroke="rgba(34,211,238,0.10)" strokeWidth="0.4" />

        {/* Sweeping beam — SMIL rotation, zero JS per frame */}
        {!reduceMotion && (
          <path d="M50 50 L95 50 A45 45 0 0 0 71 12 Z" fill="url(#beamGrad)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 50 50"
              to="360 50 50"
              dur={`${SWEEP_PERIOD}s`}
              repeatCount="indefinite"
            />
          </path>
        )}

        {/* Threat blips — deterministically placed, glow on critical */}
        {blips.map((b) => (
          <g key={b.id} filter="url(#blipGlow)">
            <circle cx={b.x} cy={b.y} r={b.critical ? 1.4 : 1} fill={b.critical ? "#f43f5e" : "#fbbf24"}>
              {!reduceMotion && (
                <animate
                  attributeName="opacity"
                  values="0.35;1;0.35"
                  dur="4.5s"
                  begin={`${(Number(b.id.charCodeAt(0)) % 45) / 10}s`}
                  repeatCount="indefinite"
                />
              )}
            </circle>
          </g>
        ))}

        {/* Center core */}
        <circle cx="50" cy="50" r="1.8" fill="#22d3ee" className={reduceMotion ? undefined : "animate-pulse"} />
      </svg>

      {/* Corner readouts on the scope frame */}
      <span className="absolute left-2 top-2 font-mono text-[9px] tracking-widest text-cyan-400/60">TAC-01</span>
      <span className="absolute right-2 top-2 font-mono text-[9px] tracking-widest text-cyan-400/60">360°·4.5s</span>
      <span className="absolute bottom-2 left-2 font-mono text-[9px] tracking-widest text-cyan-400/60">
        {blips.length} TRK
      </span>
      <span className="absolute bottom-2 right-2 font-mono text-[9px] tracking-widest text-emerald-400/60">ACTIVE</span>
    </div>
  );
}
