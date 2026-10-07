import { describe, expect, it } from "vitest";
import { contrastDiff, contrastPrediction } from "./contrast";
import type { TargetPrediction } from "./types";

const logit = (p: number) => Math.log(p / (1 - p));

function pred(base: number, contribs: Record<string, [number, string]>): TargetPrediction {
  const sum = Object.values(contribs).reduce((s, [v]) => s + v, 0);
  const z = base + sum;
  return {
    id: "lad",
    label: "LAD",
    short: "LAD",
    structure: "vessel_LAD",
    probability: 1 / (1 + Math.exp(-z)),
    interval: null,
    threshold: 0.5,
    positive: z >= 0,
    risk_band: { id: "low", label: "Low" },
    model: "test",
    base_logit: base,
    base_probability: 1 / (1 + Math.exp(-base)),
    logit: z,
    additivity_error: 0,
    summary: "",
    contributions: Object.entries(contribs).map(([feature, [contribution, display]]) => ({
      feature,
      label: feature,
      display,
      contribution,
      delta_pp: 0,
      imputed: false,
    })),
  };
}

describe("contrastDiff", () => {
  const a = pred(-0.2, { age: [0.9, "70 years"], pain: [1.2, "present"], ldl: [0.1, "130"] });
  const b = pred(-0.2, { age: [-0.4, "45 years"], pain: [1.2, "present"], ldl: [0.3, "160"] });

  it("adds up exactly to the difference in log-odds", () => {
    const total = contrastDiff(a, b).reduce((s, c) => s + c.contribution, 0);
    expect(total).toBeCloseTo(a.logit - b.logit, 10);
  });

  it("orders factors by size and labels them B → A", () => {
    const d = contrastDiff(a, b);
    expect(d[0].feature).toBe("age");
    expect(d[0].display).toBe("45 years → 70 years");
    expect(d.find((c) => c.feature === "pain")!.display).toBe("present (same)");
  });

  it("builds a waterfall from patient B to patient A", () => {
    const c = contrastPrediction(a, b);
    expect(c.base_logit).toBe(b.logit);
    expect(c.logit).toBe(a.logit);
    expect(logit(c.base_probability)).toBeCloseTo(b.logit, 10);
  });
});
