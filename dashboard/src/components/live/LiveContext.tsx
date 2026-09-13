"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAnalytics, type AnalyticsEvent } from "../../hooks/useAnalytics";

/**
 * Shared live-telemetry context. Pages and chrome (TopBar notifications,
 * sidebar status) consume one WebSocket + one REST polling loop instead of
 * each page opening its own connection (which previously multiplied
 * connections 4x and hammered the analytics API).
 */
type LiveData = {
  events: AnalyticsEvent[];
  metrics: ReturnType<typeof useAnalytics>["metrics"];
  history: ReturnType<typeof useAnalytics>["history"];
  isConnected: boolean;
  error: string | null;
  loading: boolean;
  demo: boolean;
  threatRatio: number;
  refresh: () => Promise<void>;
  lastEventAt: number | null;
};

const LiveContext = createContext<LiveData | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { events, metrics, history, isConnected, error, loading, demo, threatRatio, refresh } = useAnalytics();
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [hasEverHadEvents, setHasEverHadEvents] = useState(false);

  useEffect(() => {
    if (events.length > 0 && !hasEverHadEvents) {
      // First telemetry arrival — record it once via a callback-safe path.
      const t = setTimeout(() => {
        setHasEverHadEvents(true);
        setLastEventAt(Date.now());
      }, 0);
      return () => clearTimeout(t);
    }
  }, [events.length, hasEverHadEvents]);

  const value = useMemo<LiveData>(
    () => ({ events, metrics, history, isConnected, error, loading, demo, threatRatio, refresh, lastEventAt }),
    [events, metrics, history, isConnected, error, loading, demo, threatRatio, refresh, lastEventAt]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveData {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used within <LiveProvider>");
  return ctx;
}
