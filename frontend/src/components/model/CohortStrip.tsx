import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { pct } from "../../lib/format";
import type { Case, TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { ChartCard, DataTable, LegendKey } from "../ui/primitives";

const M = { top: 14, right: 16, bottom: 30, left: 92 };
const ROW_H = 92;
const R = 4.5;
const CORRECT = "#3987e5";
const WRONG = "#fab219";

interface Dot {
  c: Case;
  x: number;
  y: number;
  correct: boolean;
}

/** Beeswarm placement: dots keep their x and stack outwards from the row centre to avoid overlap. */
function swarm(xs: { c: Case; x: number; correct: boolean }[], centre: number): Dot[] {
  const placed: Dot[] = [];
  const limit = ROW_H / 2 - R - 2; // stay inside the row; very dense clusters may overlap slightly
  const sorted = [...xs].sort((a, b) => a.x - b.x);
  for (const d of sorted) {
    let offset = 0;
    for (let k = 0; k < 40; k++) {
      const candidate = k === 0 ? 0 : Math.ceil(k / 2) * (R * 2 + 1) * (k % 2 ? -1 : 1);
      if (Math.abs(candidate) > limit) break;
      offset = candidate;
      if (!placed.some((p) => Math.hypot(p.x - d.x, p.y - (centre + offset)) < R * 2 + 1)) break;
    }
    placed.push({ ...d, y: centre + offset });
  }
  return placed;
}

/** Every hold-out patient on one probability axis, split by angiography result. */
export function CohortStrip({ target }: { target: TargetId }) {
  const cases = useStore((s) => s.cases);
  const threshold = useStore((s) => s.metrics?.targets[target].threshold ?? 0.5);
  const short = useStore((s) => s.metrics?.targets[target].short ?? target.toUpperCase());
  const loadPatient = useStore((s) => s.loadPatient);
  const setTab = useStore((s) => s.setTab);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<Dot | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(420, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = width - M.left - M.right;
  const sx = (p: number) => M.left + p * w;
  const rows = [
    { label: target === "cad" ? "CAD" : "Stenotic", truth: 1, centre: M.top + ROW_H / 2 },
    { label: "Normal", truth: 0, centre: M.top + ROW_H + ROW_H / 2 },
  ];
  const height = M.top + ROW_H * 2 + M.bottom;

  const dots = useMemo(
    () =>
      rows.flatMap((row) =>
        swarm(
          cases
            .filter((c) => c.truth[target] === row.truth)
            .map((c) => {
              const p = c.predicted[target];
              return { c, x: sx(p), correct: p >= threshold === (row.truth === 1) };
            }),
          row.centre,
        ),
      ),
    [cases, target, threshold, w],
  );
  const wrong = dots.filter((d) => !d.correct).length;

  const open = (c: Case) => {
    loadPatient(c.features, c.title, c.id);
    setTab("analysis");
  };

  return (
    <ChartCard
      title={`Hold-out patients · ${short}`}
      subtitle={`Each dot is one of the ${cases.length} unseen patients, placed by predicted probability. ${wrong} fall on the wrong side of the ${pct(threshold)} threshold. Click a dot to open that patient.`}
      legend={
        <>
          <LegendKey kind="dot" color={CORRECT} label="Classified correctly" />
          <LegendKey kind="dot" color={WRONG} label="Misclassified" />
          <LegendKey color="#ffffff" label="Decision threshold" />
        </>
      }
      table={
        <DataTable
          head={["Patient", "Predicted", "Angiography", "Call"]}
          rows={[...cases]
            .sort((a, b) => b.predicted[target] - a.predicted[target])
            .map((c) => [
              `#${c.patient_id} · ${c.subtitle}`,
              pct(c.predicted[target]),
              c.truth[target] ? "positive" : "negative",
              c.predicted[target] >= threshold === (c.truth[target] === 1) ? "correct" : "misclassified",
            ])}
        />
      }
    >
      <div ref={wrap} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={`Hold-out patients by predicted ${short} probability`}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={M.top} y2={M.top + ROW_H * 2} stroke="var(--color-grid)" />
              <text x={sx(t)} y={height - 10} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          <text x={12} y={M.top - 3} fontSize={9.5} fill="var(--color-ink-3)" className="uppercase">
            Angiography
          </text>
          {rows.map((r) => (
            <g key={r.truth}>
              <line x1={M.left} x2={M.left + w} y1={r.centre} y2={r.centre} stroke="var(--color-axis)" opacity={0.5} />
              <text x={M.left - 14} y={r.centre} dy="0.32em" textAnchor="end" fontSize={11.5} fontWeight={600} fill="var(--color-ink-2)">
                {r.label}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={M.left + w} y1={M.top + ROW_H} y2={M.top + ROW_H} stroke="var(--color-grid)" />
          <line x1={sx(threshold)} x2={sx(threshold)} y1={M.top - 2} y2={M.top + ROW_H * 2 + 2} stroke="white" strokeWidth={1.5} opacity={0.8} />
          <text x={sx(threshold) + 4} y={M.top - 3} fontSize={9.5} fill="var(--color-ink-3)">
            threshold {pct(threshold)}
          </text>

          {dots.map((d, i) => (
            <motion.circle
              key={`${target}-${d.c.id}`}
              r={R}
              fill={d.correct ? CORRECT : WRONG}
              stroke="var(--color-surface)"
              strokeWidth={2}
              initial={{ cx: M.left, cy: d.y, opacity: 0 }}
              animate={{ cx: d.x, cy: d.y, opacity: 1 }}
              transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.004 * i }}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
              onClick={() => open(d.c)}
            >
              <title>{`#${d.c.patient_id} · ${pct(d.c.predicted[target])}`}</title>
            </motion.circle>
          ))}
          {hover && (
            <circle cx={hover.x} cy={hover.y} r={R + 4} fill="none" stroke="white" strokeWidth={1.5} pointerEvents="none" />
          )}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line-strong bg-[#0b111bf2] px-2.5 py-1.5 shadow-xl"
            style={{ left: Math.min(hover.x + 12, width - 236), top: Math.max(0, hover.y - 64) }}
          >
            <p className="tabular text-sm font-semibold text-ink">{pct(hover.c.predicted[target])}</p>
            <p className="text-[11px] text-ink-2">
              #{hover.c.patient_id} · {hover.c.subtitle}
            </p>
            <p className="text-[11px] text-ink-3">
              Angiography: {hover.c.truth[target] ? "positive" : "negative"} · {hover.correct ? "correct" : "misclassified"} · click
              to open
            </p>
          </div>
        )}
      </div>
    </ChartCard>
  );
}
