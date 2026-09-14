"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AuthGate } from "./AuthGate";
import { LiveProvider, useLive } from "../live/LiveContext";
import { HUDAmbientLayer, BootSequence, TelemetryTicker } from "../hud/HUDAmbientLayer";

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { events, isConnected, demo } = useLive();
  const [booting, setBooting] = useState(false);

  // Boot sequence runs on EVERY full page load, but not twice within 45s
  // (so client-side navigation + quick back-nav doesn't replay it).
  useEffect(() => {
    const last = Number(localStorage.getItem("sentinel_boot_at") ?? 0);
    if (Date.now() - last > 45_000) {
      localStorage.setItem("sentinel_boot_at", String(Date.now()));
      const t = setTimeout(() => setBooting(true), 0);
      return () => clearTimeout(t);
    }
  }, []);

  // Telemetry ticker items — derived from the live stream, throttled by memo.
  const tickerItems = useMemo(() => {
    const items: string[] = [
      "SENTINEL TELEMETRY LINK ACTIVE",
      `DECISIONS BUFFERED: ${events.length}`,
      isConnected ? "WS UPLINK: STABLE" : "WS UPLINK: RECONNECTING",
    ];
    for (const e of events.slice(0, 8)) {
      const ip = e.ip_address ?? "unknown";
      const score = e.risk_score?.toFixed(1) ?? "—";
      items.push(`${e.action ?? "ALLOW"} · ${ip} · RISK ${score}`);
    }
    if (demo) items.push("DEMO MODE — SIMULATED TELEMETRY");
    return items;
  }, [events, isConnected, demo]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#020617] text-slate-50">
      <Sidebar />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Ambient aurora glows — two counter-rotating light fields */}
        <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[40%] w-[40%] animate-[aurora_14s_ease-in-out_infinite_alternate] rounded-full bg-indigo-500/10 blur-[80px] will-change-transform" />
        <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] animate-[aurora_18s_ease-in-out_infinite_alternate-reverse] rounded-full bg-cyan-500/10 blur-[80px] will-change-transform" />
        {/* Ambient panning grid — barely visible, adds depth */}
        <div className="bg-grid bg-grid-animated pointer-events-none absolute inset-0 opacity-[0.35]" />

        {/* JARVIS HUD ambient layer: particles + corner brackets + CRT sweep */}
        <HUDAmbientLayer />

        <TopBar events={events} isConnected={isConnected} demo={demo} />
        <main className="relative z-0 flex-1 overflow-auto">
          {/* Demo-mode banner — honest about what's powering the visuals */}
          {demo && (
            <div className="flex items-center justify-center gap-2 border-b border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs text-cyan-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
              <span className="font-semibold tracking-wide">DEMO MODE</span>
              <span className="text-cyan-400/70">
                — simulated live telemetry (no backend connected). Run the platform locally for real data.
              </span>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
              transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
          {/* Bottom breathing room so the fixed ticker never covers content */}
          <div className="h-8" aria-hidden="true" />
        </main>

        {/* Bottom telemetry ticker — live decisions scrolling by */}
        <TelemetryTicker items={tickerItems} />
      </div>

      {/* Stark boot sequence (once per session, first authenticated load) */}
      {booting && <BootSequence onDone={() => setBooting(false)} />}
    </div>
  );
}

/**
 * Full application chrome. Login bypasses the shell; everything else gets
 * sidebar + topbar + page transitions, with ONE shared live-telemetry feed.
 *
 * NOTE: the pathname check normalizes trailing slashes — the static export
 * uses trailingSlash:true, so usePathname() returns "/login/" while dev/SSR
 * return "/login". Both must bypass the AuthGate.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login" || pathname === "/login/";
  if (isLogin) return <>{children}</>;

  return (
    <AuthGate>
      <LiveProvider>
        <Shell>{children}</Shell>
      </LiveProvider>
    </AuthGate>
  );
}
