"use client";

import { clsx } from "clsx";
import { ReactNode, useRef, useState } from "react";
import { motion, HTMLMotionProps, useReducedMotion } from "framer-motion";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  premium?: boolean;
  /** Enables the cursor-tracking spotlight sheen. */
  spotlight?: boolean;
}

export function GlassCard({
  children, className, title, subtitle, action, premium = true, spotlight = false, ...props
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [sheen, setSheen] = useState<{ x: number; y: number } | null>(null);
  const reduceMotion = useReducedMotion();
  const enabled = spotlight && !reduceMotion;

  return (
    <motion.div
      ref={ref}
      onMouseMove={enabled ? (e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setSheen({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      } : undefined}
      onMouseLeave={enabled ? () => setSheen(null) : undefined}
      className={clsx(
        premium ? "glass-panel-premium" : "glass-panel",
        "group relative flex flex-col overflow-hidden rounded-2xl transition-all duration-300",
        className
      )}
      {...props}
    >
      {/* Cursor spotlight — a soft radial sheen that follows the pointer */}
      {enabled && sheen && (
        <div
          className="pointer-events-none absolute z-0 h-64 w-64 rounded-full opacity-60"
          style={{
            left: sheen.x - 128,
            top: sheen.y - 128,
            background:
              "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)",
            transition: "opacity 0.3s ease",
          }}
        />
      )}

      {/* Subtle top glare on hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      {(title || action) && (
        <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-5 py-4">
          <div>
            {title && <h3 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="relative z-10 flex-1 p-5">{children}</div>
    </motion.div>
  );
}
