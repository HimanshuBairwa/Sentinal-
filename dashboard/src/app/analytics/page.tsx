"use client";

import { useEffect, useMemo, useState } from "react";
import { useLive } from "../../components/live/LiveContext";
import { FeedSkeleton } from "../../components/ui/Skeleton";
import { GlassCard } from "../../components/ui/GlassCard";
import {
  fetchFraudRate, fetchGeo, fetchTopThreats,
  type FraudRatePoint, type GeoPoint, type ThreatSource,
} from "../../lib/api";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, RadialBarChart, RadialBar, PolarAngleAxis, Legend,
} from "recharts";
import { BarChart3, TrendingUp, TrendingDown, ActivitySquare, MapPin } from "lucide-react";

export default function AnalyticsPage() {
  const { metrics, history, events, error } = useLive();

  // Real ClickHouse rollups (24h hourly buckets, geo distribution, top sources)
  const [fraudRateSeries, setFraudRateSeries] = useState<FraudRatePoint[]>([]);
  const [geoData, setGeoData] = useState<GeoPoint[]>([]);
  const [threatSources, setThreatSources] = useState<ThreatSource[]>([]);

  useEffect(() => {
    const load = () => {
      void fetchFraudRate().then(setFraudRateSeries).catch(() => setFraudRateSeries([]));
      void fetchGeo().then(setGeoData).catch(() => setGeoData([]));
      void fetchTopThreats().then(setThreatSources).catch(() => setThreatSources([]));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // Hourly volume: prefer the real rollup; fall back to the live window.
  const hourlyData = useMemo(() => {
    if (fraudRateSeries.length > 0) {
      return fraudRateSeries.map((p) => ({
        time: new Date(p.time_bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        volume: p.total,
        blocked: p.fraud,
      }));
    }
    return history.map((point) => ({ time: point.time, volume: point.transactions, blocked: point.fraud }));
  }, [fraudRateSeries, history]);

  const geoSeries = useMemo(
    () => geoData.slice(0, 12).map((g) => ({ country: g.country, count: g.count })),
    [geoData]
  );

  const fraudTypes = useMemo(() => Object.entries(
    events.reduce<Record<string, number>>((counts, event) => {
      if (event.action === "BLOCK" || event.action === "CHALLENGE") {
        counts[event.event_type] = (counts[event.event_type] ?? 0) + 1;
      }
      return counts;
    }, {})
  ).map(([name, value], index) => ({
    name,
    value,
    color: ["#f43f5e", "#f97316", "#eab308", "#06b6d4", "#818cf8"][index % 5],
  })), [events]);

  const scoreBuckets = useMemo(() => {
    const buckets = [
      { range: "0-20", count: 0, fill: "#10b981" },
      { range: "20-40", count: 0, fill: "#84cc16" },
      { range: "40-60", count: 0, fill: "#eab308" },
      { range: "60-80", count: 0, fill: "#f97316" },
      { range: "80-100", count: 0, fill: "#f43f5e" },
    ];
    for (const e of events) {
      const s = e.risk_score ?? 0;
      buckets[Math.min(4, Math.floor(s / 20))].count += 1;
    }
    return buckets;
  }, [events]);

  const actionBreakdown = useMemo(() => {
    const counts = events.reduce<Record<string, number>>((acc, e) => {
      if (e.action) acc[e.action] = (acc[e.action] ?? 0) + 1;
      return acc;
    }, {});
    const colors: Record<string, string> = {
      ALLOW: "#10b981", REVIEW: "#eab308", CHALLENGE: "#f97316", BLOCK: "#f43f5e",
    };
    return ["ALLOW", "REVIEW", "CHALLENGE", "BLOCK"]
      .map((a) => ({ name: a, value: counts[a] ?? 0, fill: colors[a] }))
      .filter((d) => d.value > 0);
  }, [events]);

  const totalScored = actionBreakdown.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex h-full flex-col gap-6 p-6 lg:p-8">
      <div className="mb-2 flex items-center space-x-3">
        <BarChart3 className="h-8 w-8 text-fuchsia-500 drop-shadow-[0_0_10px_rgba(217,70,239,0.8)]" />
        <div>
          <h1 className="text-3xl font-bold text-white drop-shadow-md">Analytics Deep-Dive</h1>
          <p className="text-sm text-slate-400">24-hour ClickHouse rollups · auto-refresh 60s</p>
        </div>
      </div>
      {error && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
          Live window degraded: {error} — rollups below still render from ClickHouse.
        </p>
      )}

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hourly volume — REAL rollup */}
        <GlassCard
          title="Hourly Volume vs Fraud"
          subtitle={fraudRateSeries.length ? "ClickHouse hourly rollup (24h)" : "Live event window"}
          className="min-h-[420px]"
          premium
        >
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis stroke="#64748b" tick={{ fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.02)" }}
                contentStyle={{
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  backdropFilter: "blur(10px)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
              <Bar dataKey="volume" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Volume" />
              <Bar dataKey="blocked" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Fraud (score ≥ 60)" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Geo distribution — REAL rollup */}
        <GlassCard
          title="Threat Geography"
          subtitle={geoSeries.length ? `Top ${geoSeries.length} countries by volume` : "Awaiting geo data"}
          className="min-h-[420px]"
          premium
        >
          {geoSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={geoSeries} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="#64748b" tick={{ fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="country"
                  stroke="#64748b"
                  width={40}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {geoSeries.map((g, i) => (
                    <Cell key={g.country} fill={["#22d3ee", "#818cf8", "#f97316", "#f43f5e", "#eab308"][i % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
              <MapPin className="h-8 w-8 text-slate-600" />
              <p className="text-sm">No country data — run <code className="rounded bg-white/5 px-1">make seed-analytics</code></p>
            </div>
          )}
        </GlassCard>

        {/* Top threat sources — REAL rollup */}
        <GlassCard
          title="Top Threat Sources"
          subtitle={threatSources.length ? "IPs with highest fraud volume (score ≥ 60)" : "Awaiting threat data"}
          className="min-h-[420px]"
          premium
        >
          {threatSources.length > 0 ? (
            <div className="space-y-2 overflow-y-auto pr-1">
              {threatSources.map((t, i) => (
                <div key={t.threat_source} className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-900/40 px-4 py-2.5">
                  <span className="font-mono text-sm text-slate-300">{t.threat_source}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{t.attempt_count} attempts</span>
                    <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-400">
                      #{i + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <FeedSkeleton items={4} />
          )}
        </GlassCard>

        {/* Decision actions radial */}
        <GlassCard title="Decision Actions" subtitle="Live window: ALLOW / REVIEW / CHALLENGE / BLOCK" className="min-h-[420px]" premium>
          <div className="relative flex h-full items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={actionBreakdown.length ? actionBreakdown : [{ name: "none", value: 1, fill: "#1e293b" }]}
                innerRadius="30%"
                outerRadius="90%"
                startAngle={225}
                endAngle={-45}
              >
                <PolarAngleAxis type="number" domain={[0, Math.max(1, totalScored)]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "rgba(255,255,255,0.03)" }} />
                <Tooltip contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute flex flex-col items-center gap-1">
              <ActivitySquare className="h-5 w-5 text-slate-500" />
              <p className="text-4xl font-bold text-white">{totalScored}</p>
              <p className="text-xs text-slate-400">scored decisions</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-4">
            {actionBreakdown.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-sm text-slate-300">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.fill }} />
                {d.name}: {d.value}
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Typology donut */}
        <GlassCard title="Fraud Typology Breakdown" subtitle="BLOCK & CHALLENGE by event type (live window)" className="min-h-[460px]" premium>
          <div className="relative h-full w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    backdropFilter: "blur(10px)",
                  }}
                  itemStyle={{ color: "#f8fafc" }}
                />
                <Pie
                  data={fraudTypes.length ? fraudTypes : [{ name: "No fraud events", value: 1, color: "#1e293b" }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {(fraudTypes.length ? fraudTypes : [{ color: "#1e293b" }]).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-3xl font-bold text-white">{metrics.fraudRate.toFixed(2)}%</p>
                <p className="text-xs text-slate-400">Total Fraud Rate</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {fraudTypes.map((type) => (
              <div key={type.name} className="flex items-center gap-2 text-sm text-slate-300">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: type.color }} />
                {type.name}
              </div>
            ))}
            {fraudTypes.length === 0 && <p className="text-sm text-slate-500">No fraud events in window</p>}
          </div>
        </GlassCard>

        {/* Score distribution */}
        <GlassCard title="Risk Score Distribution" subtitle="Live decisions bucketed by score" className="min-h-[460px]" premium>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={scoreBuckets} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="range" stroke="#64748b" tick={{ fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis stroke="#64748b" tick={{ fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                contentStyle={{
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  backdropFilter: "blur(10px)",
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {scoreBuckets.map((b) => (
                  <Cell key={b.range} fill={b.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Low risk: {scoreBuckets[0].count + scoreBuckets[1].count}
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-rose-400" /> High risk: {scoreBuckets[3].count + scoreBuckets[4].count}
            </span>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
