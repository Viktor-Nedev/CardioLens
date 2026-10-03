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
