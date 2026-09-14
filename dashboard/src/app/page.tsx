"use client";

import { Activity, AlertTriangle, ShieldCheck, Zap, Gauge as GaugeIcon } from "lucide-react";
import { MetricCard } from "../components/ui/MetricCard";
import { MetricSkeleton, ChartSkeleton } from "../components/ui/Skeleton";
import { GlassCard } from "../components/ui/GlassCard";
import { TiltCard } from "../components/ui/TiltCard";
import { Gauge } from "../components/ui/Gauge";
import { useLive } from "../components/live/LiveContext";
import { LazyTransactionAreaChart as TransactionAreaChart } from "../components/charts/LazyCharts";
import { LiveThreatFeed } from "../components/feed/LiveThreatFeed";
import dynamic from "next/dynamic";
import type { MapThreat } from "../components/map/WorldThreatMap";

/** d3-geo + topojson (~150KB) load only when the map card mounts. */
const WorldThreatMap = dynamic(
  () => import("../components/map/WorldThreatMap").then((m) => m.WorldThreatMap),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
      </div>
    ),
    ssr: false,
  }
);
import { motion } from "framer-motion";

const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [39.8, -98.6], GB: [54.0, -2.0], CA: [56.1, -106.3], IN: [20.6, 78.9],
  CN: [35.9, 104.2], BR: [-14.2, -51.9], RU: [61.5, 105.3], DE: [51.2, 10.4],
  FR: [46.2, 2.2], JP: [36.2, 138.3], NL: [52.1, 5.3], SG: [1.35, 103.8],
  AU: [-25.3, 133.8], ZA: [-30.6, 22.9], NG: [9.1, 8.7], VN: [14.1, 108.3],
  ID: [-0.8, 113.9], TR: [38.9, 35.2], KR: [35.9, 127.8], MX: [23.6, -102.5],
};

export default function CommandCenter() {
  const { metrics, history, events, isConnected, error, loading, threatRatio } = useLive();

  // Map threats derived from the live event stream (same logic as threats page).
  const mapThreats = events
    .map((e): MapThreat | null => {
      const key = e.ip_address ?? e.event_id ?? "anon";
      const directLat = (e as { lat?: number }).lat;
      const directLon = (e as { lon?: number }).lon;
      const code = ((e as { country_code?: string }).country_code ?? "").toUpperCase();
      const name = ((e as { country?: string }).country ?? "").toUpperCase();
      const base = Number.isFinite(directLat) && Number.isFinite(directLon)
        ? [directLat!, directLon!]
        : COUNTRY_COORDS[code] ?? COUNTRY_COORDS[name];
      if (!base) return null;
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
      return {
        id: e.id ?? e.event_id ?? key,
        lat: base[0] + (((Math.abs(h) % 100) / 100) - 0.5) * 3,
        lon: base[1] + ((((Math.abs(h) >> 5) % 100) / 100) - 0.5) * 3,
        score: e.risk_score ?? 0,
        action: e.action ?? "ALLOW",
        label: e.ip_address ?? undefined,
      };
    })
    .filter((t): t is MapThreat => t !== null)
    .slice(0, 12);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 pb-10 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4 border-b border-white/5 pb-4"
      >
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-white">
            <ShieldCheck className="h-8 w-8 text-cyan-400" />
            Command Center
          </h1>
          <p className="mt-1 text-sm text-slate-400">Real-time global fraud monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <GaugeIcon className="h-3.5 w-3.5" />
            {events.length} events buffered
          </div>
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
            <span className="relative flex h-3 w-3">
              {isConnected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  isConnected ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
            </span>
            <span
              className={`text-xs font-semibold tracking-wider ${
                isConnected ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {isConnected ? "SYSTEM ONLINE" : "CONNECTION LOST"}
            </span>
          </div>
        </div>
      </motion.div>

      {error && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Telemetry degraded: {error} — showing last known state.
        </div>
      )}

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-12">
        {/* Main chart column */}
        <div className="flex flex-col gap-6 lg:col-span-8">
          <GlassCard
            title="Global Transaction Volume vs Fraud"
            subtitle="Live ClickHouse telemetry"
            className="h-[420px]"
            spotlight
            premium
          >
            {loading ? (
              <ChartSkeleton className="h-full w-full border-0 bg-transparent p-0 shadow-none" />
            ) : history.length > 0 ? (
              <TransactionAreaChart data={history} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
                <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
                <span className="text-sm">Awaiting telemetry…</span>
                <span className="text-xs text-slate-600">
                  Seed data with <code className="rounded bg-white/5 px-1 py-0.5">make seed-analytics</code>
                </span>
              </div>
            )}
          </GlassCard>

          {/* Metric row */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {loading ? (
              <>
                <MetricSkeleton delay={0.1} />
                <MetricSkeleton delay={0.2} />
              </>
            ) : (
              <>
                <TiltCard className="rounded-2xl">
                  <MetricCard
                    title="Total Processed"
                    value={metrics.totalTransactions}
                    icon={<Activity size={24} />}
                    trend={{ value: threatRatio, isPositive: false }}
                    delay={0.1}
                  />
                </TiltCard>
                <TiltCard className="rounded-2xl">
                  <MetricCard
                    title="Fraud Rate"
                    value={metrics.fraudRate}
                    format="percent"
                    icon={<AlertTriangle size={24} />}
                    trend={{ value: threatRatio, isPositive: false }}
                    delay={0.2}
                  />
                </TiltCard>
              </>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6 lg:col-span-4">
          <div className="grid grid-cols-1 gap-6">
            <MetricCard
              title="Active Alerts"
              value={metrics.activeAlerts}
              icon={<Zap size={24} />}
              delay={0.3}
            />
            <MetricCard
              title="Stream Health"
              value={isConnected ? 100 : 0}
              format="percent"
              ring={isConnected ? 100 : 0}
              icon={<ShieldCheck size={24} />}
              delay={0.4}
            />
          </div>

          {/* Fraud-rate gauge — the poster-child metric, now with a needle */}
          <GlassCard title="Threat Posture" subtitle="Live window analysis" premium>
            <div className="flex items-center justify-around py-2">
              <Gauge value={metrics.fraudRate} label="Fraud Rate" unit="%" size={140} dangerThreshold={50} warnThreshold={25} />
              <Gauge value={metrics.systemLoad} label="Load" unit="%" size={110} dangerThreshold={80} warnThreshold={60} />
            </div>
          </GlassCard>

          <GlassCard
            title="Live Threat Feed"
            subtitle="BLOCK & CHALLENGE decisions"
            className="min-h-[300px] flex-1"
            spotlight
            premium
          >
            <LiveThreatFeed events={events} />
          </GlassCard>
        </div>
      </div>

      {/* Mini world map strip — global context at a glance */}
      <GlassCard
        title="Global Activity"
        subtitle="Live sources on the world stage"
        className="h-[340px]"
        premium
      >
        <WorldThreatMap threats={mapThreats} />
      </GlassCard>
    </div>
  );
}
