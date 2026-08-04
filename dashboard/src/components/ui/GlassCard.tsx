"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";
import { motion, HTMLMotionProps } from "framer-motion";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  premium?: boolean;
}

export function GlassCard({ children, className, title, action, premium = true, ...props }: GlassCardProps) {
  return (
    <motion.div 
      className={clsx(
        premium ? "glass-panel-premium" : "glass-panel", 
        "rounded-2xl overflow-hidden flex flex-col transition-all duration-300 relative group", 
        className
      )}
      {...props}
    >
      {/* Subtle top glare effect */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {(title || action) && (
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          {title && <h3 className="font-semibold tracking-wide text-slate-100 text-sm">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5 flex-1 relative z-10">{children}</div>
    </motion.div>
  );
}
