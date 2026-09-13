"use client";

import { motion } from "framer-motion";
import { clsx } from "clsx";

/**
 * Shimmering skeleton primitives for loading states. Every data-fetch surface
 * should use these instead of spinners alone — the layout stays stable and
 * the perceived load time drops.
 */

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={clsx("skeleton-shimmer rounded-md", className)} />;
}

/** Full metric-card-shaped skeleton with icon circle + big value line. */
export function MetricSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      className="glass-panel-premium flex h-full flex-col rounded-2xl p-5"
    >
      <div className="mb-4 flex items-start justify-between">
        <SkeletonLine className="h-4 w-24" />
        <div className="skeleton-shimmer h-11 w-11 rounded-xl" />
      </div>
      <div className="mt-auto">
        <SkeletonLine className="h-10 w-28" />
      </div>
    </motion.div>
  );
}

/** Chart-panel-shaped skeleton with animated bar placeholders. */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("glass-panel-premium rounded-2xl p-5", className)}>
      <div className="mb-4 flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonLine className="h-4 w-44" />
          <SkeletonLine className="h-3 w-24" />
        </div>
      </div>
      {/* Staggered rising bars — mimics a chart finding its shape */}
      <div className="flex h-56 items-end gap-1.5">
        {[0.35, 0.55, 0.42, 0.7, 0.5, 0.8, 0.62, 0.9, 0.7, 0.95, 0.78, 0.55].map((h, i) => (
          <motion.div
            key={i}
            className="skeleton-shimmer flex-1 rounded-t-md"
            initial={{ height: "8%" }}
            animate={{ height: `${h * 100}%` }}
            transition={{ duration: 0.8, delay: 0.1 + i * 0.05, ease: [0.23, 1, 0.32, 1] }}
          />
        ))}
      </div>
    </div>
  );
}

/** Table-row-shaped skeleton. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06, duration: 0.4 }}
          className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-3"
        >
          <div className="skeleton-shimmer h-8 w-8 rounded-lg" />
          <SkeletonLine className="h-3 flex-1" />
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="h-5 w-16 rounded-full" />
        </motion.div>
      ))}
    </div>
  );
}

/** List-feed-shaped skeleton. */
export function FeedSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.07, duration: 0.4 }}
          className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
        >
          <div className="flex items-start gap-3">
            <div className="skeleton-shimmer h-5 w-5 rounded-full" />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="h-3 w-2/3" />
              <SkeletonLine className="h-3 w-1/3" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
