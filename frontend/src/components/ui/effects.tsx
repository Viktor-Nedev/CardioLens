import { ArrowDown, ArrowUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { LOWERS, RAISES } from "../../lib/colors";

/** Pointer handler for `.spotlight` cards: moves the soft light to the cursor. */
export function spotlightMove(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

interface Change {
  id: number;
  delta: number;
}

/** Tracks a probability and reports each meaningful change (default: ≥ 0.5 percentage points). */
export function useValueChange(value: number | undefined, minDelta = 0.005): Change | null {
  const previous = useRef<number | undefined>(value);
  const [change, setChange] = useState<Change | null>(null);
  useEffect(() => {
    const prev = previous.current;
    previous.current = value;
    if (value == null || prev == null) return;
    const delta = value - prev;
    if (Math.abs(delta) >= minDelta) setChange((c) => ({ id: (c?.id ?? 0) + 1, delta }));
  }, [value, minDelta]);
  return change;
}

/** A ring of light that flashes once around a card when its value changes. */
export function ChangeRing({ change, color }: { change: Change | null; color: string }) {
  if (!change) return null;
  return (
    <motion.span
      key={change.id}
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      initial={{ opacity: 0.9, scale: 1 }}
      animate={{ opacity: 0, scale: 1.025 }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      style={{ boxShadow: `0 0 0 1.5px ${color}, 0 0 22px ${color}` }}
      data-motion="decorative"
    />
  );
}

/** "+3.1 pp" that floats up from a number and fades, showing the last change. */
export function FloatingDelta({ change, placement = "left" }: { change: Change | null; placement?: "left" | "top" }) {
  const [visible, setVisible] = useState<Change | null>(null);
  useEffect(() => {
    if (!change) return;
    setVisible(change);
    const t = window.setTimeout(() => setVisible(null), 1600);
    return () => window.clearTimeout(t);
  }, [change]);

  return (
    <span
      className={
        placement === "left"
          ? "pointer-events-none absolute right-full top-1/2 z-10 mr-1.5 -translate-y-1/2"
          : "pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2"
      }
      aria-hidden
    >
      <AnimatePresence>
        {visible && (
          <motion.span
            key={visible.id}
            initial={{ opacity: 0, x: 8, y: 4 }}
            animate={{ opacity: 1, x: 0, y: -6 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="tabular flex items-center gap-0.5 whitespace-nowrap rounded-full border border-line-strong bg-[#0b111bee] px-1.5 py-px text-[10px] font-semibold text-ink shadow-lg"
          >
            {visible.delta > 0 ? (
              <ArrowUp size={10} color={RAISES} strokeWidth={3} />
            ) : (
              <ArrowDown size={10} color={LOWERS} strokeWidth={3} />
            )}
            {(Math.abs(visible.delta) * 100).toFixed(1)} pp
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
