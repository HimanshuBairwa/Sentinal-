'use client';
import { motion, AnimatePresence } from 'framer-motion';

export function SlotCounter({ value }: { value: number }) {
  const numArr = value.toString().split('');

  return (
    <div className="flex space-x-1 overflow-hidden h-12 text-4xl font-bold font-mono text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
      <AnimatePresence mode="popLayout">
        {numArr.map((digit, i) => (
          <motion.span
            key={`${i}-${digit}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3, type: 'spring', stiffness: 200, damping: 20 }}
            className="inline-block"
          >
            {digit}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
