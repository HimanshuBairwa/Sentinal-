"use client";

import { useAnalytics } from "../../hooks/useAnalytics";
import { GlassCard } from "../../components/ui/GlassCard";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  const { metrics, history, events, error } = useAnalytics();
  const fraudTypes = Object.entries(events.reduce<Record<string, number>>((counts, event) => { if (event.action === "BLOCK" || event.action === "CHALLENGE") counts[event.event_type] = (counts[event.event_type] ?? 0) + 1; return counts; }, {})).map(([name, value], index) => ({ name, value, color: ["#f43f5e", "#f97316", "#eab308", "#06b6d4"][index % 4] }));
  const hourlyData = history.map((point) => ({ time: point.time, volume: point.transactions, blocked: point.fraud }));

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex items-center space-x-3 mb-2">
        <BarChart3 className="w-8 h-8 text-fuchsia-500 drop-shadow-[0_0_10px_rgba(217,70,239,0.8)]" />
        <h1 className="text-3xl font-bold text-white drop-shadow-md">Analytics Deep-Dive</h1>
      </div>
      {error && <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        <GlassCard className="h-[450px] flex flex-col">
          <h2 className="text-lg font-semibold text-white mb-6">Fraud Typology Breakdown</h2>
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Pie
                  data={fraudTypes}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {fraudTypes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-3xl font-bold text-white">{metrics.fraudRate.toFixed(2)}%</p>
                <p className="text-xs text-slate-400">Total Fraud Rate</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-4 flex-wrap">
             {fraudTypes.map((type) => (
               <div key={type.name} className="flex items-center gap-2 text-sm text-slate-300">
                 <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: type.color }} />
                 {type.name}
               </div>
             ))}
          </div>
        </GlassCard>

        <GlassCard className="h-[450px] flex flex-col">
          <h2 className="text-lg font-semibold text-white mb-6">Hourly Volume vs Blocked</h2>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                />
                <Bar dataKey="volume" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Volume" />
                <Bar dataKey="blocked" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Blocked" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
