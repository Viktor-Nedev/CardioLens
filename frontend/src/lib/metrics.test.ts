import { describe, expect, it } from "vitest";
import { netBenefit, rocAuc, treatAllBenefit } from "./metrics";

describe("rocAuc", () => {
  it("is 1 for perfect separation and 0 for perfectly reversed scores", () => {
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBe(1);
    expect(rocAuc([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1])).toBe(0);
  });
  it("counts ties as one half", () => {
    expect(rocAuc([0, 1], [0.5, 0.5])).toBe(0.5);
  });
  it("is undefined when a class is missing", () => {
    expect(rocAuc([1, 1], [0.2, 0.9])).toBeNull();
  });
});

describe("netBenefit", () => {
  it("equals the prevalence at a zero threshold when everyone is treated", () => {
    const y = [1, 0, 1, 1];
    expect(netBenefit(y, [1, 1, 1, 1], 0)).toBeCloseTo(0.75);
    expect(treatAllBenefit(0.75, 0)).toBeCloseTo(0.75);
  });
  it("penalises false positives by the threshold odds", () => {
    // 1 TP and 1 FP out of 4 patients at t = 0.5: 1/4 - 1/4 * 1 = 0
    expect(netBenefit([1, 0, 0, 0], [0.9, 0.9, 0.1, 0.1], 0.5)).toBeCloseTo(0);
  });
  it("is zero when nobody is above the threshold", () => {
    expect(netBenefit([1, 0], [0.1, 0.2], 0.5)).toBe(0);
  });
});
