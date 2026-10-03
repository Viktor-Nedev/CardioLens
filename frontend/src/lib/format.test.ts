import { describe, expect, it } from "vitest";
import { interval, ordinal, pct, pp, rate } from "./format";

describe("probability formatting", () => {
  it("never shows a false 0% or 100%", () => {
    expect(pct(0.999)).toBe(">99%");
    expect(pct(0.001)).toBe("<1%");
    expect(pct(0.5)).toBe("50%");
  });
  it("collapses intervals whose ends round the same", () => {
    expect(interval(0.996, 0.999)).toBe(">99%");
    expect(interval(0.2, 0.31)).toBe("20% – 31%");
  });
  it("keeps exact zero for proportions such as specificity", () => {
    expect(rate(0)).toBe("0%");
    expect(rate(1)).toBe("100%");
  });
  it("signs percentage-point changes", () => {
    expect(pp(3.14)).toBe("+3.1 pp");
    expect(pp(-0.06)).toBe("−0.1 pp");
  });
  it("writes ordinals", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(23)).toBe("23rd");
  });
});
