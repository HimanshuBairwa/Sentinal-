"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";

/**
 * TiltCard - pointer-tracked 3D perspective tilt with a moving glare layer.
 * Max 6deg so it reads as depth, not gimmick. Disabled under reduced motion.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 6,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const px = useMotionValue(0.5); // 0..1 pointer position
  const py = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(py, [0, 1], [maxTilt, -maxTilt]), { stiffness: 260, damping: 24 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-maxTilt, maxTilt]), { stiffness: 260, damping: 24 });

  // Glare position as separate transforms (hooks must run unconditionally)
  const glareX = useTransform(px, [0, 1], ["0%", "100%"]);
  const glareY = useTransform(py, [0, 1], ["0%", "100%"]);
  const glareBg = useTransform(
    [glareX, glareY] as const,
    ([x, y]: string[]) =>
      `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.09) 0%, transparent 55%)`
  );

  return (
    <motion.div
      ref={ref}
      onMouseMove={(e) => {
        if (reduceMotion || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        px.set((e.clientX - rect.left) / rect.width);
        py.set((e.clientY - rect.top) / rect.height);
      }}
      onMouseLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
      style={reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 900 }}
      className={`relative isolate ${className ?? ""}`}
    >
      {children}
      {!reduceMotion && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ background: glareBg }}
        />
      )}
    </motion.div>
  );
}
