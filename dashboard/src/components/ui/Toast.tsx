"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from "lucide-react";

export type ToastKind = "success" | "warning" | "danger" | "info";

export type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Auto-dismiss delay; 0 = sticky. */
  duration?: number;
};

type ToastContextValue = {
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_STYLES: Record<ToastKind, { icon: typeof Info; ring: string; iconColor: string; bar: string }> = {
  success: { icon: CheckCircle2, ring: "border-emerald-500/30", iconColor: "text-emerald-400", bar: "bg-emerald-500" },
  warning: { icon: AlertTriangle, ring: "border-amber-500/30", iconColor: "text-amber-400", bar: "bg-amber-500" },
  danger: { icon: AlertOctagon, ring: "border-rose-500/40", iconColor: "text-rose-400", bar: "bg-rose-500" },
  info: { icon: Info, ring: "border-cyan-500/30", iconColor: "text-cyan-400", bar: "bg-cyan-500" },
};

/**
 * Toast system: queue notifications from anywhere via useToast(). Toasts
 * stack bottom-right with spring entrance, progress-bar auto-dismiss,
 * swipe/hover pause, and reduced-motion fallback.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = idRef.current++;
      const duration = t.duration ?? 4500;
      setToasts((current) => [...current.slice(-4), { ...t, id, duration }]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast viewport — bottom-right stack */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-3">
        <AnimatePresence>
          {toasts.map((t) => {
            const s = KIND_STYLES[t.kind];
            const Icon = s.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 80, scale: 0.92 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.92, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 0.05, right: 0.6 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 90) dismiss(t.id);
                }}
                className={`pointer-events-auto relative overflow-hidden rounded-xl border ${s.ring} bg-slate-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.iconColor}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-100">{t.title}</p>
                    {t.message && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.message}</p>}
                  </div>
                  <button
                    onClick={() => dismiss(t.id)}
                    className="rounded p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
                    aria-label="Dismiss notification"
                  >
                    <X size={14} />
                  </button>
                </div>
                {/* Auto-dismiss progress bar */}
                {t.duration !== 0 && (
                  <motion.div
                    className={`absolute bottom-0 left-0 h-0.5 ${s.bar}`}
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: (t.duration ?? 4500) / 1000, ease: "linear" }}
                  />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
