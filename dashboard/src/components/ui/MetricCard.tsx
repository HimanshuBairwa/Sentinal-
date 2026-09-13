"use client";

import { ReactNode } from "react";
import { GlassCard } from "./GlassCard";
import { clsx } from "clsx";
import { AnimatedNumber } from "./AnimatedNumber";
import { motion, useReducedMotion } from "framer-motion";

interface MetricCardProps {
  title: string;
  value: number;
  format?: "number" | "currency" | "percent";
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  /** Optional mini sparkline (values 0-100) rendered as an animated ring. */
  ring?: number;
  className?: string;
  delay?: number;
}

export function MetricCard({
  title, value, format = "number", icon, trend, ring, className, delay = 0,
}: MetricCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <GlassCard
      className={clsx("group/metric", className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      whileHover={reduceMotion ? undefined : { y: -4 }}
    >
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm font-medium tracking-wide text-slate-400">{title}</p>
          </div>
          <div className="relative flex items-center gap-2">
            {ring !== undefined && (
              /* Animated progress ring around the icon */
              <svg viewBox="0 0 44 44" className="absolute -right-1 -top-1 h-14 w-14 -rotate-90 opacity-70">
                <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                <motion.circle
                  cx="22" cy="22" r="19" fill="none"
                  stroke={ring > 66 ? "#f43f5e" : ring > 33 ? "#f97316" : "#22d3ee"}
                  strokeWidth="2" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 19}
                  initial={{ strokeDashoffset: 2 * Math.PI * 19 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 19 * (1 - Math.min(ring, 100) / 100) }}
                  transition={{ duration: 1.2, delay: delay + 0.3, ease: [0.23, 1, 0.32, 1] }}
                />
              </svg>
            )}
            <div className="relative rounded-xl border border-white/5 bg-gradient-to-br from-white/10 to-transparent p-2.5 text-cyan-400 shadow-inner transition-transform duration-300 group-hover/metric:scale-110">
              <div className="absolute inset-0 rounded-full bg-cyan-400/20 opacity-0 blur-xl transition-opacity duration-300 group-hover/metric:opacity-100" />
              <div className="relative z-10">{icon}</div>
            </div>
          </div>
        </div>
        <div className="mt-auto flex items-end gap-3">
          <AnimatedNumber
            value={value}
            format={format}
            className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent drop-shadow-sm"
          />
          {trend && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: delay + 0.2 }}
              className={clsx(
                "mb-1 rounded-md border px-2 py-1 text-sm font-semibold",
                trend.isPositive
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                  : "border-rose-500/20 bg-rose-500/10 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
              )}
            >
              {trend.isPositive ? "+" : "-"}
              {Math.abs(trend.value)}%
            </motion.span>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
