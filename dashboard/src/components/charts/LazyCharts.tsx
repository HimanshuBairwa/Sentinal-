"use client";

import dynamic from "next/dynamic";
import { ChartSkeleton } from "../ui/Skeleton";

/**
 * Lazy TransactionAreaChart — recharts (~350KB parsed) ships ONLY with
 * routes that render a chart, and only after first paint (the skeleton
 * shows instantly). This cut ~1.3MB off the initial JS of chart-less routes.
 */
export const LazyTransactionAreaChart = dynamic(
  () => import("./TransactionAreaChart").then((m) => m.TransactionAreaChart),
  {
    loading: () => <ChartSkeleton className="h-full w-full border-0 bg-transparent p-0 shadow-none" />,
    ssr: false,
  }
);

/** Same chart, but for pages that already gate on data presence. */
export function TransactionAreaChartLazy({ data }: { data: { time: string; transactions: number; fraud: number }[] }) {
  return <LazyTransactionAreaChart data={data} />;
}
