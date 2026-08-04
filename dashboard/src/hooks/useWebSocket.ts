"use client";

import { useEffect, useRef, useState } from "react";

export type WebSocketEnvelope<T> = {
  type?: string;
  data: T;
};

export function useWebSocket<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        retryRef.current = 0;
        setIsConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketEnvelope<T> | T;
          const envelope = message as Partial<WebSocketEnvelope<T>>;
          setData(envelope.type && "data" in envelope ? envelope.data as T : message as T);
        } catch {
          // Ignore malformed telemetry frames; the next valid frame remains useful.
        }
      };
      socket.onclose = () => {
        setIsConnected(false);
        if (!cancelled) {
          const delay = Math.min(30_000, 500 * 2 ** retryRef.current++);
          retryTimer = setTimeout(connect, delay);
        }
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [url]);

  return { data, isConnected };
}
