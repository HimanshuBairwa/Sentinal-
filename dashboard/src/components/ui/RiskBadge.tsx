import { clsx } from "clsx";

interface RiskBadgeProps {
  score: number;
  className?: string;
}

export function RiskBadge({ score, className }: RiskBadgeProps) {
  let level = "LOW";
  let colors = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  
  if (score >= 80) {
    level = "CRITICAL";
    colors = "bg-red-500/20 text-red-400 border-red-500/30";
  } else if (score >= 60) {
    level = "HIGH";
    colors = "bg-orange-500/20 text-orange-400 border-orange-500/30";
  } else if (score >= 40) {
    level = "MEDIUM";
    colors = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  }

  return (
    <span className={clsx("px-2 py-1 rounded-md text-xs font-semibold border", colors, className)}>
      {level} ({score})
    </span>
  );
}
