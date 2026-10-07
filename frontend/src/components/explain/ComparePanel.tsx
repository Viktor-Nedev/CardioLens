import clsx from "clsx";
import { ArrowUpRight, GitCompareArrows, Info, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { LOWERS, RAISES, riskColor, withAlpha } from "../../lib/colors";
import { contrastPrediction, nearestUnlike } from "../../lib/contrast";
import { pct } from "../../lib/format";
import { TARGET_ORDER, type Case, type Patient, type Prediction } from "../../lib/types";
import { useIsModified, useStore } from "../../state/store";
import { EASE_OUT, Section } from "../ui/primitives";
import { ShapWaterfall } from "./ShapWaterfall";

const SPRING = { type: "spring", stiffness: 120, damping: 18 } as const;

// Predictions of comparison patients, keyed by their inputs.
const cache = new Map<string, Prediction>();

interface Comparator {
  key: string;
  name: string;
  short: string;
  patient: Patient;
  case?: Case;
}

/** Contrastive explanation: why this patient's estimates differ from another patient's. */
export function ComparePanel() {
  const prediction = useStore((s) => s.prediction);
  const patient = useStore((s) => s.patient);
  const baseline = useStore((s) => s.baseline);
  const cases = useStore((s) => s.cases);
  const schema = useStore((s) => s.schema);
  const importance = useStore((s) => s.importance);
  const activeCaseId = useStore((s) => s.activeCaseId);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const loadPatient = useStore((s) => s.loadPatient);
  const modified = useIsModified();
  const [choice, setChoice] = useState<string | null>(null);
  // The comparison prediction is tagged with the inputs it belongs to, so a stale one is never shown.
  const [other, setOther] = useState<{ key: string; pred: Prediction } | null>(null);
  const [loading, setLoading] = useState(false);

  const activeCase = cases.find((c) => c.id === activeCaseId);
  // The opposite of what is known (angiography) or, after edits, of the model's call.
  const outcome: 0 | 1 =
    activeCase && !modified ? activeCase.truth.cad : prediction?.targets.cad.positive ? 1 : 0;
  const unlike = useMemo(
    () => (schema ? nearestUnlike(patient, cases, schema.features, importance, outcome, activeCaseId) : undefined),
    [patient, cases, schema, importance, outcome, activeCaseId],
  );

  const effective = choice ?? (modified && baseline ? "baseline" : "auto");
  const comparator: Comparator | null = useMemo(() => {
    if (effective === "baseline" && baseline) {
      return { key: "baseline", name: `Before edits (${baseline.label})`, short: "Before edits", patient: baseline.patient, case: activeCase };
    }
    const c = effective === "auto" ? unlike : cases.find((x) => x.id === effective);
    return c
      ? {
          key: c.id,
          name: `#${c.patient_id} · ${c.subtitle} · ${c.truth.cad ? "CAD at angiography" : "normal angiography"}`,
          short: `Patient #${c.patient_id}`,
          patient: c.features,
          case: c,
        }
      : null;
  }, [effective, baseline, unlike, cases, activeCase]);

  const key = comparator ? JSON.stringify(comparator.patient) : "";
  useEffect(() => {
    if (!comparator) return;
    const hit = cache.get(key);
    if (hit) {
      setOther({ key, pred: hit });
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    api
      .predict(comparator.patient, ctrl.signal)
      .then((p) => {
        cache.set(key, p);
        if (cache.size > 40) cache.delete(cache.keys().next().value as string);
        setOther({ key, pred: p });
        setLoading(false);
      })
      .catch(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
    // `comparator.patient` is captured through `key`.
  }, [key]);

  if (!prediction || !schema) return <div className="panel skeleton h-96" aria-busy="true" />;

  const otherPred = other && other.key === key ? other.pred : null;
  const a = prediction.targets[selected];
  const b = otherPred?.targets[selected];
  const otherName = comparator?.key === "baseline" ? "the unedited case" : comparator?.short.toLowerCase() ?? "";
  const contrast = a && b ? contrastPrediction(a, b) : null;
  const gap = a && b ? a.probability - b.probability : 0;
  const identical = contrast ? contrast.contributions.every((c) => Math.abs(c.contribution) < 1e-9) : false;

  return (
    <Section
      title="Compare with another patient"
      icon={GitCompareArrows}
      right={loading ? <Loader2 size={13} className="animate-spin text-accent" aria-label="Updating" /> : undefined}
    >
      <label className="flex items-center gap-2 text-[11px] text-ink-3">
        <span className="shrink-0">Compare with</span>
        <select
          value={effective}
          onChange={(e) => setChoice(e.target.value)}
          className="min-w-0 flex-1 cursor-pointer rounded-lg border border-line bg-black/30 px-2 py-1 text-[11px] text-ink-2 focus:border-accent focus:outline-none"
          aria-label="Patient to compare with"
        >
          {modified && baseline && <option value="baseline">Before edits ({baseline.label})</option>}
          {unlike && (
            <option value="auto">
              Most similar patient with a different result (#{unlike.patient_id}, {unlike.truth.cad ? "CAD" : "normal"})
            </option>
          )}
          <optgroup label="Hold-out patients">
            {cases
              .filter((c) => c.id !== activeCaseId || modified)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.patient_id} · {c.subtitle} · {c.truth.cad ? "CAD" : "normal"}
                </option>
              ))}
          </optgroup>
        </select>
      </label>

      {/* A vs B for every target: ring = the other patient, dot = this patient */}
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between px-1 text-[10.5px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-ink-2" /> This patient
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ink-2" />
            <span className="truncate">{comparator?.name ?? "—"}</span>
          </span>
        </div>
        {TARGET_ORDER.map((t, i) => {
          const pa = prediction.targets[t].probability;
          const pb = otherPred?.targets[t].probability;
          const active = t === selected;
          const up = pb != null && pa >= pb;
          const color = up ? RAISES : LOWERS;
          return (
            <button
              key={t}
              type="button"
              onClick={() => select(t)}
              className={clsx(
                "grid w-full grid-cols-[38px_minmax(0,1fr)_58px] items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors",
                active ? "bg-white/[0.06] ring-1 ring-white/[0.08]" : "hover:bg-white/[0.03]",
              )}
              aria-pressed={active}
            >
              <span className={clsx("text-[11px] font-semibold", active ? "text-ink" : "text-ink-2")}>
                {prediction.targets[t].short}
              </span>
              <span className="relative h-4">
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
                {pb != null && (
                  <motion.span
                    className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                    initial={false}
                    animate={{ left: `${Math.min(pa, pb) * 100}%`, width: `${Math.abs(pa - pb) * 100}%` }}
                    transition={{ ...SPRING, delay: 0.04 * i }}
                    style={{ background: `linear-gradient(90deg, ${withAlpha(color, 0.25)}, ${color})` }}
                  />
                )}
                {pb != null && (
                  <motion.span
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface"
                    initial={false}
                    animate={{ left: `${pb * 100}%`, borderColor: riskColor(pb) }}
                    transition={{ ...SPRING, delay: 0.04 * i }}
                  />
                )}
                <motion.span
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
                  initial={false}
                  animate={{ left: `${pa * 100}%`, backgroundColor: riskColor(pa) }}
                  transition={{ ...SPRING, delay: 0.04 * i }}
                  style={{ boxShadow: `0 0 8px ${withAlpha(riskColor(pa), 0.8)}` }}
                />
              </span>
              <span className="tabular text-right text-[11px] text-ink-2">
                {pb == null ? "…" : `${pa >= pb ? "+" : "−"}${Math.abs(Math.round((pa - pb) * 100))} pp`}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {contrast && comparator && (
          <motion.div
            key={`${selected}-${comparator.key}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="mt-4"
          >
            <p className="text-xs font-semibold text-ink">
              {identical
                ? `${a.short}: the two patients have the same inputs`
                : `Why ${a.short} risk is ${pct(a.probability)} here and ${pct(b!.probability)} for ${otherName}`}
            </p>
            {!identical && (
              <>
                <p className="mt-0.5 text-[11px] text-ink-3">
                  {gap >= 0 ? "Factors that raise this patient's estimate above the other's" : "Factors that put this patient's estimate below the other's"}
                  , largest first.
                </p>
                <ShapWaterfall key={`${selected}-${comparator.key}`} pred={contrast} startLabel={comparator.short} endLabel="This patient" />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 flex items-start justify-between gap-3">
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
          <Info size={12} className="mt-px shrink-0" aria-hidden />
          Both explanations start from the same average patient, so these steps add up exactly to the gap between the
          two patients' log-odds: each step is one factor's share of the difference.
        </p>
        {comparator?.case && comparator.key !== "baseline" && (
          <button
            type="button"
            className="btn shrink-0"
            onClick={() => loadPatient(comparator.case!.features, comparator.case!.title, comparator.case!.id)}
            title="Open the other patient"
          >
            Open <ArrowUpRight size={12} />
          </button>
        )}
      </div>
    </Section>
  );
}
