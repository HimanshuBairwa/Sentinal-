"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * HOLOGRAPHIC GAUGE — arc gauge upgraded to a Stark-grade flight
 * instrument: counter-rotating holo rings, dense tick rail, glowing needle
 * with spring physics, and a readout that reads like a HUD label.
 */
export function Gauge({
  value,
  max = 100,
  label,
  unit = "",
  size = 150,
  dangerThreshold = 66,
  warnThreshold = 33,
}: {
  value: number;
  max?: number;
  label?: string;
  unit?: string;
  size?: number;
  dangerThreshold?: number;
  warnThreshold?: number;
}) {
  const reduceMotion = useReducedMotion();
  const pct = Math.max(0, Math.min(1, value / max));
  const R = 45;
  const CIRC = 2 * Math.PI * R;
  const SWEEP = 0.75; // 270°
  const arcLen = CIRC * SWEEP;

  const color =
    pct * 100 >= dangerThreshold
      ? "#f43f5e"
      : pct * 100 >= warnThreshold
        ? "#f97316"
        : "#22d3ee";

  return (
    <div className="flex flex-col items-center gap-2" style={{ width: size }}>
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="overflow-visible">
        <defs>
          <filter id="gaugeGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer holo ring — slowly rotating dashes (compositor-only) */}
        <circle
          cx="50" cy="50" r={R + 6.5}
          fill="none" stroke="rgba(56,189,248,0.16)" strokeWidth="0.7"
          strokeDasharray="1.5 5"
          className={reduceMotion ? undefined : "holo-ring"}
        />
        {/* Second ring — counter-rotating, fainter */}
        <circle
          cx="50" cy="50" r={R + 3}
          fill="none" stroke="rgba(129,140,248,0.14)" strokeWidth="0.5"
          strokeDasharray="0.5 6"
          className={reduceMotion ? undefined : "holo-ring-rev"}
        />

        {/* Track: full 270° */}
        <circle
          cx="50" cy="50" r={R}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${CIRC}`}
          transform="rotate(135 50 50)"
        />
        {/* Value arc */}
        <motion.circle
          cx="50" cy="50" r={R}
          fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${CIRC}`}
          transform="rotate(135 50 50)"
          initial={{ strokeDashoffset: arcLen }}
          animate={{ strokeDashoffset: arcLen * (1 - pct) }}
          transition={{ duration: 1.4, ease: [0.23, 1, 0.32, 1] }}
          filter="url(#gaugeGlow)"
        />
        {/* Tick marks every 10% */}
        {[...Array(11)].map((_, i) => {
          const angle = 135 + (270 * i) / 10;
          const rad = (angle * Math.PI) / 180;
          const r1 = R - 6, r2 = R - 2.5;
          return (
            <line
              key={i}
              x1={50 + r1 * Math.cos(rad)} y1={50 + r1 * Math.sin(rad)}
              x2={50 + r2 * Math.cos(rad)} y2={50 + r2 * Math.sin(rad)}
              stroke="rgba(255,255,255,0.15)" strokeWidth={i % 5 === 0 ? 1.2 : 0.6}
            />
          );
        })}
        {/* Needle with glow + spring sweep */}
        <motion.g
          initial={{ rotate: -135 }}
          animate={{ rotate: -135 + 270 * pct }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 14, delay: 0.2 }}
          style={{ originX: "50px", originY: "50px" }}
        >
          <line x1="50" y1="50" x2="50" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round" filter="url(#gaugeGlow)" />
          <circle cx="50" cy="50" r="3.5" fill="#0f172a" stroke={color} strokeWidth="1.5" />
        </motion.g>
      </svg>
      <div className="text-center">
        <p className="font-mono text-xl font-bold tabular-nums drop-shadow-[0_0_10px_rgba(34,211,238,0.25)]" style={{ color }}>
          {value.toFixed(1)}
          <span className="text-sm opacity-70">{unit}</span>
        </p>
        {label && <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>}
      </div>
    </div>
  );
}
