// Colour scales shared by the 3D viewer and the dashboard.
//
// Risk probability uses one semantic-heat scale everywhere (aqua -> amber -> red),
// interpolated in OKLab so perceived steps are even. The three anchors were
// validated for colour-vision-deficiency separation against the dark surface;
// every use is paired with a numeric label, so colour never carries risk alone.

type RGB = [number, number, number];

export const RISK_ANCHORS = ["#199e70", "#c98500", "#d03b3b"] as const;
export const RAISES = "#e66767"; // SHAP: pushes risk up
export const LOWERS = "#3987e5"; // SHAP: pushes risk down
export const SERIES = "#3987e5";
export const CONTEXT = "#5b6576";

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}

function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]: RGB): RGB {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const ANCHORS_LAB = RISK_ANCHORS.map((h) => rgbToOklab(hexToRgb(h)));

/** Risk colour for a probability in [0, 1]. */
export function riskColor(p: number): string {
  const t = Math.min(1, Math.max(0, p)) * (ANCHORS_LAB.length - 1);
  const i = Math.min(ANCHORS_LAB.length - 2, Math.floor(t));
  const f = t - i;
  const a = ANCHORS_LAB[i];
  const b = ANCHORS_LAB[i + 1];
  return rgbToHex(oklabToRgb([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]));
}

/** CSS gradient string for legends and meters. */
export function riskGradient(direction = "to right"): string {
  const stops = Array.from({ length: 11 }, (_, i) => `${riskColor(i / 10)} ${i * 10}%`);
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v * 255));
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}
