import clsx from "clsx";
import { OctagonAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { riskColor, withAlpha } from "../../lib/colors";
import { pct } from "../../lib/format";

const BAND_STYLE = {
  low: { icon: ShieldCheck, color: "#199e70" },
  moderate: { icon: TriangleAlert, color: "#c98500" },
  high: { icon: OctagonAlert, color: "#d03b3b" },
} as const;

/** Risk band as icon + label (never colour alone). */
export function BandChip({ band, label }: { band: keyof typeof BAND_STYLE; label: string }) {
  const { icon: Icon, color } = BAND_STYLE[band];
  return (
    <span
      className="chip text-ink-2"
      style={{ borderColor: withAlpha(color, 0.45), background: withAlpha(color, 0.12) }}
    >
      <Icon size={12} color={color} strokeWidth={2.4} aria-hidden />
      {label} risk
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
    <div className="relative w-full" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className="relative w-full rounded-full" style={{ height: h, background: withAlpha(color, 0.16) }}>
        <div
          className="absolute inset-y-0 left-0 transition-[width,background-color] duration-500 ease-out"
          style={{ width: `${Math.max(1.5, value * 100)}%`, background: color, borderRadius: `0 4px 4px 0` }}
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
        <div className="relative mt-1 h-1.5" aria-hidden>
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-ink-3"
            style={{ left: `${interval[0] * 100}%`, width: `${Math.max(0.5, (interval[1] - interval[0]) * 100)}%` }}
          />
          <div className="absolute top-0 h-1.5 w-px bg-ink-3" style={{ left: `${interval[0] * 100}%` }} />
          <div className="absolute top-0 h-1.5 w-px bg-ink-3" style={{ left: `${interval[1] * 100}%` }} />
        </div>
      )}
    </div>
  );
}

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
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx("inline-flex flex-wrap gap-0.5 rounded-lg border border-line bg-page/60 p-0.5", className)}
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
              "rounded-md font-medium transition-colors",
              size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
              active ? "bg-raised text-ink shadow-sm ring-1 ring-line-strong" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  right,
  children,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("panel p-3.5", className)}>
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="label-caps">{title}</h2>
        {right}
      </header>
      {children}
    </section>
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
    <figure className={clsx("panel flex flex-col p-4", className)}>
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
    </figure>
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
            <tr key={i} className="border-t border-line text-ink-2">
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
