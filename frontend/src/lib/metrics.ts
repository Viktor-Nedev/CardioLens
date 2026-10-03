// Small, dependency-free evaluation helpers used by the model-performance page.

/** Rank-based ROC-AUC (Mann–Whitney U); null when either class is missing. */
export function rocAuc(y: number[], p: number[]): number | null {
  const pos = p.filter((_, i) => y[i] === 1);
  const neg = p.filter((_, i) => y[i] === 0);
  if (!pos.length || !neg.length) return null;
  let s = 0;
  for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

/** Net benefit of acting when p >= t (decision curve analysis, Vickers & Elkin 2006). */
export function netBenefit(y: number[], p: number[], t: number): number {
  const n = y.length;
  if (!n) return 0;
  let tp = 0;
  let fp = 0;
  p.forEach((v, i) => {
    if (v >= t) {
      if (y[i] === 1) tp++;
      else fp++;
    }
  });
  return tp / n - (fp / n) * (t / (1 - t));
}

/** Net benefit of treating everyone at threshold t, given the prevalence. */
export function treatAllBenefit(prevalence: number, t: number): number {
  return prevalence - (1 - prevalence) * (t / (1 - t));
}

export interface Confusion {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  /** null when the denominator is empty */
  sensitivity: number | null;
  specificity: number | null;
  ppv: number | null;
  npv: number | null;
  accuracy: number | null;
  f1: number | null;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** Confusion matrix and the usual clinical rates when cases with p >= t are called positive. */
export function confusionAt(y: number[], p: number[], t: number): Confusion {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  p.forEach((v, i) => {
    const positive = v >= t;
    if (y[i] === 1) {
      if (positive) tp++;
      else fn++;
    } else if (positive) fp++;
    else tn++;
  });
  return {
    tp,
    fp,
    tn,
    fn,
    sensitivity: ratio(tp, tp + fn),
    specificity: ratio(tn, tn + fp),
    ppv: ratio(tp, tp + fp),
    npv: ratio(tn, tn + fn),
    accuracy: ratio(tp + tn, y.length),
    f1: ratio(2 * tp, 2 * tp + fp + fn),
  };
}
