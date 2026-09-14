"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";
import { motion, HTMLMotionProps, useReducedMotion } from "framer-motion";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  premium?: boolean;
  /** Enables the cursor-tracking spotlight sheen (pure CSS, zero renders). */
  spotlight?: boolean;
}

/**
 * GlassCard — the workhorse panel.
 *
 * PERFORMANCE: the spotlight is pure CSS (pointer-tracking custom properties
 * updated by the browser's compositor) — NO React state, NO re-renders per
 * mousemove (the old setSheen-on-mousemove caused a render storm).
 */
export function GlassCard({
  children, className, title, subtitle, action, premium = true, spotlight = false, ...props
}: GlassCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={clsx(
        premium ? "glass-panel-premium" : "glass-panel",
        "group relative flex flex-col overflow-hidden rounded-2xl transition-[border-color,box-shadow] duration-300",
        spotlight && !reduceMotion && "spotlight-card",
        className
      )}
      {...props}
    >
      {/* Cursor spotlight — driven entirely by CSS custom properties */}
      {spotlight && !reduceMotion && (
        <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
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
