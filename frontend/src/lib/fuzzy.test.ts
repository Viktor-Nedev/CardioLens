import { describe, expect, it } from "vitest";
import { fuzzyIndices, fuzzyScore } from "./fuzzy";

describe("fuzzyScore", () => {
  it("rejects texts that do not contain the query in order", () => {
    expect(fuzzyScore("xray", "Patient report")).toBeNull();
    expect(fuzzyScore("lcx", "xcl")).toBeNull();
  });

  it("ranks substrings above scattered matches and word starts above inner matches", () => {
    const sub = fuzzyScore("ray", "X-ray myocardium")!;
    const scattered = fuzzyScore("ray", "Rotate and yaw")!;
    expect(sub).toBeGreaterThan(scattered);
    expect(fuzzyScore("lat", "Left lateral")!).toBeGreaterThan(fuzzyScore("lat", "Ablation")!);
  });

  it("matches everything on an empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});

describe("fuzzyIndices", () => {
  it("returns the matched character positions", () => {
    expect(fuzzyIndices("lad", "LAD stenosis")).toEqual([0, 1, 2]);
    expect(fuzzyIndices("pr", "Patient report")).toEqual([0, 8]);
  });
});

describe("multi-word queries", () => {
  it("require every word to match on its own", () => {
    expect(fuzzyScore("x ray", "X-ray myocardium")).not.toBeNull();
    expect(fuzzyScore("normal lad", "Angio: normal coronaries")).toBeNull();
    expect(fuzzyScore("cad lad", "Angio: CAD · LAD, RCA")).not.toBeNull();
  });

  it("highlight the characters of every word", () => {
    expect(fuzzyIndices("view inf", "View: Inferior")).toEqual([0, 1, 2, 3, 6, 7, 8]);
  });
});
