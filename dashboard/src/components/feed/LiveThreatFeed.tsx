"use client";

import { memo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AlertOctagon, AlertTriangle, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { RiskBadge } from "../ui/RiskBadge";
import type { AnalyticsEvent } from "../../hooks/useAnalytics";

/**
 * Live feed of threatening decisions (BLOCK/CHALLENGE/REVIEW with score >= 60).
 * New arrivals slide in with a signal-ripple ping; entries animate out when
 * they fall off the end of the window.
 */
function LiveThreatFeedImpl({ events, limit = 12 }: { events: AnalyticsEvent[]; limit?: number }) {
  const reduceMotion = useReducedMotion();
  const threats = events
    .filter((event) => event.action === "BLOCK" || event.action === "CHALLENGE" || (event.risk_score ?? 0) >= 60)
    .slice(0, limit);

  if (threats.length === 0) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-slate-500 opacity-60">
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <ShieldCheck className="h-12 w-12 text-slate-600" />
        </motion.div>
        <p className="text-sm">No active threats in the stream.</p>
        <p className="text-xs text-slate-600">All monitored decisions are within policy.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-2">
      <AnimatePresence initial={false}>
        {threats.map((threat, index) => {
          const critical = threat.action === "BLOCK";
          const newest = index === 0;
          return (
            <motion.div
              key={threat.id ?? threat.event_id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={clsx(
                "relative flex items-start gap-3 overflow-hidden rounded-xl border p-4",
                critical
                  ? "border-rose-500/20 bg-rose-500/10 text-rose-100"
                  : "border-orange-500/20 bg-orange-500/10 text-orange-100"
              )}
            >
              {/* Signal ripple ping on newest arrival */}
              {newest && !reduceMotion && (
                <span
                  className={clsx("signal-ripple", critical ? "text-rose-400" : "text-orange-400")}
                  style={{ animationDelay: "0s" }}
                />
              )}

              {/* Left severity rail — animated glow for critical */}
              <div
                className={clsx(
                  "absolute left-0 top-0 h-full w-0.5",
                  critical ? "bg-rose-500" : "bg-orange-500",
                  critical && !reduceMotion && "danger-glow"
                )}
              />

              <div className="mt-0.5">
                {critical ? (
                  <AlertOctagon className="h-5 w-5 text-rose-400" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{threat.action} decision</p>
                  <span className="shrink-0 font-mono text-[11px] opacity-60">
                    {new Date(threat.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="truncate text-sm opacity-80">
                  {threat.ip_address ?? "unknown source"}
                  {threat.event_type ? ` · ${threat.event_type}` : ""}
                </p>
                <div className="mt-2">
                  <RiskBadge score={threat.risk_score ?? 0} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}


/**
 * Memoized: the 1.4s demo tick creates a new events array identity every
 * time; content-compare by (id, score, action) so identical windows skip
 * the re-render entirely.
 */
export const LiveThreatFeed = memo(LiveThreatFeedImpl, (prev, next) => {
  if (prev.limit !== next.limit) return false;
  if (prev.events.length !== next.events.length) return false;
  for (let i = 0; i < prev.events.length; i++) {
    const a = prev.events[i];
    const b = next.events[i];
    if ((a.id ?? a.event_id) !== (b.id ?? b.event_id)) return false;
    if (a.risk_score !== b.risk_score || a.action !== b.action) return false;
  }
  return true;
});
