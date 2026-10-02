import clsx from "clsx";
import { OctagonAlert, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { animate, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { riskColor, withAlpha } from "../../lib/colors";
import { pct } from "../../lib/format";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const BAND_STYLE = {
  low: { icon: ShieldCheck, color: "#199e70" },
  moderate: { icon: TriangleAlert, color: "#c98500" },
  high: { icon: OctagonAlert, color: "#d03b3b" },
} as const;

/** Risk band as icon + label (never colour alone). */
export function BandChip({ band, label }: { band: keyof typeof BAND_STYLE; label: string }) {
  const { icon: Icon, color } = BAND_STYLE[band];
  return (
    <motion.span
      key={band}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      className="chip text-ink-2"
      style={{ borderColor: withAlpha(color, 0.45), background: withAlpha(color, 0.12) }}
    >
      <Icon size={12} color={color} strokeWidth={2.4} aria-hidden />
      {label} risk
    </motion.span>
  );
}

/** Number that eases to each new value instead of jumping. */
export function AnimatedNumber({
  value,
  format,
  duration = 0.8,
  className,
}: {
  value: number;
  format: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(value);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const controls = animate(current.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => {
        current.current = v;
        if (ref.current) ref.current.textContent = formatRef.current(v);
      },
    });
    return () => controls.stop();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {format(current.current)}
    </span>
  );
}

interface MeterProps {
  value: number;
  threshold?: number;
  interval?: [number, number] | null;
  size?: "sm" | "md";
  label?: string;
}

/** Probability meter: risk-coloured fill, same-hue track, threshold tick, interval whisker. */
export function Meter({ value, threshold, interval, size = "md", label }: MeterProps) {
  const color = riskColor(value);
  const h = size === "md" ? 8 : 6;
  return (
    <div
      className="relative w-full"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-label={label}
    >
      <div
        className="relative w-full rounded-full transition-colors duration-700"
        style={{ height: h, background: withAlpha(color, 0.16) }}
      >
        <motion.div
          className="absolute inset-y-0 left-0"
          initial={{ width: "0%" }}
          animate={{ width: `${Math.max(1.5, value * 100)}%`, backgroundColor: color }}
          transition={{ type: "spring", stiffness: 90, damping: 20 }}
          style={{ borderRadius: "0 4px 4px 0", boxShadow: `0 0 12px ${withAlpha(color, 0.45)}` }}
        />
        {threshold != null && (
          <div
            className="absolute -top-1 w-0.5 rounded-full bg-white/85"
            style={{ left: `calc(${threshold * 100}% - 1px)`, height: h + 8 }}
            title={`Decision threshold ${pct(threshold)}`}
          />
        )}
      </div>
      {interval && (
        <motion.div
          className="relative mt-1 h-1.5"
          aria-hidden
          initial={false}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-ink-3"
            animate={{ left: `${interval[0] * 100}%`, width: `${Math.max(0.5, (interval[1] - interval[0]) * 100)}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
          />
          <motion.div
            className="absolute top-0 h-1.5 w-px bg-ink-3"
            animate={{ left: `${interval[0] * 100}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
          />
          <motion.div
            className="absolute top-0 h-1.5 w-px bg-ink-3"
            animate={{ left: `${interval[1] * 100}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
          />
        </motion.div>
      )}
    </div>
  );
}

/** Segmented control with a sliding selection pill. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = "sm",
  ariaLabel,
  className,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  size?: "xs" | "sm";
  ariaLabel?: string;
  className?: string;
}) {
  const pillId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx("inline-flex flex-wrap gap-0.5 rounded-lg border border-line bg-black/25 p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={clsx(
              "relative rounded-md font-medium transition-colors",
              size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
              active ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${pillId}`}
                className="absolute inset-0 rounded-md bg-raised shadow-sm ring-1 ring-line-strong"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  icon: Icon,
  right,
  children,
  className,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className={clsx("panel p-4", className)}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="label-caps flex items-center gap-1.5">
          {Icon && <Icon size={13} className="text-accent" aria-hidden />}
          {title}
        </h2>
        {right}
      </header>
      {children}
    </motion.section>
  );
}

/** Card for a chart with a title, optional legend and a table-view toggle. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <motion.figure
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
      className={clsx("panel flex flex-col p-4", className)}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        {table && (
          <Segmented
            className="shrink-0"
            size="xs"
            ariaLabel="Chart or table view"
            value={showTable ? "table" : "chart"}
            onChange={(v) => setShowTable(v === "table")}
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        )}
      </header>
      {legend && !showTable && <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">{legend}</div>}
      <div className="min-h-0 flex-1">{showTable ? table : children}</div>
    </motion.figure>
  );
}

export function LegendKey({ color, label, kind = "line" }: { color: string; label: string; kind?: "line" | "rect" | "dot" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {kind === "line" && <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: color }} />}
      {kind === "rect" && <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />}
      {kind === "dot" && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
    </span>
  );
}

export function DataTable({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="scroll-slim max-h-80 overflow-auto rounded-lg border border-line">
      <table className="tabular w-full text-left text-xs">
        <thead className="sticky top-0 bg-raised text-ink-3">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-2.5 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line text-ink-2 transition-colors hover:bg-white/[0.03]">
              {r.map((c, j) => (
                <td key={j} className="px-2.5 py-1.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
