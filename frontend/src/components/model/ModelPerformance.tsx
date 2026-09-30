import clsx from "clsx";
import { useMemo, useState } from "react";
import { CONTEXT, SERIES } from "../../lib/colors";
import { num, pct } from "../../lib/format";
import { TARGET_ORDER, type MetricCI, type TargetId, type TargetReport } from "../../lib/types";
import { useStore } from "../../state/store";
import { ChartCard, DataTable, LegendKey, Segmented } from "../ui/primitives";
import { CurveChart } from "./CurveChart";

const ci = (m: MetricCI, digits = 2) => `${num(m.value, digits)} [${num(m.ci_low, digits)}–${num(m.ci_high, digits)}]`;

function StatTile({ label, metric, hint }: { label: string; metric: MetricCI; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-raised/40 px-3 py-2.5" title={hint}>
      <p className="text-[11px] text-ink-3">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-ink">{metric.value.toFixed(2)}</p>
      <p className="tabular text-[10px] text-ink-3">
        95% CI {metric.ci_low.toFixed(2)}–{metric.ci_high.toFixed(2)}
      </p>
    </div>
  );
}

function OverviewTable() {
  const metrics = useStore((s) => s.metrics)!;
  const rows = TARGET_ORDER.map((t) => {
    const r = metrics.targets[t];
    const m = r.holdout.metrics;
    return [
      <span className="font-semibold text-ink">{r.short}</span>,
      r.selected_label,
      `${num(r.comparison[r.selected_family].cv.roc_auc_mean)} ± ${num(r.comparison[r.selected_family].cv.roc_auc_std)}`,
      ci(m.roc_auc),
      num(m.accuracy.value),
      num(m.precision.value),
      num(m.recall.value),
      num(m.specificity.value),
      num(m.f1.value),
      num(m.brier.value, 3),
      pct(r.threshold),
    ];
  });
  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold text-ink">Hold-out performance of the deployed models</h2>
      <p className="mb-3 mt-0.5 text-xs text-ink-3">
        {metrics.split.n_holdout} hold-out patients, evaluated once after all model selection was finished on the{" "}
        {metrics.split.n_dev}-patient development set. Brackets: bootstrap 95% confidence interval.
      </p>
      <DataTable
        head={["Target", "Model", "Nested CV AUC", "Hold-out ROC-AUC", "Accuracy", "Precision", "Recall", "Specificity", "F1", "Brier", "Threshold"]}
        rows={rows}
      />
    </div>
  );
}

function ConfusionMatrix({ r }: { r: TargetReport }) {
  const { tn, fp, fn, tp } = r.holdout.confusion;
  const pos = r.short === "CAD" ? "CAD" : "Stenotic";
  const cells = [
    { label: "True negative", v: tn, row: tn + fp },
    { label: "False positive", v: fp, row: tn + fp },
    { label: "False negative", v: fn, row: fn + tp },
    { label: "True positive", v: tp, row: fn + tp },
  ];
  return (
    <ChartCard
      title="Confusion matrix"
      subtitle={`Hold-out set at the ${pct(r.threshold)} decision threshold`}
      table={
        <DataTable
          head={["", `Predicted normal`, `Predicted ${pos.toLowerCase()}`]}
          rows={[
            ["Actual normal", tn, fp],
            [`Actual ${pos.toLowerCase()}`, fn, tp],
          ]}
        />
      }
    >
      <div className="grid grid-cols-[auto_1fr_1fr] gap-0.5 text-xs">
        <span />
        <span className="pb-1 text-center text-[11px] text-ink-3">Predicted normal</span>
        <span className="pb-1 text-center text-[11px] text-ink-3">Predicted {pos.toLowerCase()}</span>
        {[0, 1].map((row) => (
          <div key={row} className="contents">
            <span className="flex items-center pr-2 text-[11px] text-ink-3">{row ? `Actual ${pos.toLowerCase()}` : "Actual normal"}</span>
            {cells.slice(row * 2, row * 2 + 2).map((c) => {
              const share = c.row ? c.v / c.row : 0;
              return (
                <div
                  key={c.label}
                  className="flex h-20 flex-col items-center justify-center rounded-md"
                  style={{ background: `rgb(57 135 229 / ${0.08 + share * 0.5})` }}
                  title={`${c.label}: ${c.v} (${pct(share)} of the actual row)`}
                >
                  <span className="text-xl font-semibold text-ink">{c.v}</span>
                  <span className="tabular text-[10px] text-ink-2">
                    {c.label} · {pct(share)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function FamilyComparison({ r }: { r: TargetReport }) {
  const entries = Object.entries(r.comparison).sort((a, b) => b[1].cv.roc_auc_mean - a[1].cv.roc_auc_mean);
  const base = r.baselines.risk_factors_lr.cv_roc_auc;
  const lo = 0.5;
  const hi = 1;
  const x = (v: number) => `${((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100}%`;
  return (
    <ChartCard
      title="Model family comparison"
      subtitle="Nested cross-validation ROC-AUC on the development set (mean ± sd, 25 outer folds). Bars start at 0.5 = chance."
      legend={
        <>
          <LegendKey kind="rect" color={SERIES} label="Selected model" />
          <LegendKey kind="rect" color={CONTEXT} label="Other candidates" />
          <LegendKey kind="line" color="#b2bccb" label="Risk-factor baseline" />
        </>
      }
      table={
        <DataTable
          head={["Model", "CV AUC", "sd", "Hold-out AUC (reference)", "Best hyper-parameters"]}
          rows={[
            ...entries.map(([id, c]) => [
              c.label + (id === r.selected_family ? " (selected)" : c.selectable ? "" : " (benchmark)"),
              num(c.cv.roc_auc_mean, 3),
              num(c.cv.roc_auc_std, 3),
              num(c.holdout_reference.roc_auc, 3),
              Object.entries(c.best_params)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(", "),
            ]),
            ["Risk-factor LR baseline", num(base, 3), num(r.baselines.risk_factors_lr.cv_roc_auc_std, 3), num(r.baselines.risk_factors_lr.holdout.roc_auc, 3), "8 pre-test features"],
          ]}
        />
      }
    >
      <div className="relative">
        <div className="absolute inset-y-0 w-px bg-ink-2/70" style={{ left: `calc(40% + ${x(base)} * 0.6)` }} aria-hidden />
        <ul className="space-y-2">
          {entries.map(([id, c]) => {
            const selected = id === r.selected_family;
            const m = c.cv.roc_auc_mean;
            const sd = c.cv.roc_auc_std;
            return (
              <li key={id} className="grid grid-cols-[40%_60%] items-center">
                <span className={clsx("truncate pr-2 text-xs", selected ? "font-semibold text-ink" : "text-ink-2")}>
                  {c.label}
                  {!c.selectable && <span className="text-ink-3"> · benchmark</span>}
                </span>
                <div className="relative h-5" title={`${c.label}: ${m.toFixed(3)} ± ${sd.toFixed(3)}`}>
                  <div
                    className="absolute top-1/2 h-3 -translate-y-1/2"
                    style={{ left: 0, width: x(m), background: selected ? SERIES : CONTEXT, borderRadius: "0 4px 4px 0" }}
                  />
                  <div className="absolute top-1/2 h-px -translate-y-1/2 bg-ink-2" style={{ left: x(m - sd), width: `calc(${x(m + sd)} - ${x(m - sd)})` }} />
                  <span className="tabular absolute top-1/2 -translate-y-1/2 pl-1 text-[11px] text-ink-2" style={{ left: x(m + sd) }}>
                    {m.toFixed(3)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="tabular mt-2 grid grid-cols-[40%_60%] text-[10px] text-ink-3">
          <span />
          <div className="flex justify-between">
            <span>0.5</span>
            <span>0.75</span>
            <span>1.0</span>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-ink-3">
          Risk-factor baseline (age, sex, diabetes, hypertension, smoking, family history, dyslipidaemia, typical angina):{" "}
          <span className="tabular text-ink-2">{base.toFixed(3)}</span>
        </p>
      </div>
    </ChartCard>
  );
}

function ImportanceChart({ target }: { target: TargetId }) {
  const importance = useStore((s) => s.importance)!;
  const rows = importance[target];
  const top = rows.slice(0, 12);
  const max = Math.max(...top.map((r) => r.mean_abs_shap), 1e-6);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <ChartCard
      title="Global feature importance"
      subtitle="Mean |SHAP| over the development set (calibrated log-odds), top 12"
      table={
        <DataTable
          head={["Feature", "Mean |SHAP|", "Mean SHAP", "Permutation Δ AUC (hold-out)"]}
          rows={rows.map((r) => [
            r.label,
            r.mean_abs_shap.toFixed(3),
            r.mean_shap.toFixed(3),
            `${r.permutation_auc_drop.toFixed(3)} ± ${r.permutation_auc_drop_std.toFixed(3)}`,
          ])}
        />
      }
    >
      <ul className="space-y-1">
        {top.map((r) => (
          <li
            key={r.feature}
            className="relative grid grid-cols-[42%_58%] items-center rounded px-1 py-0.5 hover:bg-hover"
            onMouseEnter={() => setHover(r.feature)}
            onMouseLeave={() => setHover(null)}
            tabIndex={0}
            onFocus={() => setHover(r.feature)}
            onBlur={() => setHover(null)}
          >
            <span className="truncate pr-2 text-xs text-ink-2">{r.label}</span>
            <div className="relative h-4">
              <div
                className="absolute top-1/2 h-3 -translate-y-1/2"
                style={{ width: `${(r.mean_abs_shap / max) * 82}%`, background: SERIES, borderRadius: "0 4px 4px 0" }}
              />
              <span
                className="tabular absolute top-1/2 -translate-y-1/2 pl-1 text-[11px] text-ink-3"
                style={{ left: `${(r.mean_abs_shap / max) * 82}%` }}
              >
                {r.mean_abs_shap.toFixed(2)}
              </span>
            </div>
            {hover === r.feature && (
              <div className="pointer-events-none absolute bottom-full left-1/3 z-10 mb-1 w-56 rounded-lg border border-line-strong bg-[#0b111bf2] px-2.5 py-1.5 shadow-xl">
                <p className="tabular text-sm font-semibold text-ink">{r.mean_abs_shap.toFixed(3)}</p>
                <p className="text-[11px] text-ink-2">{r.label}: mean |SHAP|</p>
                <p className="tabular text-[11px] text-ink-3">
                  Permutation Δ AUC {r.permutation_auc_drop.toFixed(3)} ± {r.permutation_auc_drop_std.toFixed(3)}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

export function ModelPerformance() {
  const metrics = useStore((s) => s.metrics);
  const [target, setTarget] = useState<TargetId>("cad");
  const r = metrics?.targets[target];

  const rocSeries = useMemo(
    () =>
      r
        ? [
            { id: "holdout", label: "Hold-out", color: SERIES, points: r.holdout.curves.roc },
            { id: "oof", label: "Dev out-of-fold", color: CONTEXT, points: r.dev_oof.curves.roc },
          ]
        : [],
    [r],
  );
  const calSeries = useMemo(
    () =>
      r
        ? [
            { id: "oof", label: "Dev out-of-fold", color: SERIES, points: r.dev_oof.curves.calibration, markers: true },
            { id: "holdout", label: "Hold-out", color: CONTEXT, points: r.holdout.curves.calibration, markers: true },
          ]
        : [],
    [r],
  );

  if (!metrics || !r) return null;
  const m = r.holdout.metrics;
  const d = metrics.dataset;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Patients", String(d.n_patients), "Z-Alizadeh Sani extension (UCI #411)"],
          ["Development / hold-out", `${metrics.split.n_dev} / ${metrics.split.n_holdout}`, "Stratified on the joint label pattern"],
          ["Model inputs", String(d.n_features), `Excluded: ${d.excluded.leakage.join(", ")} (leakage), ${d.excluded.constant.join(", ")} (constant)`],
          ["Validation", `${metrics.protocol.outer_repeats}×5-fold nested CV`, "Hyper-parameters tuned in the inner loop only"],
        ].map(([label, value, hint]) => (
          <div key={label} className="panel px-4 py-3">
            <p className="text-[11px] text-ink-3">{label}</p>
            <p className="mt-0.5 text-xl font-semibold text-ink">{value}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{hint}</p>
          </div>
        ))}
      </div>

      <OverviewTable />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Target"
          value={target}
          onChange={setTarget}
          options={TARGET_ORDER.map((t) => ({ value: t, label: metrics.targets[t].short }))}
        />
        <p className="text-xs text-ink-3">
          {r.label} · selected model <span className="text-ink-2">{r.selected_label}</span> · hold-out prevalence{" "}
          {pct(r.holdout.positives / r.holdout.n)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="ROC-AUC" metric={m.roc_auc} />
        <StatTile label="Sensitivity (recall)" metric={m.recall} />
        <StatTile label="Specificity" metric={m.specificity} />
        <StatTile label="Precision (PPV)" metric={m.precision} />
        <StatTile label="F1-score" metric={m.f1} />
        <StatTile label="Brier score" metric={m.brier} hint="Lower is better; mean squared error of the probabilities" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          title={`ROC curve · hold-out AUC ${m.roc_auc.value.toFixed(3)}`}
          subtitle="Diagonal = chance. Grey: out-of-fold predictions on the development set."
          legend={
            <>
              <LegendKey color={SERIES} label="Hold-out" />
              <LegendKey color={CONTEXT} label="Dev out-of-fold" />
            </>
          }
          table={<DataTable head={["False positive rate", "True positive rate"]} rows={r.holdout.curves.roc.map(([a, b]) => [a.toFixed(3), b.toFixed(3)])} />}
        >
          <CurveChart series={rocSeries} xLabel="False positive rate" yLabel="True positive rate" ariaLabel={`ROC curve for ${r.short}`} />
        </ChartCard>
        <ChartCard
          title="Calibration"
          subtitle="Observed frequency per predicted-probability bin (quantile bins). Diagonal = perfect calibration."
          legend={
            <>
              <LegendKey kind="dot" color={SERIES} label="Dev out-of-fold (8 bins)" />
              <LegendKey kind="dot" color={CONTEXT} label="Hold-out (5 bins)" />
            </>
          }
          table={
            <DataTable
              head={["Set", "Mean predicted", "Observed"]}
              rows={[
                ...r.dev_oof.curves.calibration.map(([a, b]) => ["Dev OOF", a.toFixed(3), b.toFixed(3)]),
                ...r.holdout.curves.calibration.map(([a, b]) => ["Hold-out", a.toFixed(3), b.toFixed(3)]),
              ]}
            />
          }
        >
          <CurveChart series={calSeries} mode="nearest" xLabel="Predicted probability" yLabel="Observed frequency" ariaLabel={`Calibration curve for ${r.short}`} />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ConfusionMatrix r={r} />
        <div className="lg:col-span-2">
          <FamilyComparison r={r} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ImportanceChart target={target} />
        <div className="panel p-4 text-xs leading-relaxed text-ink-2">
          <h3 className="text-sm font-semibold text-ink">Validation protocol</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            <li>{metrics.split.method}; seed {metrics.split.seed}.</li>
            <li>{String(metrics.protocol.selection)}.</li>
            <li>{String(metrics.protocol.calibration)}.</li>
            <li>{String(metrics.protocol.threshold)} (F1-optimal alternative: {pct(r.threshold_f1)}).</li>
            <li>{String(metrics.protocol.holdout)}.</li>
            <li>
              Target leakage prevented: {d.excluded.leakage.join(", ")} are never model inputs; enforced by assertions and
              unit tests.
            </li>
            <li>
              Label consistency: {d.cad_vs_vessels.cad_with_no_stenotic_vessel} CAD patients have no stenotic vessel and{" "}
              {d.cad_vs_vessels.normal_with_stenotic_vessel} normal patient has a stenotic vessel, so CAD ≈ any of LAD/LCX/RCA.
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-ink-3">
            Report generated {new Date(metrics.generated_at).toLocaleString()} · scikit-learn {metrics.environment.scikit_learn}
          </p>
        </div>
      </div>
    </div>
  );
}
