"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Search,
  LogOut,
  UserCircle,
  ChevronDown,
  Command,
  AlertOctagon,
  AlertTriangle,
  Check,
  ExternalLink,
  FlaskConical,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AnalyticsEvent } from "../../hooks/useAnalytics";

/** Live system status pill fed by the real WebSocket state. */
function LiveStatusPill({ isConnected }: { isConnected: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md transition-colors duration-500 ${
        isConnected
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
          : "border-rose-500/30 bg-rose-500/10 text-rose-400"
      }`}
    >
      <span className={`relative flex h-2 w-2 status-dot-live ${isConnected ? "text-emerald-400" : "text-rose-400"}`}>
        <span className="h-2 w-2 rounded-full bg-current" />
      </span>
      <span className="text-[11px] font-semibold tracking-wider">
        {isConnected ? "LIVE" : "OFFLINE"}
      </span>
    </div>
  );
}

type NavTarget = { label: string; href: string };

/** Command palette (⌘K) with fuzzy search over nav targets + live threat IPs. */
function CommandPalette({
  open,
  onClose,
  navTargets,
  events,
}: {
  open: boolean;
  onClose: () => void;
  navTargets: NavTarget[];
  events: AnalyticsEvent[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setQuery("");
    onClose();
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nav = navTargets
      .filter((t) => !q || t.label.toLowerCase().includes(q) || t.href.toLowerCase().includes(q))
      .map((t) => ({ kind: "nav" as const, ...t }));
    const ips = q
      ? events
          .filter((e) => e.ip_address?.toLowerCase().includes(q) || e.user_id?.toLowerCase().includes(q))
          .slice(0, 5)
          .map((e) => ({
            kind: "entity" as const,
            label: `${e.ip_address ?? "unknown"} · ${e.action ?? e.event_type}`,
            href: `/threats?q=${encodeURIComponent(e.ip_address ?? "")}`,
            ip: e.ip_address,
          }))
      : [];
    return [...nav, ...ips].slice(0, 8);
  }, [query, navTargets, events]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp selection to the result set; avoids an effect + setState reset.
  const clampedSelected = Math.min(selected, Math.max(0, results.length - 1));

  const go = (href: string) => {
    close();
    router.push(href);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[15vh]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelected((s) => Math.min(s + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelected((s) => Math.max(s - 1, 0));
                  } else if (e.key === "Enter" && results[clampedSelected]) {
                    go(results[clampedSelected].href);
                  } else if (e.key === "Escape") {
                    close();
                  }
                }}
                placeholder="Search pages, IPs, users…"
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                ESC
              </kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="p-6 text-center text-sm text-slate-500">No matches for “{query}”</p>
              )}
              {results.map((r, i) => (
                <button
                  key={`${r.kind}-${r.href}-${i}`}
                  onClick={() => go(r.href)}
                  onMouseEnter={() => setSelected(i)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    i === clampedSelected ? "bg-cyan-500/10 text-cyan-300" : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {r.kind === "nav" ? <Command className="h-3.5 w-3.5 opacity-60" /> : <ExternalLink className="h-3.5 w-3.5 opacity-60" />}
                    {r.label}
                  </span>
                  {i === clampedSelected && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Notification feed: recent BLOCK/CHALLENGE decisions from the live stream. */
function NotificationsDropdown({ events }: { events: AnalyticsEvent[] }) {
  const [open, setOpen] = useState(false);
  const alerts = events
    .filter((e) => e.action === "BLOCK" || e.action === "CHALLENGE")
    .slice(0, 8);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
      >
        <Bell size={18} />
        {alerts.length > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white"
          >
            {alerts.length > 9 ? "9+" : alerts.length}
          </motion.span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
            >
              <div className="border-b border-white/5 px-4 py-3">
                <p className="text-sm font-semibold text-slate-200">Active Threat Alerts</p>
                <p className="text-[11px] text-slate-500">BLOCK & CHALLENGE decisions from the live stream</p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {alerts.length === 0 && (
                  <p className="p-6 text-center text-sm text-slate-500">No active alerts. All clear.</p>
                )}
                {alerts.map((a) => (
                  <Link
                    key={a.id ?? a.event_id}
                    href="/threats"
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    {a.action === "BLOCK" ? (
                      <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">
                        {a.action} · score {a.risk_score?.toFixed(1) ?? "-"}
                      </p>
                      <p className="truncate font-mono text-[11px] text-slate-500">{a.ip_address ?? "unknown source"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** User menu with logout. */
function UserMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function logout() {
    window.localStorage.removeItem("sentinel_access_token");
    window.localStorage.removeItem("sentinel_refresh_token");
    router.replace("/login");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
      >
        <UserCircle size={20} />
        <span className="text-sm font-medium">Operator</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl shadow-black/50 backdrop-blur-xl"
            >
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-rose-300 transition-colors hover:bg-rose-500/10"
              >
                <LogOut size={15} /> Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const NAV_TARGETS: NavTarget[] = [
  { label: "Command Center", href: "/" },
  { label: "Threat Intel", href: "/threats" },
  { label: "Rules Engine", href: "/rules" },
  { label: "Transactions", href: "/transactions" },
  { label: "Analytics", href: "/analytics" },
  { label: "System Health", href: "/system" },
];

export function TopBar({ events = [], isConnected = false, demo = false }: { events?: AnalyticsEvent[]; isConnected?: boolean; demo?: boolean }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/10 bg-[#020617]/50 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex w-[380px] items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-1.5 text-left transition-colors hover:border-cyan-500/30"
        >
          <Search size={16} className="text-slate-400" />
          <span className="flex-1 text-sm text-slate-500">Search transactions, IP addresses, rules…</span>
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-4">
        {demo ? (
          <div className="flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            <FlaskConical size={13} />
            <span className="text-[11px] font-semibold tracking-wider">DEMO</span>
          </div>
        ) : (
          <LiveStatusPill isConnected={isConnected} />
        )}
        <div className="h-6 w-px bg-white/10" />
        <NotificationsDropdown events={events} />
        <div className="h-6 w-px bg-white/10" />
        <UserMenu />
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        navTargets={NAV_TARGETS}
        events={events}
      />
    </header>
  );
}
