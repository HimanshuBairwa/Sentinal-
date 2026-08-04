"use client";

import { ArrowRightLeft, CheckCircle2, XCircle } from "lucide-react";
import { GlassCard } from "../../components/ui/GlassCard";
import { TransactionAreaChart } from "../../components/charts/TransactionAreaChart";
import { useAnalytics } from "../../hooks/useAnalytics";
import { clsx } from "clsx";

export default function TransactionsPage() {
  const { history, events, error } = useAnalytics();
  return <div className="flex h-full flex-col gap-6"><div className="mb-2 flex items-center space-x-3"><ArrowRightLeft className="h-8 w-8 text-cyan-400" /><h1 className="text-3xl font-bold text-white">Transaction Ledger</h1></div>
    {error && <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">{error}</p>}
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3"><div className="xl:col-span-2"><GlassCard className="flex min-h-[400px] h-full flex-col"><h2 className="mb-6 text-lg font-semibold text-white">Observed volume</h2><div className="relative flex-1">{history.length ? <TransactionAreaChart data={history} /> : <p className="p-8 text-slate-500">Awaiting telemetry...</p>}</div></GlassCard></div>
      <GlassCard className="flex h-[500px] flex-col"><h2 className="mb-6 text-lg font-semibold text-white">Recent activity</h2><div className="flex-1 space-y-3 overflow-y-auto">{events.slice(0, 12).map((event) => { const blocked = event.action === "BLOCK"; return <div key={event.id ?? event.event_id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-900/40 p-3"><div className="flex items-center gap-3"><div className={clsx("rounded-full p-2", blocked ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400")}>{blocked ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div><p className="text-sm text-slate-200">{event.event_type}</p><p className="font-mono text-xs text-slate-500">{event.id ?? event.event_id}</p></div></div><div className="text-right"><p className="text-sm font-bold text-white">{event.action ?? "OBSERVED"}</p><p className="text-xs text-slate-500">{new Date(event.timestamp).toLocaleTimeString()}</p></div></div>; })}{events.length === 0 && <p className="mt-10 text-center text-sm text-slate-500">Awaiting stream data...</p>}</div></GlassCard>
    </div></div>;
}
