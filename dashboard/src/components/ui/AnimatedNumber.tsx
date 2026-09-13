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
 * an ease-out cubic. The animation frames call setState from the rAF
 * callback (an external system), not synchronously in the effect body.
 */
export function AnimatedNumber({ value, format = "number", className, duration = 900 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    // Skip animation for trivial deltas.
    if (Math.abs(value - from) < 0.5) {
      fromRef.current = value;
      return;
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      fromRef.current = value;
      return;
    }

    let startTime: number | null = null;
    let cancelled = false;

    const tick = (t: number) => {
      if (cancelled) return;
      if (startTime === null) startTime = t;
      const elapsed = t - startTime;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(from + (value - from) * eased);
      if (p < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return <span className={className}>{formatValue(display, format)}</span>;
}
