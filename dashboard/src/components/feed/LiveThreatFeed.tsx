"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertOctagon, ShieldAlert, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import type { AnalyticsEvent } from "../../hooks/useAnalytics";

export function LiveThreatFeed({ events }: { events: AnalyticsEvent[] }) {
  const threats = events.filter((event) => event.action === "BLOCK" || event.action === "CHALLENGE").slice(0, 10);
  if (threats.length === 0) {
    return <div className="flex h-full flex-col items-center justify-center text-slate-500 opacity-50"><ShieldAlert className="mb-3 h-12 w-12 text-slate-600" /><p>No active threats in the stream.</p></div>;
  }
  return <div className="flex h-full flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar"><AnimatePresence>
    {threats.map((threat) => {
      const type = threat.action === "BLOCK" ? "critical" : "high";
      return <motion.div key={threat.id ?? threat.event_id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className={clsx("relative flex items-start gap-3 overflow-hidden rounded-xl border p-4", type === "critical" ? "border-rose-500/20 bg-rose-500/10 text-rose-100" : "border-orange-500/20 bg-orange-500/10 text-orange-100")}>
        <div className="mt-0.5">{type === "critical" ? <AlertOctagon className="h-5 w-5 text-rose-400" /> : <AlertTriangle className="h-5 w-5 text-orange-400" />}</div>
        <div className="flex-1"><div className="flex items-start justify-between"><p className="mb-0.5 text-sm font-semibold">{threat.action} decision</p><span className="font-mono text-xs opacity-60">{new Date(threat.timestamp).toLocaleTimeString()}</span></div><p className="text-sm opacity-80">Risk score {threat.risk_score?.toFixed(1) ?? "-"} from {threat.ip_address ?? "unknown source"}</p></div>
      </motion.div>;
    })}
  </AnimatePresence></div>;
}
