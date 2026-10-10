import { describe, expect, it } from "vitest";
import {
  buildCounterfactualPatient,
  CLINICAL_INTERVENTIONS,
  computeRiskMetrics,
  getGuidelineStratification,
} from "./interventions";
import type { Patient } from "./types";

describe("Clinical interventions", () => {
  const mockPatient: Patient = {
    age: 62,
    sex_male: 1,
    current_smoker: 1,
    bp: 155,
    ldl: 160,
    triglycerides: 210,
    fbs: 140,
    bmi: 29.5,
    weight: 88,
    pulse_rate: 80,
  };

  it("applies smoking cessation correctly", () => {
    const counterfactual = buildCounterfactualPatient(
      mockPatient,
      new Set(["smoking_cessation"]),
    );
    expect(counterfactual.current_smoker).toBe(0);
    expect(counterfactual.ex_smoker).toBe(1);
    expect(counterfactual.ldl).toBe(160); // unchanged
  });

  it("applies statin therapy and lowers LDL and triglycerides", () => {
    const counterfactual = buildCounterfactualPatient(
      mockPatient,
      new Set(["statin_high"]),
    );
    expect(Number(counterfactual.ldl)).toBeLessThan(100);
    expect(Number(counterfactual.triglycerides)).toBeLessThan(200);
    expect(counterfactual.dyslipidemia).toBe(0);
  });

  it("applies antihypertensive BP optimization", () => {
    const counterfactual = buildCounterfactualPatient(
      mockPatient,
      new Set(["bp_optimization"]),
    );
    expect(Number(counterfactual.bp)).toBeLessThanOrEqual(136);
  });

  it("applies combined multi-target interventions", () => {
    const allIds = new Set(CLINICAL_INTERVENTIONS.map((i) => i.id));
    const counterfactual = buildCounterfactualPatient(mockPatient, allIds);
    expect(counterfactual.current_smoker).toBe(0);
    expect(Number(counterfactual.ldl)).toBeLessThan(100);
    expect(Number(counterfactual.fbs)).toBeLessThanOrEqual(100);
    expect(Number(counterfactual.bmi)).toBeLessThan(28);
  });

  it("computes risk reduction metrics accurately", () => {
    const metrics = computeRiskMetrics(0.82, 0.48, 0.5);
    expect(metrics.absoluteReduction).toBeCloseTo(0.34, 2);
    expect(metrics.relativeReduction).toBeCloseTo(0.34 / 0.82, 2);
    expect(metrics.crossesThreshold).toBe(true);
    expect(metrics.nnt5Year).toBe(3);
  });

  it("stratifies guideline risk tiers properly", () => {
    const veryHigh = getGuidelineStratification(0.88, { lad: 0.72, lcx: 0.4, rca: 0.2 });
    expect(veryHigh.tier).toBe("very-high");

    const high = getGuidelineStratification(0.55, { lad: 0.52 });
    expect(high.tier).toBe("high");

    const moderate = getGuidelineStratification(0.3, { lad: 0.2 });
    expect(moderate.tier).toBe("moderate");

    const low = getGuidelineStratification(0.12, { lad: 0.1 });
    expect(low.tier).toBe("low");
  });
});
