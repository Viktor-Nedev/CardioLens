/** Probability as a percentage; extremes are shown as <1% / >99% rather than a false 0% / 100%. */
export const pct = (p: number, digits = 0) => {
  if (p > 0.995) return ">99%";
  if (p < 0.005) return "<1%";
  return `${(p * 100).toFixed(digits)}%`;
};

export const signed = (v: number, digits = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;

export const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} pp`;

export const num = (v: number, digits = 2) => v.toFixed(digits);

export function ordinal(n: number): string {
  const r = Math.round(n);
  const s = ["th", "st", "nd", "rd"];
  const v = r % 100;
  return `${r}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** A proportion such as sensitivity: exact rounding (0% is a real value, not "<1%"). */
export const rate = (v: number) => `${Math.round(v * 100)}%`;

/** Probability interval; collapses to one value when both ends round the same. */
export function interval(lo: number, hi: number): string {
  const a = pct(lo);
  const b = pct(hi);
  return a === b ? a : `${a} – ${b}`;
}
