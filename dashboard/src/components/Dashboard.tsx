'use client';
import { useWebSocket } from '../hooks/useWebSocket';
import { useStore } from '../store/store';
import { SlotCounter } from './SlotCounter';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ShieldAlert, Activity, Wifi, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

export function Dashboard() {
  useWebSocket('mock');
  const { isConnected, activeUsers, fraudAlerts, transactions } = useStore();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600/30 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-cyan-600/20 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />

      <header className="flex justify-between items-center mb-8 relative z-10 glass-panel p-4 rounded-2xl">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-indigo-500/20 rounded-xl">
            <ShieldAlert className="w-8 h-8 text-indigo-400 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">Sentinel Fraud Platform</h1>
            <p className="text-sm text-slate-400">Real-time threat monitoring</p>
          </div>
        </div>
        <div className={cn("flex items-center space-x-2 px-4 py-2 rounded-full border backdrop-blur-md", isConnected ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "bg-rose-500/10 border-rose-500/30 text-rose-400")}>
          {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          <span className="text-sm font-medium">{isConnected ? 'Live' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 relative z-10">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel p-6 rounded-3xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-400 font-medium">Active Connections</p>
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <SlotCounter value={activeUsers} />
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="glass-panel p-6 rounded-3xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-400 font-medium">Fraud Alerts Detected</p>
            <ShieldAlert className="w-5 h-5 text-rose-400" />
          </div>
          <div className="flex space-x-1 h-12 text-4xl font-bold font-mono text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.6)]">
            {fraudAlerts}
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="glass-panel p-6 rounded-3xl h-[400px] relative z-10">
        <h2 className="text-lg font-semibold text-white mb-6">Transaction Volume</h2>
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={transactions}>
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="amount" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
