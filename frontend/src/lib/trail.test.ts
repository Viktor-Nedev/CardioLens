import { describe, expect, it } from "vitest";
import { advanceTrail, describeChange, type TrailEntry } from "./trail";
import type { FeatureSchema, TargetId } from "./types";

const features = [
  { id: "age", label: "Age", kind: "numeric", unit: "years", options: null },
  { id: "dm", label: "Diabetes", kind: "binary", unit: null, options: [{ value: 0, label: "No" }, { value: 1, label: "Yes" }] },
] as unknown as FeatureSchema[];
const probs = (p: number) => ({ cad: p, lad: p, lcx: p, rca: p }) as Record<TargetId, number>;
const opts = (now: number, restoring = false) => ({ features, startLabel: "Case #29", now, restoring });

describe("edit history", () => {
  it("starts with the loaded patient and appends one entry per edit", () => {
    let s = advanceTrail([], -1, { age: 80, dm: 0 }, probs(0.9), opts(0));
    expect(s.trail[0].label).toBe("Case #29");
    s = advanceTrail(s.trail, s.cursor, { age: 80, dm: 1 }, probs(0.95), opts(5000));
    expect(s.cursor).toBe(1);
    expect(s.trail[1].label).toBe("Diabetes: absent → present");
  });

  it("merges a slider drag into one step and drops it when dragged back", () => {
    let s = advanceTrail([], -1, { age: 80 }, probs(0.9), opts(0));
    s = advanceTrail(s.trail, s.cursor, { age: 75 }, probs(0.85), opts(5000));
    s = advanceTrail(s.trail, s.cursor, { age: 70 }, probs(0.8), opts(5400));
    expect(s.trail).toHaveLength(2);
    expect(s.trail[1].label).toBe("Age: 80 years → 70 years");
    s = advanceTrail(s.trail, s.cursor, { age: 80 }, probs(0.9), opts(5800));
    expect(s.trail).toHaveLength(1);
    expect(s.cursor).toBe(0);
  });

  it("refreshes probabilities after undo and drops the redo branch on a new edit", () => {
    let s = advanceTrail([], -1, { age: 80 }, probs(0.9), opts(0));
    s = advanceTrail(s.trail, s.cursor, { age: 70 }, probs(0.8), opts(5000));
    s = advanceTrail(s.trail, s.cursor, { age: 60 }, probs(0.7), opts(9000));
    // undo to entry 1, prediction arrives
    s = advanceTrail(s.trail, 1, { age: 70 }, probs(0.81), opts(9500, true));
    expect(s.cursor).toBe(1);
    expect(s.trail).toHaveLength(3);
    expect((s.trail[1] as TrailEntry).probs.cad).toBe(0.81);
    s = advanceTrail(s.trail, s.cursor, { age: 50 }, probs(0.6), opts(20000));
    expect(s.trail.map((e) => e.patient.age)).toEqual([80, 70, 50]);
  });

  it("describes multi-input changes", () => {
    expect(describeChange({ age: 1, dm: 0 }, { age: 2, dm: 1 }, features)).toBe("2 inputs changed");
  });
});
