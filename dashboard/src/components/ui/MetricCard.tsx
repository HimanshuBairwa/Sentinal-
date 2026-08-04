import { ReactNode } from "react";
import { GlassCard } from "./GlassCard";
import { clsx } from "clsx";
import { AnimatedNumber } from "./AnimatedNumber";
import { motion } from "framer-motion";

interface MetricCardProps {
  title: string;
  value: number;
  format?: "number" | "currency" | "percent";
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  delay?: number;
}

export function MetricCard({ title, value, format = "number", icon, trend, className, delay = 0 }: MetricCardProps) {
  return (
    <GlassCard 
      className={className} 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -4, scale: 1.01 }}
    >
      <div className="flex justify-between items-start mb-4">
        <p className="text-sm font-medium text-slate-400 tracking-wide">{title}</p>
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-white/10 to-transparent shadow-inner text-cyan-400 border border-white/5 relative group-hover:scale-110 transition-transform duration-300">
          <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"/>
          <div className="relative z-10">{icon}</div>
        </div>
      </div>
      <div className="flex items-end gap-3 mt-auto">
        <AnimatedNumber 
          value={value} 
          format={format} 
          className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-sm"
        />
        {trend && (
          <motion.span 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: delay + 0.2 }}
            className={clsx(
              "text-sm font-semibold px-2 py-1 rounded-md mb-1 border",
              trend.isPositive 
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                : "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
            )}
          >
            {trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}%
          </motion.span>
        )}
      </div>
    </GlassCard>
  );
}
