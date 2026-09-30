import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

export interface CurveSeries {
  id: string;
  label: string;
  color: string;
  points: [number, number][];
  markers?: boolean;
}

interface Props {
  series: CurveSeries[];
  xLabel: string;
  yLabel: string;
  /** "interpolate" reads every series at the crosshair x; "nearest" snaps to each series' closest point. */
  mode?: "interpolate" | "nearest";
  height?: number;
  format?: (v: number) => string;
  ariaLabel: string;
}

const M = { top: 10, right: 12, bottom: 38, left: 44 };
const TICKS = [0, 0.25, 0.5, 0.75, 1];

function interpolate(points: [number, number][], x: number): number | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (x <= sorted[0][0]) return sorted[0][1];
  for (let i = 1; i < sorted.length; i++) {
    const [x0, y0] = sorted[i - 1];
    const [x1, y1] = sorted[i];
    if (x <= x1) {
      if (x1 === x0) return Math.max(y0, y1);
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return sorted[sorted.length - 1][1];
}

function nearest(points: [number, number][], x: number): [number, number] | null {
  let best: [number, number] | null = null;
  for (const p of points) if (!best || Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p;
  return best;
}

/** Unit-square line chart (ROC, calibration) with a crosshair tooltip and a y = x reference. */
export function CurveChart({ series, xLabel, yLabel, mode = "interpolate", height = 250, format = (v) => v.toFixed(2), ariaLabel }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = width - M.left - M.right;
  const h = height - M.top - M.bottom;
  const sx = (v: number) => M.left + v * w;
  const sy = (v: number) => M.top + (1 - v) * h;

  const paths = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        d: s.points.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(""),
      })),
    [series, w, h],
  );

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverX(x);
  };

  const readout =
    hoverX == null
      ? null
      : series.map((s) => {
          if (mode === "nearest") {
            const p = nearest(s.points, hoverX);
            return { s, x: p?.[0] ?? null, y: p?.[1] ?? null };
          }
          return { s, x: hoverX, y: interpolate(s.points, hoverX) };
        });

  return (
    <div ref={wrap} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={sx(0)} x2={sx(1)} y1={sy(t)} y2={sy(t)} stroke="var(--color-grid)" strokeWidth={1} />
            <text x={M.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--color-ink-3)" className="tabular">
              {t.toFixed(2)}
            </text>
            <text x={sx(t)} y={sy(0) + 16} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)" className="tabular">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        <line x1={sx(0)} x2={sx(1)} y1={sy(0)} y2={sy(0)} stroke="var(--color-axis)" strokeWidth={1} />
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--color-axis)" strokeWidth={1} />
        <text x={sx(0.5)} y={height - 4} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)">
          {xLabel}
        </text>
        <text transform={`translate(12 ${sy(0.5)}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)">
          {yLabel}
        </text>

        {paths.map((s) => (
          <g key={s.id}>
            <path d={s.d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.markers &&
              s.points.map((p, i) => (
                <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={4} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />
              ))}
          </g>
        ))}

        {readout && hoverX != null && (
          <g pointerEvents="none">
            {mode === "interpolate" && <line x1={sx(hoverX)} x2={sx(hoverX)} y1={sy(0)} y2={sy(1)} stroke="var(--color-ink-3)" strokeWidth={1} />}
            {readout.map(({ s, x, y }) =>
              x != null && y != null ? (
                <circle key={s.id} cx={sx(x)} cy={sy(y)} r={4.5} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />
              ) : null,
            )}
          </g>
        )}

        <rect
          x={sx(0)}
          y={sy(1)}
          width={w}
          height={h}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHoverX(null)}
        />
      </svg>

      {readout && hoverX != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line-strong bg-[#0b111bf2] px-2.5 py-1.5 shadow-xl"
          style={{
            left: Math.min(sx(hoverX) + 12, width - 170),
            top: M.top + 4,
          }}
        >
          {mode === "interpolate" && (
            <p className="tabular mb-1 text-[10px] text-ink-3">
              {xLabel}: {format(hoverX)}
            </p>
          )}
          {readout.map(({ s, x, y }) => (
            <p key={s.id} className="flex items-center gap-1.5 text-[11px]">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              <span className="tabular font-semibold text-ink">{y == null ? "—" : format(y)}</span>
              <span className="text-ink-3">
                {s.label}
                {mode === "nearest" && x != null ? ` @ ${format(x)}` : ""}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
