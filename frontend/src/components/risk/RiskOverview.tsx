import clsx from "clsx";
import { CheckCircle2, CircleDashed, FlaskConical, XCircle } from "lucide-react";
import { STRUCTURE_BY_NODE, TARGET_NODE } from "../../anatomy/registry";
import { riskColor } from "../../lib/colors";
import { pct, pp } from "../../lib/format";
import { VESSELS, type TargetId, type TargetPrediction } from "../../lib/types";
import { useIsModified, useStore } from "../../state/store";
import { BandChip, Meter } from "../ui/primitives";

function Delta({ target }: { target: TargetId }) {
  const current = useStore((s) => s.prediction?.targets[target]?.probability);
  const base = useStore((s) => s.baseline?.prediction?.targets[target]?.probability);
  const modified = useIsModified();
  if (!modified || current == null || base == null) return null;
  const d = (current - base) * 100;
  if (Math.abs(d) < 0.05) return null;
  return (
    <span className="tabular text-[11px] text-ink-3" title="Change versus the loaded case (what-if)">
      {pp(d)} vs case
    </span>
  );
}

function Truth({ target }: { target: TargetId }) {
  const truth = useStore((s) => s.cases.find((c) => c.id === s.activeCaseId)?.truth[target]);
  const modified = useIsModified();
  if (truth == null) return null;
  const label = target === "cad" ? (truth ? "CAD" : "Normal") : truth ? "Stenotic" : "Normal";
  const Icon = modified ? CircleDashed : truth ? XCircle : CheckCircle2;
  return (
    <span
      className={clsx("inline-flex items-center gap-1 text-[11px]", modified ? "text-ink-3 line-through" : "text-ink-2")}
      title={modified ? "Inputs edited: ground truth no longer applies" : "Angiography result for this hold-out patient"}
    >
      <Icon size={12} aria-hidden /> Angio: {label}
    </span>
  );
}

function CadHero({ pred }: { pred: TargetPrediction }) {
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected);
  return (
    <button
      type="button"
      onClick={() => select("cad")}
      className={clsx(
        "w-full rounded-xl border p-3.5 text-left transition-colors",
        selected === "cad" ? "border-accent/60 bg-accent-soft" : "border-line bg-raised/40 hover:bg-hover",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-ink-2">Overall coronary artery disease</p>
          <p className="mt-1 text-5xl font-semibold leading-none tracking-tight text-ink">{pct(pred.probability)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <BandChip band={pred.risk_band.id} label={pred.risk_band.label} />
          <span className="text-[11px] text-ink-2">
            {pred.positive ? "Above" : "Below"} threshold {pct(pred.threshold)}
          </span>
        </div>
      </div>
      <div className="mt-3">
        <Meter value={pred.probability} threshold={pred.threshold} interval={pred.interval} label="CAD probability" />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <span className="tabular">
          {pred.interval ? `80% bootstrap interval ${pct(pred.interval[0])}–${pct(pred.interval[1])}` : "Point estimate"}
        </span>
        <span className="flex items-center gap-3">
          <Delta target="cad" />
          <Truth target="cad" />
        </span>
      </div>
    </button>
  );
}

function VesselRow({ pred }: { pred: TargetPrediction }) {
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);
  const setHovered = useStore((s) => s.setHovered);
  const active = selected === pred.id;
  return (
    <button
      type="button"
      onClick={() => select(pred.id)}
      onMouseEnter={() => setHovered(pred.id)}
      onMouseLeave={() => setHovered(null)}
      className={clsx(
        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
        active ? "border-accent/60 bg-accent-soft" : hovered === pred.id ? "border-line-strong bg-hover" : "border-line hover:bg-hover",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: riskColor(pred.probability) }} aria-hidden />
          <span className="text-sm font-semibold text-ink">{pred.short}</span>
          <span className="truncate text-[11px] text-ink-3">{STRUCTURE_BY_NODE[TARGET_NODE[pred.id]].label}</span>
        </div>
        <span className="tabular text-lg font-semibold text-ink">{pct(pred.probability)}</span>
      </div>
      <div className="mt-2">
        <Meter value={pred.probability} threshold={pred.threshold} interval={pred.interval} size="sm" label={`${pred.short} probability`} />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <BandChip band={pred.risk_band.id} label={pred.risk_band.label} />
        <span className="flex items-center gap-3">
          <Delta target={pred.id} />
          <Truth target={pred.id} />
        </span>
      </div>
    </button>
  );
}

export function RiskOverview() {
  const prediction = useStore((s) => s.prediction);
  const predicting = useStore((s) => s.predicting);
  const activeCase = useStore((s) => s.cases.find((c) => c.id === s.activeCaseId));
  const modified = useIsModified();

  if (!prediction) {
    return <div className="panel h-72 animate-pulse bg-surface" aria-busy="true" />;
  }
  const stenotic = VESSELS.filter((v) => prediction.targets[v].positive).length;

  return (
    <section className={clsx("panel space-y-2.5 p-3.5 transition-opacity", predicting && "opacity-80")}>
      <header className="flex items-center justify-between">
        <h2 className="label-caps">Risk overview</h2>
        {activeCase && !modified ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
            <FlaskConical size={12} /> Hold-out patient (unseen in training)
          </span>
        ) : modified ? (
          <span className="text-[11px] text-ink-3">What-if: inputs edited</span>
        ) : null}
      </header>
      <CadHero pred={prediction.targets.cad} />
      <div className="flex items-center justify-between pt-1">
        <h3 className="text-xs font-medium text-ink-2">Vessel-level stenosis (≥50%)</h3>
        <span className="text-[11px] text-ink-3">
          {stenotic} of 3 above threshold
        </span>
      </div>
      <div className="space-y-1.5">
        {VESSELS.map((v) => (
          <VesselRow key={v} pred={prediction.targets[v]} />
        ))}
      </div>
    </section>
  );
}
