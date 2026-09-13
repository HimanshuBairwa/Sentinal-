"use client";

import { clsx } from "clsx";

interface RiskBadgeProps {
  score: number;
  className?: string;
}

export function riskLevel(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

const STYLES: Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", string> = {
  LOW: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MEDIUM: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  HIGH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  CRITICAL: "bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]",
};

export function RiskBadge({ score, className }: RiskBadgeProps) {
  const level = riskLevel(score);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs font-semibold tracking-wide",
        STYLES[level],
        className
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          level === "CRITICAL" && "animate-pulse bg-rose-400",
          level === "HIGH" && "bg-orange-400",
          level === "MEDIUM" && "bg-yellow-400",
          level === "LOW" && "bg-emerald-400"
        )}
      />
      {level}
      <span className="opacity-70">{score.toFixed(1)}</span>
    </span>
  );
}
