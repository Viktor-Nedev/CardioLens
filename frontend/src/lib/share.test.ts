import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare } from "./share";

const defaults = { age: 58, sex_male: 1, typical_chest_pain: 0, bbb: "N" };

describe("shareable links", () => {
  it("use the case id for an unedited hold-out patient", () => {
    const hash = encodeShare({ ...defaults }, defaults, "lad", "H029");
    expect(hash).toBe("case=H029&t=lad");
    expect(decodeShare(`#${hash}`, defaults)).toEqual({ caseId: "H029", target: "lad" });
  });

  it("round-trip edited inputs, storing only what differs from the defaults", () => {
    const patient = { ...defaults, age: 71, bbb: "LBBB" };
    const hash = encodeShare(patient, defaults, "cad", "H029", true);
    expect(hash).not.toContain("case=");
    expect(decodeShare(hash, defaults)).toEqual({ patient });
  });

  it("ignore malformed links and unknown features", () => {
    expect(decodeShare("#p=%%%", defaults)).toBeNull();
    const evil = btoa(JSON.stringify({ age: 60, hack: 1, sex_male: { x: 1 } }));
    expect(decodeShare(`#p=${evil}`, defaults)).toEqual({ patient: { ...defaults, age: 60 } });
  });
});
