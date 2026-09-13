"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWebSocket } from "./useWebSocket";

export type AnalyticsOverview = {
  total_events: number;
  fraud_events: number;
  fraud_rate: number;
};

export type AnalyticsEvent = {
  id?: string;
  event_id?: string;
  event_type: string;
  user_id?: string;
  ip_address?: string;
  timestamp: string;
  action?: string;
  risk_score?: number;
};

export type AnalyticsMetrics = {
  totalTransactions: number;
  fraudRate: number;
  activeAlerts: number;
  systemLoad: number;
};

const configuredAPIURL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

function getAPIURL(): string {
  if (configuredAPIURL && configuredAPIURL !== "http://localhost:8080") return configuredAPIURL;
  if (typeof window === "undefined") return configuredAPIURL || "http://localhost:8080";
  const { protocol, hostname } = window.location;
  if (hostname.includes("-3000.")) {
    return `${protocol}//${hostname.replace("-3000.", "-8080.")}`;
  }
  return `${protocol}//${hostname}:8080`;
}

function authHeaders(): HeadersInit {
  const token = typeof window === "undefined" ? null : window.localStorage.getItem("sentinel_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchWithRefresh(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, { ...init, headers: { ...authHeaders(), ...(init.headers ?? {}) } });
  if (response.status !== 401 || typeof window === "undefined") return response;
  const refreshToken = window.localStorage.getItem("sentinel_refresh_token");
  if (!refreshToken) return response;
  const refresh = await fetch(`${getAPIURL()}/api/v1/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }) });
  if (!refresh.ok) return response;
  const pair = await refresh.json() as { access_token: string; refresh_token: string };
  window.localStorage.setItem("sentinel_access_token", pair.access_token);
  window.localStorage.setItem("sentinel_refresh_token", pair.refresh_token);
  return fetch(input, { ...init, headers: { ...authHeaders(), ...(init.headers ?? {}) } });
}

function websocketURL(): string | null {
  if (typeof window === "undefined") return null;
  const base = getAPIURL().replace(/^http/, "ws");
  const token = window.localStorage.getItem("sentinel_access_token");
  return token ? `${base}/api/v1/analytics/ws?access_token=${encodeURIComponent(token)}` : null;
}

export function useAnalytics() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: liveEvent, isConnected } = useWebSocket<AnalyticsEvent>(websocketURL());

  const refresh = useCallback(async () => {
    try {
      const [overviewResponse, eventsResponse] = await Promise.all([
        fetchWithRefresh(`${getAPIURL()}/api/v1/analytics/overview`, { cache: "no-store" }),
        fetchWithRefresh(`${getAPIURL()}/api/v1/analytics/events?limit=50`, { cache: "no-store" }),
      ]);
      if (!overviewResponse.ok || !eventsResponse.ok) throw new Error("Analytics API unavailable");
      setOverview((await overviewResponse.json()) as AnalyticsOverview);
      setEvents((await eventsResponse.json()) as AnalyticsEvent[]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analytics API unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!liveEvent) return;
    queueMicrotask(() => setEvents((current) => [liveEvent, ...current.filter((event) => (event.id ?? event.event_id) !== (liveEvent.id ?? liveEvent.event_id))].slice(0, 50)));
  }, [liveEvent]);

  const metrics = useMemo<AnalyticsMetrics>(() => ({
    totalTransactions: overview?.total_events ?? 0,
    fraudRate: overview?.fraud_rate ?? 0,
    activeAlerts: events.filter((event) => event.action === "BLOCK" || event.action === "CHALLENGE").length,
    systemLoad: 0,
  }), [events, overview]);

  const history = useMemo(() => events.slice().reverse().map((event) => ({
    time: new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    transactions: 1,
    fraud: event.action === "BLOCK" || event.action === "CHALLENGE" ? 1 : 0,
  })), [events]);

  // Real trend: fraction of BLOCK/CHALLENGE decisions in the recent event
  // stream vs total — computed from live data, not hardcoded.
  const threatRatio = useMemo(() => {
    const flagged = events.filter((event) => event.action === "BLOCK" || event.action === "CHALLENGE").length;
    return events.length > 0 ? (flagged / events.length) * 100 : 0;
  }, [events]);

  // System load proxy: events per second over the last 10s, scaled against
  // a 10-events/10s budget. `now` comes from a state clock so this memo
  // stays pure (Date.now() during render is forbidden by react-hooks/purity).
  const [now, setNow] = useState(0);
  useEffect(() => {
    const kickoff = window.setTimeout(() => setNow(Date.now()), 0);
    const t = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => { window.clearTimeout(kickoff); window.clearInterval(t); };
  }, []);
  const systemLoad = useMemo(() => {
    if (events.length === 0 || now === 0) return 0;
    const cutoff = now - 10_000;
    const recent = events.filter((event) => new Date(event.timestamp).getTime() > cutoff).length;
    return Math.min(100, Math.round((recent / 10) * 10));
  }, [events, now]);

  return { metrics: { ...metrics, systemLoad }, history, events, isConnected, error, loading, threatRatio, refresh };
}
