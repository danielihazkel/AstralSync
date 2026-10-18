import { describe, expect, it } from "vitest";
import { GENERATION_HOURLY_LIMIT, pairKey } from "./generationLimiter";

describe("pairKey", () => {
  it("is order-independent — (a,b) and (b,a) share a budget", () => {
    expect(pairKey(3, 9)).toBe(pairKey(9, 3));
  });

  it("separates distinct pairs", () => {
    const seen = new Set<number>();
    for (let a = 1; a <= 30; a++) {
      for (let b = a + 1; b <= 30; b++) seen.add(pairKey(a, b));
    }
    // 30 choose 2 distinct pairs, all distinct keys.
    expect(seen.size).toBe((30 * 29) / 2);
  });

  it("never collides with any profile id the other routes spend from", () => {
    // Profile ids are positive and every pair key is negative. The unsigned
    // Cantor value of (1, 2) is 8, which used to share profile 8's budget.
    for (let a = 1; a <= 30; a++) {
      for (let b = a + 1; b <= 30; b++) expect(pairKey(a, b)).toBeLessThan(0);
    }
    expect(pairKey(1, 2)).not.toBe(8);
  });
});

describe("generation limit", () => {
  it("is a generous abuse backstop, not a quota", () => {
    // Regenerating a handful of times after editing a chart must never trip
    // it; the point is only to bound a runaway discard/regenerate loop.
    expect(GENERATION_HOURLY_LIMIT).toBeGreaterThanOrEqual(10);
  });
});
