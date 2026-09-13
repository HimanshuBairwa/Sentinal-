"use client";

import { useCallback, useEffect, useState } from "react";
import { DEMO_RULES, demoFraudRate, demoGeo, demoTopThreats } from "./demo";

const configuredAPIURL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

function getAPIURL(): string {
  if (configuredAPIURL && configuredAPIURL !== "http://localhost:8080") return configuredAPIURL;
  if (typeof window === "undefined") return configuredAPIURL || "http://localhost:8080";
  const { protocol, hostname } = window.location;
  if (hostname.includes("-3000.")) return `${protocol}//${hostname.replace("-3000.", "-8080.")}`;
  return `${protocol}//${hostname}:8080`;
}

function authHeaders(): HeadersInit {
  const token = typeof window === "undefined" ? null : window.localStorage.getItem("sentinel_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Shared fetch with 401 → refresh-token rotation → retry (same as useAnalytics). */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, { ...init, headers: { ...authHeaders(), ...(init.headers ?? {}) } });
  if (response.status !== 401 || typeof window === "undefined") return response;
  const refreshToken = window.localStorage.getItem("sentinel_refresh_token");
  if (!refreshToken) return response;
  const refresh = await fetch(`${getAPIURL()}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!refresh.ok) return response;
  const pair = (await refresh.json()) as { access_token: string; refresh_token: string };
  window.localStorage.setItem("sentinel_access_token", pair.access_token);
  window.localStorage.setItem("sentinel_refresh_token", pair.refresh_token);
  return fetch(input, { ...init, headers: { ...authHeaders(), ...(init.headers ?? {}) } });
}

export function apiURL(path: string): string {
  return `${getAPIURL()}${path}`;
}

// ---------------------------------------------------------------------------
// Rules management types (mirror risk-engine/app/models/schema.py)
// ---------------------------------------------------------------------------

export type FraudRule = {
  id: string;
  rule_id: string;
  name: string;
  description: string;
  expression: string;
  score_contribution: number;
  action: string;
  is_enabled: boolean;
  priority: number;
  hit_count: number;
  last_triggered_at: string | null;
  created_at: string;
};

export type RuleInput = {
  rule_id?: string;
  name: string;
  description?: string;
  expression: string;
  score_contribution: number;
  action: string;
  is_enabled?: boolean;
  priority?: number;
};

/** List rules (all, not just enabled). */
export async function listRules(): Promise<FraudRule[]> {
  const res = await apiFetch(apiURL("/api/v1/rules/"), { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load rules (${res.status})`);
  return (await res.json()) as FraudRule[];
}

/** Feature vocabulary for the rule editor. */
export async function listFeatures(): Promise<string[]> {
  const res = await apiFetch(apiURL("/api/v1/rules/features"), { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load features (${res.status})`);
  return (await res.json()) as string[];
}

export async function createRule(rule: RuleInput): Promise<FraudRule> {
  const res = await apiFetch(apiURL("/api/v1/rules/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (res.status === 403) throw new Error("Admin role required to create rules");
  if (res.status === 422) {
    const body = (await res.json()) as { detail?: string };
    throw new Error(body.detail ?? "Invalid rule expression");
  }
  if (!res.ok) throw new Error(`Failed to create rule (${res.status})`);
  return (await res.json()) as FraudRule;
}

export async function updateRule(ruleId: string, rule: RuleInput): Promise<FraudRule> {
  const res = await apiFetch(apiURL(`/api/v1/rules/${encodeURIComponent(ruleId)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (res.status === 403) throw new Error("Admin role required to update rules");
  if (res.status === 422) {
    const body = (await res.json()) as { detail?: string };
    throw new Error(body.detail ?? "Invalid rule expression");
  }
  if (!res.ok) throw new Error(`Failed to update rule (${res.status})`);
  return (await res.json()) as FraudRule;
}

export async function deleteRule(ruleId: string): Promise<void> {
  const res = await apiFetch(apiURL(`/api/v1/rules/${encodeURIComponent(ruleId)}`), { method: "DELETE" });
  if (res.status === 403) throw new Error("Admin role required to delete rules");
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete rule (${res.status})`);
}

// ---------------------------------------------------------------------------
// Current user (role-aware UI)
// ---------------------------------------------------------------------------

export type CurrentUser = { user_id: string; email: string; role: string };

export async function fetchMe(): Promise<CurrentUser | null> {
  try {
    const res = await apiFetch(apiURL("/api/v1/auth/me"), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as CurrentUser;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deep analytics endpoints (ClickHouse rollups)
// ---------------------------------------------------------------------------

export type FraudRatePoint = { time_bucket: string; total: number; fraud: number };
export type GeoPoint = { country: string; count: number };
export type ThreatSource = { threat_source: string; attempt_count: number };

export async function fetchFraudRate(): Promise<FraudRatePoint[]> {
  try {
    const res = await apiFetch(apiURL("/api/v1/analytics/fraud-rate"), { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as FraudRatePoint[];
  } catch {
    // Backend unreachable (public demo deploy): serve the simulated rollup
    // so analytics visualizations still demonstrate the full experience.
    return demoFraudRate();
  }
}

export async function fetchGeo(): Promise<GeoPoint[]> {
  try {
    const res = await apiFetch(apiURL("/api/v1/analytics/geo"), { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as GeoPoint[];
  } catch {
    return demoGeo();
  }
}

export async function fetchTopThreats(): Promise<ThreatSource[]> {
  try {
    const res = await apiFetch(apiURL("/api/v1/analytics/top-threats"), { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as ThreatSource[];
  } catch {
    return demoTopThreats();
  }
}

/** Hook wrapper: load-once + refresh callback for rules. */
export function useRules() {
  const [rules, setRules] = useState<FraudRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** true = backend unreachable; serving the demo rule set read-only. */
  const [demo, setDemo] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await listRules());
      setError(null);
      setDemo(false);
    } catch (cause) {
      // Backend offline (public demo deploy): show the demo rule set so the
      // page still demonstrates the full CRUD UX (read-only).
      const msg = cause instanceof Error ? cause.message : "Failed to load rules";
      if (/Failed to load rules \(\d+\)/.test(msg) || /network|fetch/i.test(msg)) {
        setRules(DEMO_RULES as unknown as FraudRule[]);
        setDemo(true);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Kick the initial load through a microtask so the effect body itself
    // never calls setState synchronously (react-hooks/set-state-in-effect).
    const kick = () => void refresh();
    const t = setTimeout(kick, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  return { rules, error, loading, demo, refresh };
}
