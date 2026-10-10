import clsx from "clsx";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CigaretteOff,
  HeartPulse,
  Pill,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { pct, pp } from "../../lib/format";
import {
  CLINICAL_INTERVENTIONS,
  buildCounterfactualPatient,
  computeRiskMetrics,
  getGuidelineStratification,
  type ClinicalIntervention,
} from "../../lib/interventions";
import { VESSELS, type Prediction } from "../../lib/types";
import { useStore } from "../../state/store";
import { BandChip, Meter, Section } from "../ui/primitives";

const ICONS: Record<string, typeof Pill> = {
  Pill,
  Gauge: Activity,
  CigaretteOff,
  Activity,
  Apple: HeartPulse,
};

const bandOf = (tier: string): "low" | "moderate" | "high" =>
  tier === "very-high" ? "high" : (tier as "low" | "moderate" | "high");

export function InterventionPlanner() {
  const patient = useStore((s) => s.patient);
  const baselinePrediction = useStore((s) => s.prediction);
  const showToast = useStore((s) => s.showToast);

  // Set of active intervention IDs
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set(["statin_high", "bp_optimization"]));
  const [simulatedPrediction, setSimulatedPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);

  // Compute counterfactual patient features
  const counterfactual = useMemo(
    () => buildCounterfactualPatient(patient, activeIds),
    [patient, activeIds],
  );

  // Fetch prediction for counterfactual patient
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const res = await api.predict(counterfactual);
        if (!cancelled) {
          setSimulatedPrediction(res);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [counterfactual]);

  const toggleIntervention = (id: string) => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBundle = () => {
    const applicableIds = CLINICAL_INTERVENTIONS.filter((i) => i.isApplicable(patient)).map((i) => i.id);
    setActiveIds(new Set(applicableIds));
  };

  const resetAll = () => {
    setActiveIds(new Set());
  };

  const commitToPatient = () => {
    if (!activeIds.size) return;
    for (const [key, value] of Object.entries(counterfactual)) {
      if (value !== patient[key]) {
        useStore.getState().setFeature(key, value);
      }
    }
    showToast(
      "Simulated interventions applied",
      `${activeIds.size} guideline therapies active on current patient`,
    );
  };

  const originalCad = baselinePrediction?.targets.cad.probability ?? 0.5;
  const simulatedCad = simulatedPrediction?.targets.cad.probability ?? originalCad;
  const cadThreshold = baselinePrediction?.targets.cad.threshold ?? 0.5;

  const cadMetrics = computeRiskMetrics(originalCad, simulatedCad, cadThreshold);

  // Guideline tiers before and after
  const beforeVesselProbs = useMemo(() => {
    if (!baselinePrediction) return {};
    return {
      lad: baselinePrediction.targets.lad.probability,
      lcx: baselinePrediction.targets.lcx.probability,
      rca: baselinePrediction.targets.rca.probability,
    };
  }, [baselinePrediction]);

  const afterVesselProbs = useMemo(() => {
    if (!simulatedPrediction) return {};
    return {
      lad: simulatedPrediction.targets.lad.probability,
      lcx: simulatedPrediction.targets.lcx.probability,
      rca: simulatedPrediction.targets.rca.probability,
    };
  }, [simulatedPrediction]);

  const beforeGuideline = getGuidelineStratification(originalCad, beforeVesselProbs);
  const afterGuideline = getGuidelineStratification(simulatedCad, afterVesselProbs);

  return (
    <Section
      title="Intervention & Therapy Planner"
      icon={Sparkles}
      right={
        <span className="chip border-accent/30 bg-accent-soft/20 text-[10px] text-accent">
          GDMT Counterfactual
        </span>
      }
    >
      {/* Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface/60 p-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Sparkles size={14} />
          </span>
          <div>
            <p className="text-xs font-semibold text-ink">Guideline-Directed Therapies</p>
            <p className="text-[10px] text-ink-3">ESC 2024 / AHA Primary & Secondary Prevention</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={applyBundle}
            className="btn text-[11px] font-medium text-accent hover:border-accent/50"
            title="Enable all indicated guideline therapies"
          >
            <Zap size={12} className="text-accent" /> Bundle all GDMT
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="btn-ghost text-[11px]"
            title="Clear all simulated interventions"
          >
            <RotateCcw size={12} /> Clear
          </button>
        </div>
      </div>

      {/* Intervention Toggle Cards */}
      <div className="mt-3 space-y-2">
        {CLINICAL_INTERVENTIONS.map((item: ClinicalIntervention) => {
          const active = activeIds.has(item.id);
          const applicable = item.isApplicable(patient);
          const Icon = ICONS[item.iconName] || Pill;

          return (
            <motion.div
              key={item.id}
              whileHover={{ scale: 1.008 }}
              className={clsx(
                "relative flex items-center justify-between gap-3 rounded-xl border p-2.5 transition-all",
                active
                  ? "border-accent/40 bg-accent-soft/20 shadow-[0_0_15px_-4px_rgba(92,200,245,0.25)]"
                  : applicable
                    ? "border-line bg-raised/40 hover:border-line-strong hover:bg-raised/70"
                    : "border-line/40 bg-page/30 opacity-60",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={clsx(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs transition-colors",
                    active
                      ? "border-accent bg-accent text-page"
                      : "border-line-strong bg-surface text-ink-3",
                  )}
                >
                  <Icon size={14} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-ink">{item.title}</p>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{
                        backgroundColor: active ? "rgb(92 200 245 / 0.2)" : "rgb(255 255 255 / 0.06)",
                        color: active ? "#5cc8f5" : "#a1adbe",
                      }}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-3">{item.subtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleIntervention(item.id)}
                  aria-pressed={active}
                  className={clsx(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    active ? "bg-accent" : "bg-surface ring-1 ring-line-strong",
                  )}
                >
                  <span
                    className={clsx(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      active ? "translate-x-4" : "translate-x-0 bg-ink-3",
                    )}
                  />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Counterfactual Impact Scorecard */}
      <div className="mt-4 rounded-2xl border border-line bg-surface/80 p-3.5 backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-line pb-2.5">
          <div className="flex items-center gap-2">
            <TrendingDown size={16} className="text-risk-low" />
            <p className="text-xs font-semibold uppercase tracking-wider text-ink">
              Simulated Risk Impact
            </p>
          </div>
          {loading && (
            <span className="flex items-center gap-1.5 text-[10px] text-accent animate-pulse">
              <Sparkles size={11} /> Re-scoring counterfactual…
            </span>
          )}
        </div>

        {/* CAD Summary Before vs After */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {/* Baseline */}
          <div className="rounded-xl border border-line bg-page/40 p-2.5">
            <p className="label-caps">Current Risk</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-ink">
                {pct(originalCad)}
              </span>
              <span className="text-[10px] text-ink-3">CAD</span>
            </div>
            <div className="mt-2">
              <Meter value={originalCad} />
            </div>
            <div className="mt-1.5">
              <BandChip band={bandOf(beforeGuideline.tier)} label={beforeGuideline.label} />
            </div>
          </div>

          {/* Simulated After */}
          <div className="rounded-xl border border-accent/40 bg-accent-soft/10 p-2.5">
            <p className="label-caps text-accent">With Interventions</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-accent">
                {pct(simulatedCad)}
              </span>
              <span className="text-[10px] text-accent/80">CAD</span>
              {cadMetrics.absoluteReduction > 0.005 && (
                <span className="tabular ml-auto rounded bg-risk-low/20 px-1 py-0.5 text-[10px] font-semibold text-risk-low">
                  -{pp(cadMetrics.absoluteReduction * 100)}
                </span>
              )}
            </div>
            <div className="mt-2">
              <Meter value={simulatedCad} />
            </div>
            <div className="mt-1.5">
              <BandChip band={bandOf(afterGuideline.tier)} label={afterGuideline.label} />
            </div>
          </div>
        </div>

        {/* Clinical Benefit Metrics */}
        {cadMetrics.absoluteReduction > 0.01 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-center"
          >
            <div className="rounded-lg bg-page/40 p-1.5">
              <p className="text-[10px] text-ink-3">Absolute Risk Red.</p>
              <p className="tabular text-xs font-semibold text-risk-low">
                -{pp(cadMetrics.absoluteReduction * 100)}
              </p>
            </div>
            <div className="rounded-lg bg-page/40 p-1.5">
              <p className="text-[10px] text-ink-3">Relative Risk Red.</p>
              <p className="tabular text-xs font-semibold text-accent">
                -{pct(cadMetrics.relativeReduction)}
              </p>
            </div>
            <div className="rounded-lg bg-page/40 p-1.5">
              <p className="text-[10px] text-ink-3">5-Year Est. NNT</p>
              <p className="tabular text-xs font-semibold text-ink">
                {cadMetrics.nnt5Year} <span className="text-[9px] font-normal text-ink-3">patients</span>
              </p>
            </div>
          </motion.div>
        )}

        {/* Per-Vessel Stenosis Impact */}
        <div className="mt-3 space-y-1.5 border-t border-line pt-2.5">
          <p className="label-caps">Coronary Artery Stenosis Shift</p>
          {VESSELS.map((v) => {
            const baseProb = baselinePrediction?.targets[v].probability ?? 0;
            const simProb = simulatedPrediction?.targets[v].probability ?? baseProb;
            const threshold = baselinePrediction?.targets[v].threshold ?? 0.5;
            const delta = baseProb - simProb;
            const crossed = baseProb >= threshold && simProb < threshold;

            return (
              <div
                key={v}
                className="flex items-center justify-between rounded-lg bg-page/30 px-2 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold uppercase text-ink">{v}</span>
                  <span className="text-[11px] text-ink-3">
                    {pct(baseProb)} <ArrowRight size={10} className="inline text-ink-3" />{" "}
                    <span className="font-medium text-ink">{pct(simProb)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {crossed && (
                    <span className="rounded bg-risk-low/20 px-1 py-0.5 text-[9px] font-semibold text-risk-low">
                      Below threshold!
                    </span>
                  )}
                  {delta > 0.01 && (
                    <span className="tabular font-medium text-risk-low">
                      -{pp(delta * 100)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Guideline Recommendations */}
        <div className="mt-3 rounded-xl border border-line bg-page/50 p-2.5 text-[11px] leading-relaxed text-ink-2">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <ShieldCheck size={13} className="text-accent" /> ESC Clinical Recommendation
          </p>
          <p className="mt-1 text-ink-3">{afterGuideline.therapeuticRecommendation}</p>
        </div>

        {/* Apply Button */}
        <motion.button
          type="button"
          onClick={commitToPatient}
          disabled={!activeIds.size}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="shimmer relative mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3987e5] to-accent py-2.5 text-xs font-semibold text-page shadow-lg disabled:opacity-40"
        >
          <CheckCircle2 size={14} /> Apply Simulated Interventions to Patient
        </motion.button>
      </div>
    </Section>
  );
}
