import { describe, expect, it } from "vitest";
import { lifePath, reduce, reduceSteps } from "../src";

describe("master-preserving reduction", () => {
  it("reduces ordinary numbers to a single digit", () => {
    expect(reduce(39)).toBe(3); // 39 → 12 → 3
    expect(reduceSteps(39)).toEqual([39, 12, 3]);
  });

  it("stops at master numbers 11, 22, 33", () => {
    expect(reduce(38)).toBe(11); // 38 → 11, kept
    expect(reduce(1975)).toBe(22); // 1+9+7+5 = 22, kept
    expect(reduceSteps(1975)).toEqual([1975, 22]);
    expect(reduce(33)).toBe(33);
  });
});

describe("Life Path Number (PRD §3.3, §8)", () => {
  it("computes an ordinary life path (1990-03-21 → 7)", () => {
    const lp = lifePath({ year: 1990, month: 3, day: 21 });
    // month 3, day 21→3, year 1990→1; 3+3+1 = 7
    expect(lp.value).toBe(7);
    expect(lp.isMaster).toBe(false);
    expect(lp.derivation.total).toBe(7);
  });

  it("preserves a master at the final reduction (1975-04-07 → 33)", () => {
    const lp = lifePath({ year: 1975, month: 4, day: 7 });
    // month 4, day 7, year 1975→22 (master kept); 4+7+22 = 33 (master kept)
    expect(lp.value).toBe(33);
    expect(lp.isMaster).toBe(true);
    const year = lp.derivation.components.find((c) => c.part === "year")!;
    expect(year.reduced).toBe(22);
  });

  it("preserves a master day component (29 → 11) without forcing a master result", () => {
    const lp = lifePath({ year: 2000, month: 1, day: 29 });
    const day = lp.derivation.components.find((c) => c.part === "day")!;
    expect(day.reduced).toBe(11); // 29 → 11, kept at component level
    expect(lp.value).toBe(5); // 1 + 11 + 2 = 14 → 5
    expect(lp.isMaster).toBe(false);
  });

  it("records a full derivation for UI display", () => {
    const lp = lifePath({ year: 1990, month: 3, day: 21 });
    expect(lp.derivation.components).toHaveLength(3);
    const day = lp.derivation.components.find((c) => c.part === "day")!;
    expect(day.steps).toEqual([21, 3]);
  });
});
