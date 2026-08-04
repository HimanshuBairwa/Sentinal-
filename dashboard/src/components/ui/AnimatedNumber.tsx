"use client";


interface AnimatedNumberProps {
  value: number;
  format?: "number" | "currency" | "percent";
  className?: string;
}

export function AnimatedNumber({ value, format = "number", className }: AnimatedNumberProps) {
  if (format === "percent") {
    return <span className={className}>{value.toFixed(2)}%</span>;
  }
  if (format === "currency") {
    return <span className={className}>${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  }
  return <span className={className}>{Math.floor(value).toLocaleString()}</span>;
}
