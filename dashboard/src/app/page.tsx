"use client"
import { Activity, AlertTriangle, ShieldCheck, Zap } from "lucide-react";
import { MetricCard } from "../components/ui/MetricCard";
import { GlassCard } from "../components/ui/GlassCard";
import { useAnalytics } from "../hooks/useAnalytics";
import { TransactionAreaChart } from "../components/charts/TransactionAreaChart";
import { LiveThreatFeed } from "../components/feed/LiveThreatFeed";
import { motion } from "framer-motion";

export default function CommandCenter() {
  const { metrics, history, events, isConnected } = useAnalytics();

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between border-b border-white/5 pb-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-400" />
            Command Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">Real-time global fraud monitoring</p>
        </div>
        <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
          <div className="relative flex h-3 w-3">
            {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
          </div>
          <span className={`text-xs font-semibold tracking-wider ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
            {isConnected ? 'SYSTEM ONLINE' : 'CONNECTION LOST'}
          </span>
        </div>
      </motion.div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">

        {/* Main Chart - Spans 8 columns */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <GlassCard title="Global Transaction Volume vs Fraud" className="h-[420px]" premium>
            {history.length > 0 ? (
              <TransactionAreaChart data={history} />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">
                Awaiting telemetry...
              </div>
            )}
          </GlassCard>

          {/* Top Row of Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <MetricCard
              title="Total Processed"
              value={metrics.totalTransactions}
              icon={<Activity size={24} />}
              trend={{ value: 12.5, isPositive: true }}
              delay={0.1}
            />
            <MetricCard
              title="Fraud Rate"
              value={metrics.fraudRate}
              format="percent"
              icon={<AlertTriangle size={24} />}
              trend={{ value: 0.2, isPositive: false }}
              delay={0.2}
            />
          </div>
        </div>

        {/* Right Sidebar - Spans 4 columns */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6">
            <MetricCard
              title="Active Alerts"
              value={metrics.activeAlerts}
              icon={<Zap size={24} />}
              delay={0.3}
            />
            <MetricCard
              title="System Load"
              value={metrics.systemLoad}
              format="percent"
              icon={<ShieldCheck size={24} />}
              delay={0.4}
            />
          </div>

          <GlassCard title="Live Threat Feed" className="flex-1 min-h-[300px]" premium>
            <LiveThreatFeed events={events} />
          </GlassCard>
        </div>

      </div>
    </div>
  );
}
