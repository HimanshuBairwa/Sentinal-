"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface TransactionAreaChartProps {
  data: { time: string; transactions: number; fraud: number }[];
}

export function TransactionAreaChart({ data }: TransactionAreaChartProps) {
  return (
    <div className="w-full h-full relative">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorTransactions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorFraud" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#64748b" 
            tick={{ fill: '#64748b', fontSize: 12 }} 
            tickLine={false} 
            axisLine={false} 
          />
          <YAxis 
            stroke="#64748b" 
            tick={{ fill: '#64748b', fontSize: 12 }} 
            tickLine={false} 
            axisLine={false}
            tickFormatter={(val) => `${val >= 1000 ? (val/1000).toFixed(1) + 'k' : val}`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(15, 23, 42, 0.8)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '12px', 
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
            }}
            itemStyle={{ color: '#f8fafc', fontWeight: 600 }}
            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
          />
          <Area 
            type="monotone" 
            dataKey="transactions" 
            stroke="#0ea5e9" 
            strokeWidth={3} 
            fillOpacity={1} 
            fill="url(#colorTransactions)" 
            animationDuration={300}
          />
          <Area 
            type="monotone" 
            dataKey="fraud" 
            stroke="#f43f5e" 
            strokeWidth={3} 
            fillOpacity={1} 
            fill="url(#colorFraud)" 
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
