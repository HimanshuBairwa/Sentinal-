"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, ShieldAlert, Activity, BarChart3, Settings, Workflow } from "lucide-react";
import { BrandMark } from "../brand/BrandMark";

const navItems = [
  { href: "/", label: "Command Center", icon: LayoutDashboard, hint: "Live overview" },
  { href: "/threats", label: "Threat Intel", icon: ShieldAlert, hint: "Map & feed" },
  { href: "/rules", label: "Rules Engine", icon: Workflow, hint: "Manage policy" },
  { href: "/transactions", label: "Transactions", icon: Activity, hint: "Event ledger" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, hint: "Deep-dive" },
  { href: "/system", label: "System Health", icon: Settings, hint: "Services" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="glass-panel relative z-10 flex h-full w-64 flex-col border-r border-white/10 bg-[#020617]/80">
      <div className="border-b border-white/10 p-6">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <h1
              className="glitch text-lg font-bold tracking-wide"
              data-text="SENTINEL"
            >
              <span className="bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-transparent">SENTINEL</span>
            </h1>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Fraud Intelligence
            </p>
          </div>
        </div>
      </div>

      <nav className="relative flex-1 space-y-1 p-4">
        {/* Technical tick rail down the nav — flight-instrument feel */}
        <span className="hud-ticks-y absolute right-2 top-6 bottom-6 opacity-70" aria-hidden="true" />
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname === `${item.href}/`;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-lg px-4 py-2.5 transition-colors duration-200 ${
                isActive ? "text-cyan-300" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active-bg"
                  className="absolute inset-0 rounded-lg border border-cyan-500/30 bg-cyan-500/10"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon size={18} className="relative z-10 shrink-0 transition-transform duration-300 group-hover:scale-110" />
              <span className="relative z-10 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span
                  className={`block text-[10px] transition-opacity ${
                    isActive ? "text-cyan-500/70" : "text-slate-600 group-hover:text-slate-500"
                  }`}
                >
                  {item.hint}
                </span>
              </span>
              {isActive && (
                <motion.span
                  layoutId="nav-active-marker"
                  className="absolute right-3 z-10 h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Equalizer bars — the “system is listening” indicator */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-lg bg-emerald-500/5 px-4 py-2.5">
          <div className="flex h-4 items-end gap-[2px]" aria-hidden="true">
            {[0.9, 0.7, 1.15, 0.85, 1.0].map((d, i) => (
              <span
                key={i}
                className="eq-bar h-full w-[3px] rounded-sm bg-emerald-400/70"
                style={{ animationDuration: `${d}s`, animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
          <span className="text-xs text-slate-400">All services operational</span>
        </div>
      </div>
    </aside>
  );
}
