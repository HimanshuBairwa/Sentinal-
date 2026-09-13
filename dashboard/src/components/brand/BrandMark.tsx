"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Sentinel brand mark: a layered emblem with radar sweep, orbiting particles,
 * and breathing scan rings. Pure SVG — scales crisply at any size.
 */
export function BrandMark({ size = 36, glow = true }: { size?: number; glow?: boolean }) {
  const reduceMotion = useReducedMotion();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={glow ? "drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]" : undefined}
    >
      {/* Shield silhouette */}
      <path
        d="M24 4 L40 10 V24 C40 34.5 33.4 41.6 24 44 C14.6 41.6 8 34.5 8 24 V10 Z"
        stroke="url(#shieldGrad)"
        strokeWidth="2"
        fill="rgba(34,211,238,0.06)"
      />
      {/* Radar sweep */}
      <motion.g
        style={{ originX: "24px", originY: "24px" }}
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      >
        <path d="M24 24 L24 10 A14 14 0 0 1 36.6 19.4 Z" fill="url(#sweepGrad)" />
      </motion.g>
      {/* Scan rings — breathing */}
      <motion.circle
        cx="24" cy="24" r="10"
        stroke="rgba(129,140,248,0.5)" strokeWidth="1" strokeDasharray="2 4"
        animate={reduceMotion ? undefined : { scale: [1, 1.12, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx="24" cy="24" r="6"
        stroke="rgba(34,211,238,0.7)" strokeWidth="1.5"
        animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <circle cx="24" cy="24" r="2" fill="#22d3ee" />
      {/* Orbiting particles — 3 trackers at different radii/speeds */}
      {[0, 1, 2].map((i) => (
        <motion.g
          key={i}
          style={{ originX: "24px", originY: "24px" }}
          animate={reduceMotion ? undefined : { rotate: i % 2 === 0 ? 360 : -360 }}
          transition={{ duration: 9 + i * 4, repeat: Infinity, ease: "linear", delay: i * 1.3 }}
        >
          <circle cx={24 + [16, 19.5, 13][i]} cy="24" r={1.2} fill={["#22d3ee", "#818cf8", "#34d399"][i]} opacity="0.9" />
        </motion.g>
      ))}
      <defs>
        <linearGradient id="shieldGrad" x1="8" y1="6" x2="40" y2="42">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
        <radialGradient id="sweepGrad" cx="24" cy="24" r="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(34,211,238,0.35)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Compact wordmark lockup for headers/sidebars. */
export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={compact ? 28 : 36} />
      {!compact && (
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-transparent tracking-wide">
            SENTINEL
          </h1>
          <p className="text-[11px] text-slate-400 -mt-0.5">Fraud Intelligence Command Center</p>
        </div>
      )}
    </div>
  );
}
