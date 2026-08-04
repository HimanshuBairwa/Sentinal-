"use client";

import { useAnalytics } from "../../hooks/useAnalytics";
import { GlassCard } from "../../components/ui/GlassCard";
import { Server, Cpu, Database, Network } from "lucide-react";
import { clsx } from "clsx";

const SERVICE_NAMES = [
  { name: 'Gateway Proxy', status: 'healthy', latency: '12ms', icon: Network, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  { name: 'Auth Service', status: 'healthy', latency: '24ms', icon: Server, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { name: 'Risk Engine (ML)', status: 'heavy_load', latency: '145ms', icon: Cpu, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { name: 'ClickHouse OLAP', status: 'healthy', latency: '4ms', icon: Database, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { name: 'Redis Cache', status: 'healthy', latency: '1ms', icon: Database, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  { name: 'Kafka Cluster', status: 'healthy', latency: '8ms', icon: Network, color: 'text-orange-400', bg: 'bg-orange-500/10' },
];

export default function SystemPage() {
  const { isConnected, error } = useAnalytics();

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-3">
          <Server className="w-8 h-8 text-emerald-500 drop-shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
          <h1 className="text-3xl font-bold text-white drop-shadow-md">System Health</h1>
        </div>
        
        <div className={clsx(
          "px-4 py-2 rounded-full border text-sm font-medium flex items-center gap-2",
          isConnected ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-rose-500/10 border-rose-500/30 text-rose-400"
        )}>
          <div className={clsx("w-2 h-2 rounded-full", isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400")} />
          {isConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'}
        </div>
      </div>
      {error && <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">Telemetry degraded: {error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {SERVICE_NAMES.map((service) => {
          const Icon = service.icon;
          return (
            <GlassCard key={service.name} className="p-6 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: service.status === 'healthy' ? '#10b981' : '#f59e0b' }} />
              
              <div className="flex justify-between items-start mb-6">
                <div className={clsx("p-3 rounded-xl", service.bg)}>
                  <Icon className={clsx("w-6 h-6", service.color)} />
                </div>
                <div className={clsx(
                  "px-2 py-1 rounded-md text-xs font-semibold border",
                  service.status === 'healthy' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                )}>
                  {service.status === 'healthy' ? 'OPTIMAL' : 'HEAVY LOAD'}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white mb-1">{service.name}</h3>
                <div className="flex items-center gap-4 text-sm mt-4">
                  <div>
                    <p className="text-slate-500 mb-1">Latency</p>
                    <p className="text-slate-200 font-mono">{service.latency}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Uptime</p>
                    <p className="text-slate-200 font-mono">99.99%</p>
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
