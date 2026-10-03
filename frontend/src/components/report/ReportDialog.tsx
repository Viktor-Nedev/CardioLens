import { FileText, Printer, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { riskColor } from "../../lib/colors";
import { interval, pct } from "../../lib/format";
import { TARGET_ORDER, type TargetPrediction } from "../../lib/types";
import { useIsModified, useStore } from "../../state/store";
import { EASE_OUT } from "../ui/primitives";

function Drivers({ pred }: { pred: TargetPrediction }) {
  const up = pred.contributions.filter((c) => c.contribution > 0.02).slice(0, 3);
  const down = pred.contributions.filter((c) => c.contribution < -0.02).slice(0, 3);
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold text-slate-900">
        {pred.short} · {pct(pred.probability)}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">Raising the estimate</p>
      <ul className="mt-0.5 space-y-0.5 text-[11px] text-slate-700">
        {up.length ? up.map((c) => <li key={c.feature}>{c.label}: {c.display}</li>) : <li className="text-slate-400">none</li>}
      </ul>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">Lowering the estimate</p>
      <ul className="mt-0.5 space-y-0.5 text-[11px] text-slate-700">
        {down.length ? down.map((c) => <li key={c.feature}>{c.label}: {c.display}</li>) : <li className="text-slate-400">none</li>}
      </ul>
    </div>
  );
}

/** Printable one-patient summary: predictions, intervals, drivers, flagged measurements, 3D snapshot. */
export function ReportDialog() {
  const open = useStore((s) => s.reportOpen);
  const setOpen = useStore((s) => s.setReportOpen);
  const prediction = useStore((s) => s.prediction);
  const metrics = useStore((s) => s.metrics);
  const label = useStore((s) => s.baseline?.label ?? "Patient");
  const activeCase = useStore((s) => s.cases.find((c) => c.id === s.activeCaseId));
  const modified = useIsModified();
  const [image, setImage] = useState<string | null>(null);
  const [stamp, setStamp] = useState("");

  useEffect(() => {
    if (!open) return;
    setImage(useStore.getState().snapshot?.() ?? null);
    setStamp(new Date().toLocaleString());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const flagged = (prediction?.physiology ?? []).filter(
    (r) => !r.imputed && (r.flag === "high" || r.flag === "low" || r.flag === "abnormal"),
  );
  const truthKnown = activeCase && !modified;

  return (
    <AnimatePresence>
      {open && prediction && (
        <motion.div
          className="print-root fixed inset-0 z-[60] overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
        >
          <div className="no-print mx-auto mb-3 flex max-w-[860px] items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <FileText size={16} className="text-accent" /> Patient report
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => window.print()}>
                <Printer size={14} /> Print / save as PDF
              </button>
              <button type="button" className="btn" onClick={() => setOpen(false)} aria-label="Close report">
                <X size={14} />
              </button>
            </div>
          </div>

          <motion.article
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="report-paper mx-auto max-w-[860px] rounded-2xl bg-white p-8 text-slate-900 shadow-2xl sm:p-10"
          >
            <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">CardioLens · decision support</p>
                <h1 id="report-title" className="mt-1 text-2xl font-semibold tracking-tight">
                  Coronary risk report
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {label}
                  {modified ? " · values edited (what-if)" : activeCase ? " · hold-out patient, not used for training" : ""}
                </p>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <p>Generated {stamp}</p>
                <p>Model version {metrics?.version ?? "1.0.0"}</p>
              </div>
            </header>

            <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-900">
              <span className="font-semibold">For decision support and education only.</span> These are statistical estimates
              from a model trained on 303 patients from one public dataset. They are not a diagnosis and do not replace
              coronary angiography, CT angiography or the judgement of a qualified clinician.
            </div>

            <section className="mt-6">
              <h2 className="text-sm font-semibold">Predictions</h2>
              <table className="mt-2 w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-300 text-[11px] text-slate-500">
                    <th className="py-1.5 pr-2 font-medium">Target</th>
                    <th className="py-1.5 pr-2 font-medium">Probability</th>
                    <th className="py-1.5 pr-2 font-medium">80% interval</th>
                    <th className="py-1.5 pr-2 font-medium">Threshold</th>
                    <th className="py-1.5 pr-2 font-medium">Model call</th>
                    <th className="py-1.5 pr-2 font-medium">Band</th>
                    {truthKnown && <th className="py-1.5 font-medium">Angiography</th>}
                  </tr>
                </thead>
                <tbody>
                  {TARGET_ORDER.map((t) => {
                    const p = prediction.targets[t];
                    return (
                      <tr key={t} className="border-b border-slate-100">
                        <td className="py-2 pr-2 font-semibold">
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: riskColor(p.probability) }} />
                          {p.label}
                        </td>
                        <td className="py-2 pr-2 font-semibold tabular-nums">{pct(p.probability)}</td>
                        <td className="py-2 pr-2 tabular-nums text-slate-600">
                          {p.interval ? interval(p.interval[0], p.interval[1]) : "—"}
                        </td>
                        <td className="py-2 pr-2 tabular-nums text-slate-600">{pct(p.threshold)}</td>
                        <td className="py-2 pr-2">{p.positive ? (t === "cad" ? "CAD likely" : "Stenosis likely") : "Below threshold"}</td>
                        <td className="py-2 pr-2">{p.risk_band.label}</td>
                        {truthKnown && (
                          <td className="py-2">
                            {activeCase!.truth[t] ? (t === "cad" ? "CAD" : "Stenotic") : "Normal"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="mt-6 grid gap-5 sm:grid-cols-[1.1fr_1fr]">
              <div>
                <h2 className="text-sm font-semibold">3D view</h2>
                {image ? (
                  <img src={image} alt="3D heart with coronary arteries coloured by predicted risk" className="mt-2 w-full rounded-lg border border-slate-200" />
                ) : (
                  <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                    Open the 3D view to include a snapshot.
                  </p>
                )}
                <p className="mt-1.5 text-[10px] text-slate-500">
                  Artery colour encodes predicted stenosis probability (aqua → amber → red). Not an image of the patient;
                  lesions are not localised.
                </p>
              </div>
              <div>
                <h2 className="text-sm font-semibold">Main drivers (SHAP)</h2>
                <div className="mt-2 grid gap-2">
                  {TARGET_ORDER.map((t) => (
                    <Drivers key={t} pred={prediction.targets[t]} />
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6">
              <h2 className="text-sm font-semibold">Flagged measurements</h2>
              {flagged.length ? (
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-3">
                  {flagged.map((r) => (
                    <p key={r.feature} className="border-b border-slate-100 py-1">
                      <span className="font-medium">{r.label}</span>: {r.display}
                      {r.ref ? <span className="text-slate-500"> (ref {r.ref[0]}–{r.ref[1]})</span> : null}
                      {r.flag === "high" ? " ↑" : r.flag === "low" ? " ↓" : ""}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No measurement outside its reference range.</p>
              )}
            </section>

            <section className="mt-6 rounded-lg bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-800">Models and data</p>
              <p className="mt-1">
                {metrics &&
                  TARGET_ORDER.map((t) => {
                    const r = metrics.targets[t];
                    return `${r.short}: ${r.selected_label}, hold-out ROC-AUC ${r.holdout.metrics.roc_auc.value.toFixed(2)}`;
                  }).join(" · ")}
              </p>
              <p className="mt-1">
                Extension of Z-Alizadeh Sani dataset (UCI #411, CC BY 4.0). Anatomy: BodyParts3D, © DBCLS (CC BY-SA 2.1 JP).
                Probabilities are Platt-calibrated; intervals come from a 25-model bootstrap ensemble.
              </p>
            </section>
          </motion.article>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
