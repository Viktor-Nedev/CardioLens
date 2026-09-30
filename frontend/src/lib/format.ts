export const pct = (p: number, digits = 0) => `${(p * 100).toFixed(digits)}%`;

export const signed = (v: number, digits = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;

export const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} pp`;

export const num = (v: number, digits = 2) => v.toFixed(digits);

export function ordinal(n: number): string {
  const r = Math.round(n);
  const s = ["th", "st", "nd", "rd"];
  const v = r % 100;
  return `${r}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
