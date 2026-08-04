"use client"
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShieldAlert, Activity, BarChart3, Settings } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/threats", label: "Threat Intel", icon: ShieldAlert },
  { href: "/transactions", label: "Transactions", icon: Activity },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/system", label: "System Health", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 glass-panel border-r border-white/10 flex flex-col h-full z-10 relative bg-[#020617]/80">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          SENTINEL
        </h1>
        <p className="text-xs text-slate-400 mt-1">v2.0.0 Command Center</p>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                isActive 
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              <Icon size={18} />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm text-slate-400">System Online</span>
        </div>
      </div>
    </aside>
  );
}
