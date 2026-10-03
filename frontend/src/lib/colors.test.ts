import { describe, expect, it } from "vitest";
import { RISK_ANCHORS, riskColor, riskGradient, withAlpha } from "./colors";

describe("risk colour scale", () => {
  it("hits the validated anchors at 0, 0.5 and 1", () => {
    expect(riskColor(0)).toBe(RISK_ANCHORS[0]);
    expect(riskColor(0.5)).toBe(RISK_ANCHORS[1]);
    expect(riskColor(1)).toBe(RISK_ANCHORS[2]);
  });
  it("clamps out-of-range probabilities", () => {
    expect(riskColor(-1)).toBe(RISK_ANCHORS[0]);
    expect(riskColor(2)).toBe(RISK_ANCHORS[2]);
  });
  it("builds a gradient with 11 stops and rgb() with alpha", () => {
    expect(riskGradient().match(/#/g)?.length).toBe(11);
    expect(withAlpha("#ffffff", 0.5)).toBe("rgb(255 255 255 / 0.5)");
  });
});
