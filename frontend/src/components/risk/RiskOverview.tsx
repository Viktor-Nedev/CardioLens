import clsx from "clsx";
import { Activity, CheckCircle2, CircleDashed, FlaskConical, ShieldCheck, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { STRUCTURE_BY_NODE, TARGET_NODE } from "../../anatomy/registry";
import { riskColor } from "../../lib/colors";
import { interval, pct, pp } from "../../lib/format";
import { getGuidelineStratification } from "../../lib/interventions";
import { VESSELS, type TargetId, type TargetPrediction } from "../../lib/types";
import { useIsModified, useStore } from "../../state/store";
import { RadialGauge } from "../ui/RadialGauge";
import { ChangeRing, FloatingDelta, spotlightMove, useValueChange } from "../ui/effects";
import { AnimatedNumber, BandChip, EASE_OUT, Meter } from "../ui/primitives";

function Delta({ target }: { target: TargetId }) {
  const current = useStore((s) => s.prediction?.targets[target]?.probability);
  const base = useStore((s) => s.baseline?.prediction?.targets[target]?.probability);
  const modified = useIsModified();
  if (!modified || current == null || base == null) return null;
  const d = (current - base) * 100;
  if (Math.abs(d) < 0.05) return null;
  return (
    <motion.span
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="tabular text-[11px] text-ink-3"
      title="Change versus the loaded case (what-if)"
    >
      {pp(d)} vs case
    </motion.span>
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

/** Where this patient's CAD probability sits among the hold-out patients. */
function CohortPosition({ value }: { value: number }) {
  const cases = useStore((s) => s.cases);
  if (!cases.length) return null;
  const below = cases.filter((c) => c.predicted.cad < value).length;
  const share = below / cases.length;
  return (
    <div className="text-[11px] text-ink-3" title="Share of the 61 hold-out patients with a lower predicted CAD probability">
      <span>
        Higher than <span className="tabular font-semibold text-ink-2">{Math.round(share * 100)}%</span> of hold-out patients
      </span>
      <div className="relative mt-1 h-1.5 w-full rounded-full bg-white/[0.07]" aria-hidden>
        {cases.map((c) => (
          <span
            key={c.id}
            className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-white/25"
            style={{ left: `${c.predicted.cad * 100}%` }}
          />
        ))}
        <motion.span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
          initial={false}
          animate={{ left: `${value * 100}%`, backgroundColor: riskColor(value) }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}

function CadHero({ pred }: { pred: TargetPrediction }) {
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected);
  const active = selected === "cad";
  const change = useValueChange(pred.probability);
  const vesselProbs = useStore((s) => {
    const p = s.prediction?.targets;
    return p ? { lad: p.lad.probability, lcx: p.lcx.probability, rca: p.rca.probability } : {};
  });
  const guideline = getGuidelineStratification(pred.probability, vesselProbs);

  return (
    <motion.button
      type="button"
      onClick={() => select("cad")}
      onPointerMove={spotlightMove}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={clsx(
        "spotlight grid w-full grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
        active ? "glow-border" : "border-line bg-white/[0.02] hover:bg-white/[0.04]",
      )}
    >
      <ChangeRing change={change} color={riskColor(pred.probability)} />
      <div className="relative">
        <RadialGauge value={pred.probability} threshold={pred.threshold} interval={pred.interval} label="CAD probability" />
        <FloatingDelta change={change} placement="top" />
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-xs font-medium text-ink-2">Overall coronary artery disease</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <BandChip band={pred.risk_band.id} label={pred.risk_band.label} />
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: `${guideline.color}22`,
              color: guideline.color,
              border: `1px solid ${guideline.color}44`,
            }}
            title={guideline.escCriteria}
          >
            <ShieldCheck size={11} /> ESC {guideline.tier === "very-high" ? "Very High" : guideline.tier === "high" ? "High" : guideline.tier === "moderate" ? "Moderate" : "Low"}
          </span>
        </div>
        <p className="text-[11px] leading-snug text-ink-2">
          <span className="font-semibold text-ink">{pred.positive ? "Above" : "Below"}</span> the decision threshold of{" "}
          {pct(pred.threshold)}
        </p>
        <p className="tabular text-[11px] text-ink-3">
          {pred.interval ? `80% interval ${interval(pred.interval[0], pred.interval[1])}` : "Point estimate"}
        </p>
        <CohortPosition value={pred.probability} />
        <div className="flex flex-col gap-1">
          <Truth target="cad" />
          <Delta target="cad" />
        </div>
      </div>
    </motion.button>
  );
}

function VesselRow({ pred, index }: { pred: TargetPrediction; index: number }) {
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);
  const setHovered = useStore((s) => s.setHovered);
  const active = selected === pred.id;
  const color = riskColor(pred.probability);
  const change = useValueChange(pred.probability);
  return (
    <motion.button
      type="button"
      onClick={() => select(pred.id)}
      onMouseEnter={() => setHovered(pred.id)}
      onMouseLeave={() => setHovered(null)}
      onPointerMove={spotlightMove}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.15 + index * 0.08, duration: 0.45, ease: EASE_OUT }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={clsx(
        "spotlight w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
        active
          ? "glow-border"
          : hovered === pred.id
            ? "border-line-strong bg-white/[0.05]"
            : "border-line bg-white/[0.02] hover:bg-white/[0.04]",
      )}
    >
      <ChangeRing change={change} color={color} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            {pred.positive && (
              <span className="animate-ping-soft absolute inset-0 rounded-full" style={{ background: color }} />
            )}
            <span className="relative h-2.5 w-2.5 rounded-full transition-colors duration-700" style={{ background: color }} />
          </span>
          <span className="text-sm font-semibold text-ink">{pred.short}</span>
          <span className="truncate text-[11px] text-ink-3">{STRUCTURE_BY_NODE[TARGET_NODE[pred.id]].label}</span>
        </div>
        <span className="relative">
          <AnimatedNumber value={pred.probability} format={pct} className="text-lg font-semibold text-ink" />
          <FloatingDelta change={change} />
        </span>
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
    </motion.button>
  );
}

export function RiskOverview() {
  const prediction = useStore((s) => s.prediction);
  const predicting = useStore((s) => s.predicting);
  const activeCase = useStore((s) => s.cases.find((c) => c.id === s.activeCaseId));
  const modified = useIsModified();

  if (!prediction) {
    return <div className="panel skeleton h-80" aria-busy="true" />;
  }
  const stenotic = VESSELS.filter((v) => prediction.targets[v].positive).length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
      className="panel space-y-3 p-4"
      data-tour="risk"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="label-caps flex items-center gap-1.5">
          <Activity size={13} className={clsx("text-accent", predicting && "animate-pulse-soft")} aria-hidden />
          Risk overview
        </h2>
        {activeCase && !modified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-ink-2">
            <FlaskConical size={11} className="text-accent" /> Hold-out patient · unseen in training
          </span>
        ) : modified ? (
          <span className="rounded-full border border-[#fab219]/30 bg-[#fab219]/10 px-2 py-0.5 text-[10px] font-medium text-ink-2">
            What-if · inputs edited
          </span>
        ) : null}
      </header>
      <CadHero pred={prediction.targets.cad} />
      <div className="flex items-center justify-between pt-1">
        <h3 className="text-xs font-medium text-ink-2">Vessel-level stenosis (≥50%)</h3>
        <span className="text-[11px] text-ink-3">
          <AnimatedNumber value={stenotic} format={(v) => String(Math.round(v))} /> of 3 above threshold
        </span>
      </div>
      <div className="space-y-2">
        {VESSELS.map((v, i) => (
          <VesselRow key={v} pred={prediction.targets[v]} index={i} />
        ))}
      </div>
    </motion.section>
  );
}
