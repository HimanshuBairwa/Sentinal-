"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AuthGate } from "./AuthGate";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;

  return (
    <AuthGate><div className="flex h-screen bg-[#020617] overflow-hidden text-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Ambient background glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
        
        <TopBar />
        <main className="flex-1 overflow-auto p-6 z-0">
          {children}
        </main>
      </div>
    </div></AuthGate>
  );
}
