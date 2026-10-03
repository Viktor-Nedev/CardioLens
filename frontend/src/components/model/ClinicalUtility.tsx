import clsx from "clsx";
import { useMemo } from "react";
import { CONTEXT, SERIES } from "../../lib/colors";
import { num, pct, rate } from "../../lib/format";
import type { Case, TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { ChartCard, DataTable, LegendKey } from "../ui/primitives";
import { CurveChart } from "./CurveChart";

/** Rank-based ROC-AUC (Mann–Whitney U); null when a class is missing. */
export function rocAuc(y: number[], p: number[]): number | null {
  const pos = p.filter((_, i) => y[i] === 1);
  const neg = p.filter((_, i) => y[i] === 0);
  if (!pos.length || !neg.length) return null;
  let s = 0;
  for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

function netBenefit(y: number[], p: number[], t: number): number {
  const n = y.length;
  let tp = 0;
  let fp = 0;
  p.forEach((v, i) => {
    if (v >= t) {
      if (y[i] === 1) tp++;
      else fp++;
    }
  });
  return tp / n - (fp / n) * (t / (1 - t));
}

/**
 * Decision curve analysis on the hold-out patients: net benefit of acting on the model
 * across threshold probabilities, against treating everyone or no one.
 */
export function DecisionCurve({ target }: { target: TargetId }) {
  const cases = useStore((s) => s.cases);
  const report = useStore((s) => s.metrics?.targets[target]);

  const { series, prevalence, yDomain, table } = useMemo(() => {
    const y = cases.map((c) => c.truth[target]);
    const p = cases.map((c) => c.predicted[target]);
    const prev = y.reduce<number>((a, b) => a + b, 0) / Math.max(1, y.length);
    const ts = Array.from({ length: 95 }, (_, i) => (i + 1) / 100);
    // Clamp to the plotted range so a noisy tail at extreme thresholds stays inside the frame.
    const model: [number, number][] = ts.map((t) => [t, Math.max(-0.1, netBenefit(y, p, t))]);
    const all: [number, number][] = ts.map((t) => [t, prev - (1 - prev) * (t / (1 - t))]);
    const top = Math.max(prev, ...model.map((m) => m[1]));
    const series = [
      { id: "model", label: "Model", color: SERIES, points: model },
      { id: "all", label: "Treat all", color: CONTEXT, points: all.filter((a) => a[1] >= -0.1) },
    ];
    const table = [0.1, 0.2, 0.3, 0.5, 0.7].map((t) => [
      rate(t),
      num(netBenefit(y, p, t), 3),
      num(prev - (1 - prev) * (t / (1 - t)), 3),
      "0.000",
    ]);
    return { series, prevalence: prev, yDomain: [-0.1, Math.ceil((top + 0.05) * 10) / 10] as [number, number], table };
  }, [cases, target]);

  const yTicks = [yDomain[0], 0, ...[0.2, 0.4, 0.6, 0.8, 1].filter((v) => v <= yDomain[1])];

  return (
    <ChartCard
      title="Decision curve · clinical net benefit"
      subtitle={`Hold-out patients (n=${cases.length}, prevalence ${pct(prevalence)}). Above "treat all" and zero = acting on the model helps at that threshold.`}
      legend={
        <>
          <LegendKey color={SERIES} label="Model" />
          <LegendKey color={CONTEXT} label="Treat all" />
          <LegendKey color="#2c3749" label="Treat none (0)" />
        </>
      }
      table={<DataTable head={["Threshold", "Model", "Treat all", "Treat none"]} rows={table} />}
    >
      <CurveChart
        series={series}
        xLabel="Threshold probability"
        yLabel="Net benefit"
        yDomain={yDomain}
        yTicks={yTicks}
        xTicks={[0, 0.25, 0.5, 0.75, 1]}
        diagonal={false}
        hLines={[0]}
        format={(v) => v.toFixed(3)}
        ariaLabel={`Decision curve for ${target.toUpperCase()}`}
      />
      {report && (
        <p className="mt-2 text-[11px] text-ink-3">
          The deployed decision threshold is {pct(report.threshold)}; net benefit there:{" "}
          <span className="tabular text-ink-2">
            {num(
              netBenefit(
                cases.map((c) => c.truth[target]),
                cases.map((c) => c.predicted[target]),
                report.threshold,
              ),
              3,
            )}
          </span>
          .
        </p>
      )}
    </ChartCard>
  );
}

interface Group {
  label: string;
  members: Case[];
}

/** Performance by sex and age band on the hold-out set; small groups are flagged, not hidden. */
export function SubgroupTable({ target }: { target: TargetId }) {
  const cases = useStore((s) => s.cases);
  const threshold = useStore((s) => s.metrics?.targets[target].threshold ?? 0.5);

  const groups: Group[] = useMemo(() => {
    const age = (c: Case) => Number(c.features.age);
    return [
      { label: "All hold-out", members: cases },
      { label: "Women", members: cases.filter((c) => c.features.sex_male === 0) },
      { label: "Men", members: cases.filter((c) => c.features.sex_male === 1) },
      { label: "Age < 55", members: cases.filter((c) => age(c) < 55) },
      { label: "Age 55–65", members: cases.filter((c) => age(c) >= 55 && age(c) <= 65) },
      { label: "Age > 65", members: cases.filter((c) => age(c) > 65) },
    ];
  }, [cases]);

  const rows = groups.map((g) => {
    const y = g.members.map((c) => c.truth[target]);
    const p = g.members.map((c) => c.predicted[target]);
    const auc = rocAuc(y, p);
    const pos = y.filter((v) => v === 1).length;
    const neg = y.length - pos;
    const tp = g.members.filter((c) => c.truth[target] === 1 && c.predicted[target] >= threshold).length;
    const tn = g.members.filter((c) => c.truth[target] === 0 && c.predicted[target] < threshold).length;
    return { g, auc, pos, neg, sens: pos ? tp / pos : null, spec: neg ? tn / neg : null, small: y.length < 15 || !pos || !neg };
  });

  return (
    <ChartCard
      title="Subgroup check"
      subtitle="Hold-out performance by sex and age. Groups under 15 patients or missing a class are too small to judge."
    >
      <div className="scroll-slim overflow-x-auto rounded-lg border border-line">
        <table className="tabular w-full text-left text-xs">
          <thead className="bg-raised text-ink-3">
            <tr>
              {["Group", "n", "Positives", "ROC-AUC", "Sensitivity", "Specificity"].map((h) => (
                <th key={h} className="px-2.5 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.g.label} className={clsx("border-t border-line", r.small ? "text-ink-3" : "text-ink-2")}>
                <td className="px-2.5 py-1.5 font-medium text-ink">
                  {r.g.label}
                  {r.small && <span className="ml-1.5 rounded bg-[#fab219]/10 px-1 text-[10px] text-[#fab219]">small</span>}
                </td>
                <td className="px-2.5 py-1.5">{r.g.members.length}</td>
                <td className="px-2.5 py-1.5">{r.pos}</td>
                <td className="px-2.5 py-1.5">
                  {r.auc == null ? "—" : (
                    <span className="inline-flex items-center gap-2">
                      {r.auc.toFixed(2)}
                      <span className="relative inline-block h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.07]">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-series"
                          style={{ width: `${Math.max(0, (r.auc - 0.5) / 0.5) * 100}%` }}
                        />
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-1.5">{r.sens == null ? "—" : rate(r.sens)}</td>
                <td className="px-2.5 py-1.5">{r.spec == null ? "—" : rate(r.spec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">AUC bar starts at 0.5 (chance). Sensitivity and specificity use the deployed threshold.</p>
    </ChartCard>
  );
}
