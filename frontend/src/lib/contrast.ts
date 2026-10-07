// Contrastive explanations: why does patient A get a different estimate from patient B?
import type { Case, Contribution, FeatureSchema, Importance, Patient, TargetPrediction } from "./types";

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Per-feature difference of two SHAP explanations of the same model. Both start from the same
 * average-patient logit, so the differences add up exactly to logit(A) - logit(B).
 * Sorted by size; `display` reads "B value → A value".
 */
export function contrastDiff(a: TargetPrediction, b: TargetPrediction): Contribution[] {
  const other = new Map(b.contributions.map((c) => [c.feature, c]));
  return a.contributions
    .map((c) => {
      const o = other.get(c.feature);
      const value = c.contribution - (o?.contribution ?? 0);
      const same = !o || o.display === c.display;
      return {
        feature: c.feature,
        label: c.label,
        display: same ? `${c.display} (same)` : `${o.display} → ${c.display}`,
        contribution: value,
        // Probability change if this difference alone were removed.
        delta_pp: 100 * (a.probability - sigmoid(a.logit - value)),
        imputed: c.imputed || Boolean(o?.imputed),
      };
    })
    .sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));
}

/** A synthetic prediction whose waterfall runs from patient B to patient A. */
export function contrastPrediction(a: TargetPrediction, b: TargetPrediction): TargetPrediction {
  return {
    ...a,
    base_logit: b.logit,
    base_probability: b.probability,
    contributions: contrastDiff(a, b),
  };
}

/**
 * The hold-out patient most similar to `patient` whose angiography result differs from `outcome`
 * ("nearest unlike neighbour"). Inputs are standardised and weighted by global importance,
 * like the server's similar-patient search.
 */
export function nearestUnlike(
  patient: Patient,
  cases: Case[],
  features: FeatureSchema[],
  importance: Importance | undefined,
  outcome: 0 | 1,
  exclude?: string,
): Case | undefined {
  const weight = new Map<string, number>();
  for (const rows of Object.values(importance ?? {})) {
    for (const r of rows) weight.set(r.feature, (weight.get(r.feature) ?? 0) + r.mean_abs_shap);
  }
  const distance = (c: Case) => {
    let d = 0;
    for (const f of features) {
      const a = patient[f.id] ?? f.stats.default;
      const b = c.features[f.id] ?? f.stats.default;
      let diff: number;
      if (f.kind === "categorical") diff = String(a) === String(b) ? 0 : 1;
      else {
        const scale = f.stats.std && f.stats.std > 0 ? f.stats.std : 1;
        diff = (Number(a) - Number(b)) / scale;
      }
      d += (weight.get(f.id) ?? 0.01) * diff * diff;
    }
    return d;
  };
  let best: Case | undefined;
  let bestD = Infinity;
  for (const c of cases) {
    if (c.id === exclude || c.truth.cad === outcome) continue;
    const d = distance(c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
