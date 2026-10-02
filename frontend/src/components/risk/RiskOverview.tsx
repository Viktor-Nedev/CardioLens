import clsx from "clsx";
import { Activity, CheckCircle2, CircleDashed, FlaskConical, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { STRUCTURE_BY_NODE, TARGET_NODE } from "../../anatomy/registry";
import { riskColor } from "../../lib/colors";
import { pct, pp } from "../../lib/format";
import { VESSELS, type TargetId, type TargetPrediction } from "../../lib/types";
import { useIsModified, useStore } from "../../state/store";
import { RadialGauge } from "../ui/RadialGauge";
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

function CadHero({ pred }: { pred: TargetPrediction }) {
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected);
  const active = selected === "cad";
  return (
    <motion.button
      type="button"
      onClick={() => select("cad")}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={clsx(
        "grid w-full grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
        active ? "glow-border" : "border-line bg-white/[0.02] hover:bg-white/[0.04]",
      )}
    >
      <RadialGauge value={pred.probability} threshold={pred.threshold} interval={pred.interval} label="CAD probability" />
      <div className="min-w-0 space-y-2">
        <p className="text-xs font-medium text-ink-2">Overall coronary artery disease</p>
        <BandChip band={pred.risk_band.id} label={pred.risk_band.label} />
        <p className="text-[11px] leading-snug text-ink-2">
          <span className="font-semibold text-ink">{pred.positive ? "Above" : "Below"}</span> the decision threshold of{" "}
          {pct(pred.threshold)}
        </p>
        <p className="tabular text-[11px] text-ink-3">
          {pred.interval ? `80% interval ${pct(pred.interval[0])}–${pct(pred.interval[1])}` : "Point estimate"}
        </p>
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
  return (
    <motion.button
      type="button"
      onClick={() => select(pred.id)}
      onMouseEnter={() => setHovered(pred.id)}
      onMouseLeave={() => setHovered(null)}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.15 + index * 0.08, duration: 0.45, ease: EASE_OUT }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={clsx(
        "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
        active
          ? "glow-border"
          : hovered === pred.id
            ? "border-line-strong bg-white/[0.05]"
            : "border-line bg-white/[0.02] hover:bg-white/[0.04]",
      )}
    >
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
        <AnimatedNumber value={pred.probability} format={pct} className="text-lg font-semibold text-ink" />
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
