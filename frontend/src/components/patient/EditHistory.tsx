import clsx from "clsx";
import { History, Redo2, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { riskColor, withAlpha } from "../../lib/colors";
import { pct } from "../../lib/format";
import { useStore } from "../../state/store";
import { MOD } from "../layout/Chrome";

const H = 48;
const PAD_X = 8;
const PAD_Y = 8;

/** Undo/redo for patient edits, with a sparkline of the explained target's risk along the way. */
export function EditHistory() {
  const trail = useStore((s) => s.trail);
  const cursor = useStore((s) => s.cursor);
  const selected = useStore((s) => s.selected);
  const short = useStore((s) => s.prediction?.targets[s.selected].short ?? s.selected.toUpperCase());
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const jumpTo = useStore((s) => s.jumpTo);
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(160, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [trail.length > 1]);

  // Ctrl/⌘ Z and Ctrl/⌘ Shift Z (or Ctrl Y). Text fields keep their own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range"));
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const n = trail.length;
  const sx = (i: number) => PAD_X + (n > 1 ? i / (n - 1) : 0.5) * (width - 2 * PAD_X);
  const sy = (p: number) => PAD_Y + (1 - p) * (H - 2 * PAD_Y);
  const pts = trail.map((e, i) => [sx(i), sy(e.probs[selected])] as const);
  const line = (upTo: number, from = 0) =>
    pts
      .slice(from, upTo + 1)
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join("");
  const past = line(cursor);
  const area = cursor > 0 ? `${past}L${pts[cursor][0].toFixed(1)},${H}L${pts[0][0].toFixed(1)},${H}Z` : "";
  const future = cursor < n - 1 ? line(n - 1, cursor) : "";
  const current = trail[cursor];
  const before = trail[cursor - 1];
  const shown = hover != null ? trail[hover] : current;
  const color = current ? riskColor(current.probs[selected]) : "#5cc8f5";

  return (
    <AnimatePresence initial={false}>
      {n > 1 && current && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.35 }}
          className="overflow-hidden"
        >
          <div className="mt-2.5 rounded-xl border border-line bg-black/20 p-2.5">
            <div className="flex items-center justify-between">
              <p className="label-caps flex items-center gap-1.5">
                <History size={12} className="text-accent" aria-hidden /> Edit history
                <span className="tabular normal-case tracking-normal text-ink-3">
                  · step {cursor + 1} of {n}
                </span>
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn-ghost p-1"
                  onClick={undo}
                  disabled={cursor <= 0}
                  title={`Undo (${MOD} Z)`}
                  aria-label="Undo"
                >
                  <Undo2 size={14} />
                </button>
                <button
                  type="button"
                  className="btn-ghost p-1"
                  onClick={redo}
                  disabled={cursor >= n - 1}
                  title={`Redo (${MOD} Shift Z)`}
                  aria-label="Redo"
                >
                  <Redo2 size={14} />
                </button>
              </div>
            </div>

            <div ref={wrap} className="relative mt-1.5">
              <svg width={width} height={H} role="img" aria-label={`${short} risk after each edit`}>
                <defs>
                  <linearGradient id="trail-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <line x1={PAD_X} x2={width - PAD_X} y1={sy(0.5)} y2={sy(0.5)} stroke="var(--color-grid)" strokeDasharray="2 3" />
                {area && <motion.path d={area} fill="url(#trail-fill)" initial={false} animate={{ d: area }} transition={{ duration: 0.4 }} />}
                {future && <path d={future} fill="none" stroke="var(--color-ink-3)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />}
                {cursor > 0 && (
                  <motion.path
                    d={past}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    initial={false}
                    animate={{ d: past }}
                    transition={{ duration: 0.4 }}
                  />
                )}
                {pts.map(([x, y], i) => (
                  <motion.circle
                    key={i}
                    initial={{ r: 0 }}
                    animate={{ r: i === cursor ? 5 : 3, cx: x, cy: y }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                    fill={i === cursor ? riskColor(trail[i].probs[selected]) : i > cursor ? "var(--color-raised)" : "var(--color-ink-3)"}
                    stroke={i === cursor ? "#ffffff" : i > cursor ? "var(--color-ink-3)" : "none"}
                    strokeWidth={1.5}
                    style={{
                      cursor: "pointer",
                      filter: i === cursor ? `drop-shadow(0 0 6px ${withAlpha(color, 0.9)})` : undefined,
                    }}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => jumpTo(i)}
                  >
                    <title>{`${trail[i].label} · ${short} ${pct(trail[i].probs[selected])}`}</title>
                  </motion.circle>
                ))}
              </svg>
            </div>

            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={`${hover ?? cursor}-${shown?.label}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={clsx("mt-1 truncate text-[11px]", hover != null ? "text-ink" : "text-ink-2")}
              >
                {shown?.label}
                <span className="tabular text-ink-3">
                  {" · "}
                  {short} {pct(shown?.probs[selected] ?? 0)}
                  {hover == null && before && (
                    <>
                      {" "}
                      ({current.probs[selected] >= before.probs[selected] ? "+" : "−"}
                      {Math.abs(Math.round((current.probs[selected] - before.probs[selected]) * 1000) / 10)} pp)
                    </>
                  )}
                </span>
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
