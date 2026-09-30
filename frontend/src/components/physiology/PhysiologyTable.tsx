import { ArrowDown, ArrowUp, Check, Dot } from "lucide-react";
import { useMemo, useState } from "react";
import { LOWERS, RAISES } from "../../lib/colors";
import { ordinal, signed } from "../../lib/format";
import type { PhysiologyRow } from "../../lib/types";
import { useStore } from "../../state/store";
import { Section, Segmented } from "../ui/primitives";

type Filter = "all" | "abnormal" | "measured";

function Flag({ row }: { row: PhysiologyRow }) {
  if (row.imputed) return <span className="text-[11px] italic text-ink-3">imputed</span>;
  switch (row.flag) {
    case "high":
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-2">
          <ArrowUp size={12} color="#fab219" strokeWidth={2.6} aria-hidden /> High
        </span>
      );
    case "low":
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-2">
          <ArrowDown size={12} color="#fab219" strokeWidth={2.6} aria-hidden /> Low
        </span>
      );
    case "abnormal":
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-2">
          <Dot size={16} color="#fab219" strokeWidth={5} aria-hidden className="-mx-1" /> Present
        </span>
      );
    case "normal":
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-3">
          <Check size={12} aria-hidden /> {row.kind === "numeric" ? "In range" : "Absent"}
        </span>
      );
    default:
      return <span className="text-[11px] text-ink-3">—</span>;
  }
}

function PercentileTrack({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[11px] text-ink-3">—</span>;
  return (
    <div className="flex items-center gap-1.5" title={`${ordinal(value)} percentile of the development cohort`}>
      <div className="relative h-1 w-14 rounded-full bg-white/10">
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink-2"
          style={{ left: `${value}%` }}
        />
      </div>
      <span className="tabular w-8 text-[11px] text-ink-3">{ordinal(value)}</span>
    </div>
  );
}

function ContributionCell({ value, max, share }: { value: number; max: number; share: number }) {
  const w = Math.min(1, Math.abs(value) / max) * 50;
  const positive = value >= 0;
  return (
    <div className="flex items-center gap-2" title={`SHAP ${signed(value, 3)} log-odds`}>
      <div className="relative h-2.5 w-20">
        <div className="absolute inset-y-0 left-1/2 w-px bg-axis" />
        <div
          className="absolute inset-y-0 transition-all duration-500"
          style={{
            background: positive ? RAISES : LOWERS,
            width: `${w}%`,
            left: positive ? "50%" : `${50 - w}%`,
            borderRadius: positive ? "0 3px 3px 0" : "3px 0 0 3px",
          }}
        />
      </div>
      <span className="tabular w-9 text-right text-[11px] text-ink-2">{(share * 100).toFixed(0)}%</span>
    </div>
  );
}

export function PhysiologyTable() {
  const prediction = useStore((s) => s.prediction);
  const schema = useStore((s) => s.schema);
  const selected = useStore((s) => s.selected);
  const [filter, setFilter] = useState<Filter>("all");

  const { groups, max, total } = useMemo(() => {
    const rows = prediction?.physiology ?? [];
    const contribs = rows.map((r) => Math.abs(r.contributions[selected] ?? 0));
    const total = contribs.reduce((a, b) => a + b, 0) || 1;
    const max = Math.max(1e-6, ...contribs);
    const keep = rows.filter((r) =>
      filter === "all" ? true : filter === "measured" ? r.kind === "numeric" : r.flag === "high" || r.flag === "low" || r.flag === "abnormal",
    );
    const groups = (schema?.groups ?? []).map((g) => ({
      ...g,
      rows: keep.filter((r) => r.group === g.id),
    }));
    return { groups: groups.filter((g) => g.rows.length), max, total };
  }, [prediction, schema, selected, filter]);

  if (!prediction) return <div className="panel h-96 animate-pulse" aria-busy="true" />;
  const targetShort = prediction.targets[selected].short;

  return (
    <Section
      title="Physiological breakdown"
      right={
        <Segmented
          size="xs"
          ariaLabel="Filter measurements"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "abnormal", label: "Abnormal" },
            { value: "measured", label: "Measurements" },
          ]}
        />
      }
    >
      <p className="mb-2 text-[11px] text-ink-3">
        Contribution column: share of the {targetShort} explanation carried by each factor (bar = direction and size of
        its SHAP value). Reference ranges are typical adult values, shown for orientation only.
      </p>
      <div className="scroll-slim overflow-x-auto">
        <table className="tabular w-full min-w-[560px] text-left text-xs">
          <thead className="text-[11px] text-ink-3">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-2 font-medium">Factor</th>
              <th className="py-1.5 pr-2 font-medium">Value</th>
              <th className="py-1.5 pr-2 font-medium">Reference</th>
              <th className="py-1.5 pr-2 font-medium">Status</th>
              <th className="py-1.5 pr-2 font-medium">Cohort</th>
              <th className="py-1.5 font-medium">Contribution · {targetShort}</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id}>
              <tr>
                <td colSpan={6} className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                  {g.label}
                </td>
              </tr>
              {g.rows.map((r) => {
                const c = r.contributions[selected] ?? 0;
                return (
                  <tr key={r.feature} className="border-t border-line/60 hover:bg-hover/60">
                    <td className="py-1.5 pr-2 text-ink">{r.label}</td>
                    <td className="py-1.5 pr-2 text-ink-2">{r.display}</td>
                    <td className="py-1.5 pr-2 text-ink-3">{r.ref ? `${r.ref[0]}–${r.ref[1]}` : "—"}</td>
                    <td className="py-1.5 pr-2">
                      <Flag row={r} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <PercentileTrack value={r.percentile} />
                    </td>
                    <td className="py-1.5">
                      <ContributionCell value={c} max={max} share={Math.abs(c) / total} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </Section>
  );
}
