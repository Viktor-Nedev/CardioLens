import clsx from "clsx";
import { ArrowUpRight, Info, Loader2, Users } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { TARGET_ORDER, type SimilarResult } from "../../lib/types";
import { useStore } from "../../state/store";
import { EASE_OUT, Section } from "../ui/primitives";
import { CohortMap } from "./CohortMap";

const NAMES: Record<string, string> = { cad: "CAD", lad: "LAD", lcx: "LCX", rca: "RCA" };

/** Case-based context: the most similar patients the models learnt from, and what angiography found. */
export function SimilarPatients() {
  const patient = useStore((s) => s.patient);
  const loadPatient = useStore((s) => s.loadPatient);
  const risk = useStore((s) => s.prediction?.targets.cad.probability ?? 0.5);
  const [result, setResult] = useState<SimilarResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (Object.keys(patient).length === 0) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setLoading(true);
      api
        .similar(patient, 5, ctrl.signal)
        .then(setResult)
        .catch(() => undefined)
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 200);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [patient]);

  if (!result) return <div className="panel skeleton h-96" aria-busy="true" />;
  const k = result.k || 1;

  return (
    <Section
      title="Similar patients"
      icon={Users}
      right={loading ? <Loader2 size={13} className="animate-spin text-accent" aria-label="Updating" /> : undefined}
    >
      <p className="text-xs leading-relaxed text-ink-2">
        Of the <span className="font-semibold text-ink">{result.k} most similar</span> of {result.pool} development patients,
        angiography found:
      </p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {TARGET_ORDER.map((t, i) => {
          const pos = result.summary[t] ?? 0;
          return (
            <motion.div
              key={t}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: EASE_OUT }}
              className="rounded-lg border border-line bg-white/[0.02] px-2 py-2 text-center"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{NAMES[t]}</p>
              <p className="tabular mt-0.5 text-lg font-semibold text-ink">
                {pos}
                <span className="text-xs font-normal text-ink-3">/{k}</span>
              </p>
              <div className="mt-1 flex justify-center gap-0.5" aria-hidden>
                {Array.from({ length: k }, (_, j) => (
                  <motion.span
                    key={j}
                    initial={{ scaleY: 0.3, opacity: 0 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={{ delay: 0.2 + j * 0.05 }}
                    className={clsx("h-2 w-1.5 rounded-sm", j < pos ? "bg-raises" : "bg-white/10")}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      <CohortMap result={result} risk={risk} />
      <p className="mt-1.5 text-[10.5px] leading-snug text-ink-3">
        Map of all {result.pool} development patients (t-SNE of the similarity space): patients with similar inputs sit
        close together. The marker follows this patient as you edit; dashed lines lead to its nearest neighbours.
      </p>

      <ul className="mt-3 space-y-1.5">
        {result.neighbours.map((n, i) => (
          <motion.li
            key={n.patient_id}
            layout="position"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.35, ease: EASE_OUT }}
            className="group rounded-lg border border-line bg-white/[0.02] px-3 py-2 transition-colors hover:bg-white/[0.05]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-ink">
                <span className="font-semibold">#{n.patient_id}</span>
                <span className="text-ink-2"> · {n.summary}</span>
              </span>
              <button
                type="button"
                onClick={() => loadPatient(n.features, `Development patient #${n.patient_id} (seen in training)`)}
                className="btn-ghost shrink-0 px-1.5 py-0.5 text-[10px] opacity-70 group-hover:opacity-100"
                title="Open this patient (it was part of the training data)"
              >
                Open <ArrowUpRight size={11} />
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(n.similarity * 100)}%` }}
                  transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: EASE_OUT }}
                />
              </div>
              <span className="tabular w-16 text-right text-[10px] text-ink-3">{Math.round(n.similarity * 100)}% similar</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {TARGET_ORDER.map((t) => (
                <span
                  key={t}
                  className={clsx(
                    "rounded-md border px-1.5 py-px text-[10px] font-semibold uppercase",
                    n.truth[t] ? "border-[#e66767]/40 bg-[#e66767]/10 text-ink" : "border-line text-ink-3",
                  )}
                >
                  {NAMES[t]} {n.truth[t] ? "+" : "−"}
                </span>
              ))}
            </div>
          </motion.li>
        ))}
      </ul>
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
        <Info size={12} className="mt-px shrink-0" aria-hidden />
        Similarity is the distance between standardised inputs, weighted by each factor's global SHAP importance. These
        patients were used to train the models.
      </p>
    </Section>
  );
}
