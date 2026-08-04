"use client";

import { useAnalytics } from "../../hooks/useAnalytics";
import { LiveThreatFeed } from "../../components/feed/LiveThreatFeed";
import { GlassCard } from "../../components/ui/GlassCard";
import { ShieldAlert, Activity } from "lucide-react";

export default function ThreatsPage() {
  const { events } = useAnalytics();

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex items-center space-x-3 mb-2">
        <ShieldAlert className="w-8 h-8 text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
        <h1 className="text-3xl font-bold text-white drop-shadow-md">Threat Intelligence</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <GlassCard className="flex-1 min-h-[400px] flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Global Threat Map
            </h2>
            <div className="flex-1 flex items-center justify-center border border-slate-700/50 rounded-xl bg-slate-900/50 relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg')] bg-no-repeat bg-center bg-contain opacity-20 filter invert" />
              <div className="absolute top-1/3 left-1/4 w-3 h-3 bg-rose-500 rounded-full animate-ping" />
              <div className="absolute top-1/2 left-2/3 w-3 h-3 bg-amber-500 rounded-full animate-ping" style={{ animationDelay: '1s' }} />
              <div className="absolute top-2/3 left-1/3 w-3 h-3 bg-rose-500 rounded-full animate-ping" style={{ animationDelay: '2.5s' }} />
              <p className="text-slate-500 z-10 font-mono text-sm">Real-time geospatial tracking active</p>
            </div>
          </GlassCard>
        </div>

        <GlassCard className="h-full max-h-[800px] flex flex-col">
          <h2 className="text-lg font-semibold text-white mb-4">Live Threat Stream</h2>
          <div className="flex-1 overflow-hidden">
            <LiveThreatFeed events={events} />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
