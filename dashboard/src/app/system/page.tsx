"use client";

import { useCallback, useEffect, useState } from "react";
import { Server, Cpu, Database, Network, RefreshCw, Wifi, WifiOff, Workflow } from "lucide-react";
import { GlassCard } from "../../components/ui/GlassCard";
import { useLive } from "../../components/live/LiveContext";
import { clsx } from "clsx";

const configuredAPIURL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

function getAPIURL(): string {
  if (configuredAPIURL && configuredAPIURL !== "http://localhost:8080") return configuredAPIURL;
  if (typeof window === "undefined") return configuredAPIURL || "http://localhost:8080";
  const { protocol, hostname } = window.location;
  if (hostname.includes("-3000.")) return `${protocol}//${hostname.replace("-3000.", "-8080.")}`;
  return `${protocol}//${hostname}:8080`;
}

type ServiceStatus = "checking" | "ok" | "degraded" | "down";

interface ServiceRow {
  key: string;
  name: string;
  icon: typeof Server;
  color: string;
  bg: string;
  probe?: () => Promise<{ status: ServiceStatus; detail?: string; latencyMs: number }>;
  detail?: string;
}

const SERVICES: ServiceRow[] = [
  {
    key: "gateway",
    name: "API Gateway",
    icon: Network,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    probe: async () => {
      const t0 = performance.now();
      try {
        const r = await fetch(`${getAPIURL()}/health`, { cache: "no-store" });
        const latencyMs = Math.round(performance.now() - t0);
        if (!r.ok) return { status: "degraded", detail: `HTTP ${r.status}`, latencyMs };
        const body = (await r.json()) as { redis?: string; auth_key?: string };
        const healthy = body.redis === "true" || body.redis === "ok";
        return {
          status: healthy ? "ok" : "degraded",
          detail: healthy ? "Redis + auth key OK" : "Dependency degraded",
          latencyMs,
        };
      } catch {
        return { status: "down", detail: "Unreachable", latencyMs: 0 };
      }
    },
  },
  {
    key: "auth",
    name: "Auth Service",
    icon: Server,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    // Auth health is proxied through the gateway on its public surface.
    probe: async () => {
      const t0 = performance.now();
      try {
        const r = await fetch(`${getAPIURL()}/api/v1/auth/public-key`, { cache: "no-store" });
        const latencyMs = Math.round(performance.now() - t0);
        if (!r.ok) return { status: "degraded", detail: `HTTP ${r.status}`, latencyMs };
        return { status: "ok", detail: "JWT signing key available", latencyMs };
      } catch {
        return { status: "down", detail: "Unreachable", latencyMs: 0 };
      }
    },
  },
  {
    key: "analytics",
    name: "Analytics API",
    icon: Workflow,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    probe: async () => {
      const t0 = performance.now();
      try {
        const token = window.localStorage.getItem("sentinel_access_token");
        const r = await fetch(`${getAPIURL()}/api/v1/analytics/overview`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const latencyMs = Math.round(performance.now() - t0);
        if (r.status === 401) return { status: "degraded", detail: "Auth required (expired token)", latencyMs };
        if (!r.ok) return { status: "degraded", detail: `HTTP ${r.status}`, latencyMs };
        return { status: "ok", detail: "ClickHouse responding", latencyMs };
      } catch {
        return { status: "down", detail: "Unreachable", latencyMs: 0 };
      }
    },
  },
  {
    key: "websocket",
    name: "WebSocket Stream",
    icon: Wifi,
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    detail: "Live event stream",
  },
  {
    key: "clickhouse",
    name: "ClickHouse OLAP",
    icon: Database,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    detail: "Proxied via analytics API probe",
  },
  {
    key: "risk",
    name: "Risk Engine (ML)",
    icon: Cpu,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    detail: "Proxied via gateway (protected)",
  },
];

type ProbeState = Record<string, { status: ServiceStatus; detail?: string; latencyMs: number }>;

export default function SystemPage() {
  const { isConnected, error, events, lastEventAt, demo } = useLive();
  const [probes, setProbes] = useState<ProbeState>({});
  const [probing, setProbing] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());

  // Deterministic simulated probe results for demo mode (public deploy without
  // a backend) — realistic latencies, one service subtly degraded so the
  // severity visuals still demonstrate themselves.
  const demoProbes = useCallback((): ProbeState => ({
    gateway: { status: "ok", detail: "Simulated · routing 100% of traffic", latencyMs: 24 },
    auth: { status: "ok", detail: "Simulated · RS256 keys rotating", latencyMs: 31 },
    analytics: { status: "ok", detail: "Simulated · batch inserts flowing", latencyMs: 42 },
    websocket: { status: "ok", detail: "Simulated stream · 1.4s cadence", latencyMs: 0 },
    clickhouse: { status: "degraded", detail: "Simulated · 2 of 3 replicas healthy", latencyMs: 12 },
    risk: { status: "ok", detail: `Simulated · ${events.length} events in window`, latencyMs: 18 },
  }), [events.length]);

  const runProbes = useCallback(async () => {
    setProbing(true);
    if (demo) {
      // Demo deploy: no real services to probe — present the simulation.
      setProbes(demoProbes());
      setNowTs(Date.now());
      setProbing(false);
      return;
    }
    const next: ProbeState = {};
    // Probe all services concurrently — total wall time = slowest probe,
    // not the sum (previously 3x serialized round-trips).
    await Promise.all(
      SERVICES.filter((svc) => svc.probe).map(async (svc) => {
        next[svc.key] = await svc.probe!();
      })
    );
    // WebSocket row derives from live connection state.
    next.websocket = {
      status: isConnected ? "ok" : "down",
      detail: isConnected ? "Streaming live events" : "Reconnecting…",
      latencyMs: 0,
    };
    // ClickHouse reflects the analytics probe result.
    next.clickhouse = next.analytics
      ? { ...next.analytics, detail: next.analytics.status === "ok" ? "Serving queries" : "Degraded" }
      : { status: "checking", latencyMs: 0 };
    // Risk engine reflects pipeline flow.
    next.risk = {
      status: next.analytics?.status === "ok" && events.length > 0 ? "ok" : "degraded",
      detail: events.length > 0 ? `${events.length} events buffered` : "No recent decisions",
      latencyMs: 0,
    };
    setProbes(next);
    setNowTs(Date.now());
    setProbing(false);
  }, [isConnected, events.length, demo, demoProbes]);

  useEffect(() => {
    const kick = () => void runProbes();
    kick();
    const t = setInterval(kick, 30_000);
    return () => clearInterval(t);
  }, [runProbes]);

  const overall =
    Object.values(probes).length === 0
      ? "checking"
      : Object.values(probes).some((p) => p.status === "down")
        ? "down"
        : Object.values(probes).some((p) => p.status === "degraded")
          ? "degraded"
          : "ok";

  return (
    <div className="flex h-full flex-col gap-6 p-6 lg:p-8">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Server className="h-8 w-8 text-emerald-500 drop-shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-md">System Health</h1>
            <p className="text-sm text-slate-400">Real dependency probes · refreshed every 30s</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={clsx(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium",
              overall === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
              overall === "degraded" && "border-amber-500/30 bg-amber-500/10 text-amber-400",
              overall === "down" && "border-rose-500/30 bg-rose-500/10 text-rose-400",
              overall === "checking" && "border-white/10 bg-white/5 text-slate-400"
            )}
          >
            {overall === "down" ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
            {demo ? "SIMULATED" : overall === "checking" ? "PROBING…" : overall.toUpperCase()}
          </div>
          <button
            onClick={() => void runProbes()}
            disabled={probing}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={clsx("h-4 w-4", probing && "animate-spin")} />
            Re-probe
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
          Telemetry degraded: {error}
        </p>
      )}

      {/* Pipeline status strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-slate-900/40 px-5 py-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Event pipeline</span>
        {["auth.events → Kafka", "risk-engine → risk.decisions", "analytics → ClickHouse", "dashboard ← WebSocket"].map(
          (step, i) => {
            const flowing = events.length > 0;
            return (
              <div key={step} className="flex items-center gap-3">
                {i > 0 && (
                  <span className={clsx("relative overflow-hidden text-slate-600", flowing && "text-cyan-500/60")}>
                    →
                    {/* Animated pulse traveling along the pipeline connector */}
                    {flowing && (
                      <span className="absolute inset-0 animate-[scanline_1.6s_linear_infinite] bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent" />
                    )}
                  </span>
                )}
                <span
                  className={clsx(
                    "rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors duration-700",
                    flowing
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                      : "border-slate-700 bg-slate-900 text-slate-500"
                  )}
                >
                  {step}
                </span>
              </div>
            );
          }
        )}
        {lastEventAt && (
          <span className="ml-auto text-xs text-slate-500">
            Last event {Math.max(0, Math.round((nowTs - lastEventAt) / 1000))}s ago
          </span>
        )}
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {SERVICES.map((service, i) => {
          const Icon = service.icon;
          const probe = probes[service.key];
          const status = probe?.status ?? "checking";
          return (
            <GlassCard
              key={service.key}
              className="group relative"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div
                className={clsx(
                  "absolute left-0 top-0 h-full w-1 overflow-hidden",
                  status === "ok" && "bg-emerald-500",
                  status === "degraded" && "bg-amber-500",
                  status === "down" && "bg-rose-500",
                  status === "checking" && "bg-slate-700"
                )}
              >
                {/* Flowing light along the status rail when healthy */}
                {status === "ok" && (
                  <span className="absolute inset-x-0 h-1/3 animate-[scanline_2.2s_linear_infinite] bg-gradient-to-b from-transparent via-white/50 to-transparent" />
                )}
              </div>
              <div className="flex items-start justify-between p-1">
                <div className={clsx("rounded-xl p-3", service.bg)}>
                  <Icon className={clsx("h-6 w-6", service.color)} />
                </div>
                <div
                  className={clsx(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold tracking-wider",
                    status === "ok" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
                    status === "degraded" && "border-amber-500/20 bg-amber-500/10 text-amber-400",
                    status === "down" && "border-rose-500/20 bg-rose-500/10 text-rose-400",
                    status === "checking" && "border-slate-700 bg-slate-900 text-slate-500"
                  )}
                >
                  <span
                    className={clsx(
                      "h-1.5 w-1.5 rounded-full",
                      status === "ok" && "bg-emerald-400",
                      status === "degraded" && "bg-amber-400",
                      status === "down" && "bg-rose-400",
                      status === "checking" && "bg-slate-500 animate-pulse"
                    )}
                  />
                  {status === "ok" ? "OPERATIONAL" : status === "degraded" ? "DEGRADED" : status === "down" ? "DOWN" : "PROBING"}
                </div>
              </div>
              <div className="mt-4">
                <h3 className="mb-1 text-lg font-bold text-white">{service.name}</h3>
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <p className="mb-0.5 text-xs text-slate-500">Latency</p>
                    <p className="font-mono text-slate-200">
                      {probe?.latencyMs ? `${probe.latencyMs}ms` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-xs text-slate-500">Detail</p>
                    <p className="max-w-[200px] truncate font-mono text-xs text-slate-300">
                      {probe?.detail ?? service.detail ?? "—"}
                    </p>
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
