"use client";

import { ArrowRightLeft, CheckCircle2, XCircle, Filter } from "lucide-react";
import { TableSkeleton } from "../../components/ui/Skeleton";
import { GlassCard } from "../../components/ui/GlassCard";
import { TransactionAreaChart } from "../../components/charts/TransactionAreaChart";
import { useLive } from "../../components/live/LiveContext";
import { clsx } from "clsx";
import { useState } from "react";
import { motion } from "framer-motion";

const ACTIONS = ["ALL", "ALLOW", "REVIEW", "CHALLENGE", "BLOCK"] as const;
type ActionFilter = (typeof ACTIONS)[number];

export default function TransactionsPage() {
  const { history, events, error } = useLive();
  const [filter, setFilter] = useState<ActionFilter>("ALL");

  const filtered = filter === "ALL" ? events : events.filter((e) => e.action === filter);

  return (
    <div className="flex h-full flex-col gap-6 p-6 lg:p-8">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ArrowRightLeft className="h-8 w-8 text-cyan-400" />
          <div>
            <h1 className="text-3xl font-bold text-white">Transaction Ledger</h1>
            <p className="text-sm text-slate-400">{filtered.length} events in window</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          <Filter className="mx-1.5 h-3.5 w-3.5 text-slate-500" />
          {ACTIONS.map((action) => (
            <button
              key={action}
              onClick={() => setFilter(action)}
              className={clsx(
                "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                filter === action
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
          Telemetry degraded: {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Volume chart */}
        <div className="lg:col-span-2">
          <GlassCard title="Observed Volume" subtitle="Live event stream" className="min-h-[400px]" premium>
            <div className="relative h-[340px]">
              {history.length ? (
                <TransactionAreaChart data={history} />
              ) : (
                <TableSkeleton rows={8} />
              )}
            </div>
          </GlassCard>
        </div>

        {/* Recent activity with filters */}
        <GlassCard title="Recent Activity" subtitle={`Action: ${filter}`} className="max-h-[520px]" premium>
          <div className="flex-1 space-y-3 overflow-y-auto">
            {filtered.slice(0, 14).map((event, i) => {
              const blocked = event.action === "BLOCK";
              return (
                <motion.div
                  key={event.id ?? event.event_id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.4) }}
                  className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-900/40 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={clsx(
                        "rounded-full p-2",
                        blocked ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
                      )}
                    >
                      {blocked ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">{event.event_type}</p>
                      <p className="truncate font-mono text-xs text-slate-500">
                        {event.ip_address ?? (event.id ?? event.event_id)}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-white">{event.action ?? "OBSERVED"}</p>
                    <p className="text-xs text-slate-500">{new Date(event.timestamp).toLocaleTimeString()}</p>
                  </div>
                </motion.div>
              );
            })}
            {filtered.length === 0 && (
              <p className="mt-10 text-center text-sm text-slate-500">No events match this filter.</p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
