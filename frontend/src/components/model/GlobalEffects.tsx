import { Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { api } from "../../lib/api";
import { CONTEXT, SERIES } from "../../lib/colors";
import { pct } from "../../lib/format";
import type { Dependence, TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { ChartCard, DataTable, LegendKey } from "../ui/primitives";

const H = 260;
const M = { top: 12, right: 18, bottom: 40, left: 46 };
const CHIPS = 6;

// Dependence results never change while the app runs.
const cache = new Map<string, Dependence>();

function fmt(d: Dependence, i: number): string {
  if (d.labels) return d.labels[i];
  const v = Number(d.grid[i]);
  const text = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
  return d.unit ? `${text} ${d.unit}` : text;
}

/**
 * Global effect of one factor (partial dependence): every hold-out patient's curve as the factor
 * varies with their other inputs fixed (thin lines), their average (bold) and the 10–90% band.
 */
export function GlobalEffects({ target }: { target: TargetId }) {
  const importance = useStore((s) => s.importance);
  const schema = useStore((s) => s.schema);
  const short = useStore((s) => s.metrics?.targets[target].short ?? target.toUpperCase());
  const top = useMemo(() => (importance?.[target] ?? []).slice(0, CHIPS), [importance, target]);
  const [feature, setFeature] = useState<string | null>(null);
  const active = feature ?? top[0]?.feature ?? null;
  const [data, setData] = useState<Dependence | null>(null);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const hit = cache.get(active);
    if (hit) {
      setData(hit);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    api
      .dependence(active, ctrl.signal)
      .then((d) => {
        cache.set(active, d);
        setData(d);
        setLoading(false);
      })
      .catch(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [active]);

  const curves = data && data.feature === active ? data.targets[target] : null;
  const n = data?.grid.length ?? 0;
  const discrete = Boolean(data?.labels);
  const w = width - M.left - M.right;
  const h = H - M.top - M.bottom;
  // Discrete options sit in evenly spaced columns; numbers on a linear axis.
  const sxIndex = (i: number) => M.left + (discrete ? ((i + 0.5) / n) * w : (n > 1 ? i / (n - 1) : 0.5) * w);
  const sy = (p: number) => M.top + (1 - p) * h;
  const path = (ys: number[]) => ys.map((y, i) => `${i ? "L" : "M"}${sxIndex(i).toFixed(1)},${sy(y).toFixed(1)}`).join("");
  const band = curves
    ? `${curves.hi.map((y, i) => `${i ? "L" : "M"}${sxIndex(i).toFixed(1)},${sy(y).toFixed(1)}`).join("")}${curves.lo
        .map((y, i) => [i, y] as const)
        .reverse()
        .map(([i, y]) => `L${sxIndex(i).toFixed(1)},${sy(y).toFixed(1)}`)
        .join("")}Z`
    : "";
  const xTicks = discrete ? Array.from({ length: n }, (_, i) => i) : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((n - 1) * f));
  // Rug: where the hold-out patients actually are on this factor.
  const rug = useMemo(() => {
    if (!data || data.feature !== active) return [];
    if (data.labels) {
      return data.grid.map((g, i) => ({ x: sxIndex(i), count: data.values.filter((v) => String(v) === String(g)).length }));
    }
    const lo = Number(data.grid[0]);
    const hi = Number(data.grid[n - 1]);
    return data.values
      .filter((v) => v != null)
      .map((v) => ({ x: M.left + ((Number(v) - lo) / (hi - lo || 1)) * w, count: 1 }));
  }, [data, active, width, n]);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left + M.left;
    let best = 0;
    for (let i = 0; i < n; i++) if (Math.abs(sxIndex(i) - px) < Math.abs(sxIndex(best) - px)) best = i;
    setHover(best);
  };

  const label = data?.label ?? schema?.features.find((f) => f.id === active)?.label ?? "";
  const pathKey = `${active}-${target}-${width}`;

  return (
    <ChartCard
      title={`How each factor shapes the ${short} estimate`}
      subtitle={`Partial dependence over the ${data?.n ?? 61} hold-out patients: each thin line is one patient as ${label.toLowerCase() || "the factor"} varies with everything else fixed; the bold line is their average. Model behaviour, not a causal effect.`}
      legend={
        <>
          <LegendKey color={SERIES} label="Average effect (partial dependence)" />
          <LegendKey color={CONTEXT} label="Individual patients" />
          <LegendKey kind="rect" color="rgb(57 135 229 / 0.25)" label="10–90% of patients" />
          <LegendKey color="#ffffff" label="Decision threshold" />
        </>
      }
      table={
        curves && data ? (
          <DataTable
            head={[label, "Average", "10th percentile", "90th percentile"]}
            rows={curves.pdp.map((v, i) => [fmt(data, i), pct(v), pct(curves.lo[i]), pct(curves.hi[i])])}
          />
        ) : undefined
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {top.map((r) => (
          <button
            key={r.feature}
            type="button"
            onClick={() => setFeature(r.feature)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              r.feature === active ? "border-accent/60 bg-accent-soft text-ink" : "border-line text-ink-3 hover:text-ink"
            }`}
          >
            {r.label}
          </button>
        ))}
        {schema && (
          <select
            value={active ?? ""}
            onChange={(e) => setFeature(e.target.value)}
            className="ml-auto max-w-48 cursor-pointer rounded-lg border border-line bg-black/30 px-2 py-1 text-[11px] text-ink-2 focus:border-accent focus:outline-none"
            aria-label="Choose any factor"
          >
            {schema.groups.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {schema.features
                  .filter((f) => f.group === g.id)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        )}
        {loading && <Loader2 size={14} className="animate-spin text-accent" aria-label="Loading" />}
      </div>

      <div ref={wrap} className="relative w-full">
        {!curves || !data ? (
          <div className="skeleton rounded-lg" style={{ height: H }} />
        ) : (
          <svg width={width} height={H} role="img" aria-label={`Partial dependence of ${short} on ${label}`}>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + w} y1={sy(t)} y2={sy(t)} stroke="var(--color-grid)" />
                <text x={M.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--color-ink-3)">
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text
                key={`x${i}`}
                x={sxIndex(i)}
                y={M.top + h + 16}
                textAnchor={discrete ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                fontSize={10}
                fill="var(--color-ink-3)"
              >
                {fmt(data, i)}
              </text>
            ))}
            <text x={M.left + w / 2} y={H - 4} textAnchor="middle" fontSize={10.5} fill="var(--color-ink-2)">
              {label}
            </text>

            {/* Threshold */}
            <line
              x1={M.left}
              x2={M.left + w}
              y1={sy(curves.threshold)}
              y2={sy(curves.threshold)}
              stroke="#ffffff"
              strokeDasharray="4 4"
              opacity={0.5}
            />
            <text x={M.left + w} y={sy(curves.threshold) - 5} textAnchor="end" fontSize={9.5} fill="var(--color-ink-3)">
              threshold {pct(curves.threshold)}
            </text>

            <motion.path
              key={`band-${pathKey}`}
              d={band}
              fill="rgb(57 135 229 / 0.16)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            />
            {curves.ice.map((ys, k) => (
              <motion.path
                key={`ice-${pathKey}-${k}`}
                d={path(ys)}
                fill="none"
                stroke={CONTEXT}
                strokeWidth={1}
                strokeOpacity={0.35}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, delay: k * 0.006, ease: "easeOut" }}
              />
            ))}
            <motion.path
              key={`pdp-${pathKey}`}
              d={path(curves.pdp)}
              fill="none"
              stroke={SERIES}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, delay: 0.25, ease: "easeInOut" }}
              style={{ filter: "drop-shadow(0 0 6px rgb(57 135 229 / 0.6))" }}
            />
            {discrete &&
              curves.pdp.map((v, i) => (
                <motion.circle
                  key={`dot-${pathKey}-${i}`}
                  cx={sxIndex(i)}
                  cy={sy(v)}
                  r={5}
                  fill={SERIES}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.9 + i * 0.08, type: "spring", stiffness: 400, damping: 20 }}
                />
              ))}

            {/* Rug of the patients' own values */}
            {rug.map((r, i) =>
              discrete ? (
                <text key={`rug-${i}`} x={r.x} y={M.top + h - 6} textAnchor="middle" fontSize={9} fill="var(--color-ink-3)">
                  n = {r.count}
                </text>
              ) : (
                <line key={`rug-${i}`} x1={r.x} x2={r.x} y1={M.top + h} y2={M.top + h - 6} stroke="var(--color-ink-3)" opacity={0.6} />
              ),
            )}
            <line x1={M.left} x2={M.left + w} y1={M.top + h} y2={M.top + h} stroke="var(--color-axis)" />

            {hover != null && (
              <g pointerEvents="none">
                <line x1={sxIndex(hover)} x2={sxIndex(hover)} y1={M.top} y2={M.top + h} stroke="var(--color-ink-3)" />
                <circle cx={sxIndex(hover)} cy={sy(curves.pdp[hover])} r={5} fill={SERIES} stroke="var(--color-surface)" strokeWidth={2} />
              </g>
            )}
            <rect
              x={M.left}
              y={M.top}
              width={w}
              height={h}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover != null && curves && data && (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-lg border border-line-strong bg-[#0b111bf2] px-2.5 py-1.5 shadow-xl"
            style={{ left: Math.min(sxIndex(hover) + 12, width - 216), top: Math.max(0, sy(curves.pdp[hover]) - 70) }}
          >
            <p className="text-[11px] text-ink-2">
              {label}: <span className="font-semibold text-ink">{fmt(data, hover)}</span>
            </p>
            <p className="tabular text-sm font-semibold text-ink">{pct(curves.pdp[hover])} on average</p>
            <p className="tabular text-[11px] text-ink-3">
              80% of patients between {pct(curves.lo[hover])} and {pct(curves.hi[hover])}
            </p>
          </div>
        )}
      </div>
    </ChartCard>
  );
}
