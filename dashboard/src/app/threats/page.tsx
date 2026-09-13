"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldAlert, MapPin } from "lucide-react";
import { useLive } from "../../components/live/LiveContext";
import { LiveThreatFeed } from "../../components/feed/LiveThreatFeed";
import { GlassCard } from "../../components/ui/GlassCard";
import { FeedSkeleton } from "../../components/ui/Skeleton";
import { RiskBadge } from "../../components/ui/RiskBadge";
import { Gauge } from "../../components/ui/Gauge";
import { useToast } from "../../components/ui/Toast";
import { WorldThreatMap, type MapThreat } from "../../components/map/WorldThreatMap";
import { fetchGeo, type GeoPoint } from "../../lib/api";
import { motion, AnimatePresence } from "framer-motion";

/**
 * THREAT INTELLIGENCE — real-geometry world map (Natural Earth 110m atlas via
 * d3-geo + topojson), animated attack arcs, radar sweep, gauges for live
 * threat posture, and a critical-alert toast system.
 */

// Known coordinates for countries seen in analytics (fallback: omitted).
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [39.8, -98.6], GB: [54.0, -2.0], CA: [56.1, -106.3], IN: [20.6, 78.9],
  CN: [35.9, 104.2], BR: [-14.2, -51.9], RU: [61.5, 105.3], DE: [51.2, 10.4],
  FR: [46.2, 2.2], JP: [36.2, 138.3], NL: [52.1, 5.3], SG: [1.35, 103.8],
  AU: [-25.3, 133.8], ZA: [-30.6, 22.9], NG: [9.1, 8.7], VN: [14.1, 108.3],
  ID: [-0.8, 113.9], TR: [38.9, 35.2], KR: [35.9, 127.8], MX: [23.6, -102.5],
};

type GeoThreat = MapThreat & { ip: string; time: string };

export default function ThreatsPage() {
  const { events, loading } = useLive();
  const [selected, setSelected] = useState<GeoThreat | null>(null);
  const [mapFilter, setMapFilter] = useState<"all" | "blocked">("all");
  const [geoRollup, setGeoRollup] = useState<GeoPoint[]>([]);
  const { toast } = useToast();
  // Track which critical events have already been toasted.
  const alertedRef = useRef<Set<string>>(new Set());

  // Real ClickHouse geo rollup — powers the top-threats table and map
  // country coverage when the live window is sparse.
  useEffect(() => {
    const load = () => void fetchGeo().then(setGeoRollup).catch(() => setGeoRollup([]));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const threats = useMemo<GeoThreat[]>(() => {
    const out: GeoThreat[] = [];
    const seen = new Set<string>();
    for (const e of events) {
      const key = e.ip_address ?? e.event_id ?? "anon";
      if (seen.has(key)) continue;
      const country = (e as { country?: string; country_code?: string }).country ??
        (e as { country_code?: string }).country_code;
      const coords = country ? COUNTRY_COORDS[country.toUpperCase()] : undefined;
      if (!coords) continue;
      const score = e.risk_score ?? 0;
      if (mapFilter === "blocked" && e.action !== "BLOCK") continue;
      seen.add(key);
      // Deterministic jitter from a hash of the key so markers for the same
      // country don't perfectly overlap, without impure Math.random in render.
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
      const jitter = ((Math.abs(h) % 100) / 100 - 0.5) * 8;
      const jitter2 = (((Math.abs(h) >> 5) % 100) / 100 - 0.5) * 8;
      out.push({
        id: e.id ?? e.event_id ?? key,
        lat: coords[0] + jitter,
        lon: coords[1] + jitter2,
        ip: e.ip_address ?? "unknown",
        score,
        action: e.action ?? "ALLOW",
        label: e.ip_address ?? undefined,
        time: e.timestamp,
      });
    }
    return out;
  }, [events, mapFilter]);

  // Critical-threat toast: fire once per event id, only for BLOCKs with high scores.
  useEffect(() => {
    for (const e of events) {
      const id = e.id ?? e.event_id;
      if (!id || e.action !== "BLOCK" || (e.risk_score ?? 0) < 85) continue;
      if (alertedRef.current.has(id)) continue;
      alertedRef.current.add(id);
      toast({
        kind: "danger",
        title: "Critical threat blocked",
        message: `${e.ip_address ?? "unknown source"} · score ${(e.risk_score ?? 0).toFixed(1)} · ${e.event_type}`,
        duration: 6000,
      });
    }
  }, [events, toast]);

  // Threat posture gauges — all computed from live data.
  const posture = useMemo(() => {
    const blocked = events.filter((e) => e.action === "BLOCK").length;
    const challenged = events.filter((e) => e.action === "CHALLENGE").length;
    const maxScore = events.reduce((m, e) => Math.max(m, e.risk_score ?? 0), 0);
    return {
      blockedRatio: events.length ? (blocked / events.length) * 100 : 0,
      challengeRatio: events.length ? (challenged / events.length) * 100 : 0,
      peakScore: maxScore,
    };
  }, [events]);

  return (
    <div className="flex h-full flex-col gap-6 p-6 lg:p-8">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ShieldAlert className="h-8 w-8 text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-md">Threat Intelligence</h1>
            <p className="text-sm text-slate-400">Real-geometry global map · live attack telemetry</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-1">
          {(["all", "blocked"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setMapFilter(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                mapFilter === mode ? "bg-rose-500/20 text-rose-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {mode === "all" ? "All Threats" : "Blocked Only"}
            </button>
          ))}
        </div>
      </div>

      {/* Posture gauges */}
      <div className="grid grid-cols-3 gap-4">
        <GlassCard className="flex items-center justify-center py-4" premium>
          <Gauge value={posture.blockedRatio} label="Block Rate" unit="%" size={130} />
        </GlassCard>
        <GlassCard className="flex items-center justify-center py-4" premium>
          <Gauge value={posture.challengeRatio} label="Challenge Rate" unit="%" size={130} warnThreshold={40} />
        </GlassCard>
        <GlassCard className="flex items-center justify-center py-4" premium>
          <Gauge value={posture.peakScore} label="Peak Risk" size={130} dangerThreshold={80} warnThreshold={60} />
        </GlassCard>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
        {/* World threat map */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <GlassCard
            title="Global Threat Map"
            subtitle={`${threats.length} active sources · Natural Earth projection`}
            className="min-h-[480px] flex-1"
            premium
          >
            <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-700/50 bg-[#030712]">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
                </div>
              ) : (
                <WorldThreatMap
                  threats={threats}
                  selectedId={selected?.id}
                  onSelect={(t) => {
                    const full = threats.find((x) => x.id === t.id);
                    if (full) setSelected(full);
                  }}
                />
              )}

              {/* Legend */}
              <div className="absolute bottom-3 left-3 flex items-center gap-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
                <span className="flex items-center gap-1.5 text-[11px] text-rose-400">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Critical
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-orange-400">
                  <span className="h-2 w-2 rounded-full bg-orange-500" /> High
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-yellow-400">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" /> Medium
                </span>
              </div>

              {/* Selection detail */}
              <AnimatePresence>
                {selected && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    className="absolute bottom-3 right-3 w-60 rounded-xl border border-white/10 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-mono text-sm text-cyan-300">
                        <MapPin className="h-4 w-4" /> {selected.ip}
                      </span>
                      <button
                        onClick={() => setSelected(null)}
                        className="text-slate-500 transition-colors hover:text-slate-300"
                        aria-label="Close detail"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-3 space-y-2 text-xs text-slate-400">
                      <p>Decision: <span className="font-semibold text-slate-200">{selected.action}</span></p>
                      <p>Risk score: <span className="font-semibold text-slate-200">{selected.score.toFixed(1)}</span></p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {selected.lat.toFixed(1)}°, {selected.lon.toFixed(1)}°
                      </p>
                      <p>{new Date(selected.time).toLocaleString()}</p>
                    </div>
                    <div className="mt-3"><RiskBadge score={selected.score} /></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </GlassCard>

          {/* Geo rollup table */}
          <GlassCard
            title="Top Attack Origins"
            subtitle={geoRollup.length ? `ClickHouse geo rollup · ${geoRollup.length} countries` : "Awaiting geo data"}
            premium
          >
            {geoRollup.length > 0 ? (
              <div className="space-y-2">
                {geoRollup.slice(0, 6).map((g, i) => {
                  const max = geoRollup[0].count;
                  const pct = (g.count / max) * 100;
                  return (
                    <div key={g.country} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate font-mono text-xs text-slate-300">
                        {g.country}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: i * 0.08, ease: [0.23, 1, 0.32, 1] }}
                        />
                      </div>
                      <span className="w-10 text-right font-mono text-xs tabular-nums text-slate-400">
                        {g.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <FeedSkeleton items={4} />
            )}
          </GlassCard>
        </div>

        {/* Right rail: live feed */}
        <div className="flex flex-col gap-6">
          <GlassCard
            title="Live Threat Feed"
            subtitle="BLOCK & CHALLENGE decisions"
            className="flex-1"
            premium
          >
            <LiveThreatFeed events={events} />
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
