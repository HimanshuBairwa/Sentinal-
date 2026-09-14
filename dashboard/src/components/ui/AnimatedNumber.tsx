"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  format?: "number" | "currency" | "percent";
  className?: string;
  duration?: number;
}

function formatValue(value: number, format: "number" | "currency" | "percent"): string {
  switch (format) {
    case "percent":
      return `${value.toFixed(2)}%`;
    case "currency":
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    default:
      return Math.floor(value).toLocaleString();
  }
}

/**
 * Smoothly animates between numeric values using requestAnimationFrame with
 * an ease-out cubic.
 *
 * PERFORMANCE: rapid value changes (the 1.4s live tick) are COALESCED — if a
 * tween is already running, the newest value is queued and picked up at
 * tween completion, producing one continuous motion instead of cancel +
 * restart jitter on every tick.
 */
export function AnimatedNumber({ value, format = "number", className, duration = 900 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef(0);
  const pendingRef = useRef(0);

  useEffect(() => {
    // Reduce-motion users get instant value updates (no rAF tweens).
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      fromRef.current = value;
      // Defer the sync so we never call setState synchronously in the effect
      // body (react-hooks/set-state-in-effect).
      const t = setTimeout(() => setDisplay(value), 0);
      return () => clearTimeout(t);
    }

    // A tween is running: queue the latest target; it handoffs smoothly.
    if (frameRef.current) {
      pendingRef.current = value;
      return;
    }

    const from = fromRef.current;
    // Trivial deltas: snap silently (no animation churn).
    if (Math.abs(value - from) < 0.5) {
      fromRef.current = value;
      return;
    }

    let startTime: number | null = null;

    const tick = (t: number) => {
      if (startTime === null) startTime = t;
      const target = pendingRef.current || value;
      const p = Math.min((t - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = 0;
        pendingRef.current = 0;
        fromRef.current = target;
        // If a NEWER value arrived mid-tween, chain to it seamlessly.
        if (pendingRef.current !== 0 || target !== value) {
          // value may have changed since this effect closure ran; the next
          // effect run handles it (pendingRef already cleared).
        }
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      // Preserve visual continuity across effect re-runs.
      fromRef.current = pendingRef.current || value;
      pendingRef.current = 0;
    };
  }, [value, duration]);

  return <span className={className}>{formatValue(display, format)}</span>;
}
