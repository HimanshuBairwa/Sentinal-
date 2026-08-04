"use client";
import { Bell, Search, UserCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function TopBar() {
  const router = useRouter();
  function logout() {
    window.localStorage.removeItem("sentinel_access_token");
    window.localStorage.removeItem("sentinel_refresh_token");
    router.replace("/login");
  }
  return (
    <header className="h-16 glass-panel border-b border-white/10 flex items-center justify-between px-6 sticky top-0 z-10 bg-[#020617]/50 backdrop-blur-xl">
      <div className="flex items-center bg-black/20 rounded-lg px-3 py-1.5 border border-white/5 w-96">
        <Search size={16} className="text-slate-400 mr-2" />
        <input 
          type="text" 
          placeholder="Search transactions, IP addresses, rules..." 
          className="bg-transparent border-none outline-none text-sm text-slate-200 w-full placeholder:text-slate-500"
        />
      </div>
      
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-400 hover:text-slate-200 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <div className="h-6 w-px bg-white/10 mx-1" />
        <button className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors">
          <UserCircle size={20} />
          <span className="text-sm font-medium">Operator</span>
        </button>
        <button onClick={logout} aria-label="Sign out" className="p-2 text-slate-400 transition-colors hover:text-rose-300"><LogOut size={18} /></button>
      </div>
    </header>
  );
}
