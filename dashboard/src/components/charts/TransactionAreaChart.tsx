"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  type TooltipContentProps,
} from "recharts";
import { motion as fm } from "framer-motion";
import { useReducedMotion } from "framer-motion";

interface TransactionAreaChartProps {
  data: { time: string; transactions: number; fraud: number }[];
}

/** Custom glass tooltip with value chips. */
function GlassTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      {payload.map((entry) => (
        <div key={`${entry.dataKey}-${entry.name}`} className="flex items-center gap-2.5 text-sm">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: entry.color, boxShadow: `0 0 8px ${entry.color}` }}
          />
          <span className="text-slate-400 capitalize">{String(entry.name ?? entry.dataKey)}</span>
          <span className="ml-auto pl-4 font-mono font-semibold text-slate-100 tabular-nums">
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Volume-vs-fraud area chart with cinematic entrance: container fades and
 * lifts in, Recharts animates the area draw, and the cursor gets a glowing
 * crosshair tooltip. Gradients + drop-shadow strokes make it feel physical.
 */
export function TransactionAreaChart({ data }: TransactionAreaChartProps) {
  const reduceMotion = useReducedMotion();
  const drawDuration = reduceMotion ? 0 : 900;

  return (
    <fm.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="h-full w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorTransactions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorFraud" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
            {/* Stroke gradient: bright head, dim tail — reads like a light streak */}
            <linearGradient id="strokeTransactions" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
            <linearGradient id="strokeFraud" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#be123c" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="time"
            stroke="#64748b"
            tick={{ fill: "#64748b", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fill: "#64748b", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : `${val}`)}
          />
          <Tooltip
            content={(props) => <GlassTooltip {...(props as TooltipContentProps<number, string>)} />}
            cursor={{ stroke: "rgba(34,211,238,0.35)", strokeWidth: 1, strokeDasharray: "4 4" }}
          />
          <Area
            type="monotone"
            dataKey="transactions"
            stroke="url(#strokeTransactions)"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorTransactions)"
            animationDuration={drawDuration}
            isAnimationActive={!reduceMotion}
            animationBegin={0}
            activeDot={{
              r: 5,
              fill: "#22d3ee",
              stroke: "#0f172a",
              strokeWidth: 2,
            }}
          />
          <Area
            type="monotone"
            dataKey="fraud"
            stroke="url(#strokeFraud)"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorFraud)"
            animationDuration={drawDuration}
            isAnimationActive={!reduceMotion}
            animationBegin={0}
            activeDot={{
              r: 5,
              fill: "#f43f5e",
              stroke: "#0f172a",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </fm.div>
  );
}
