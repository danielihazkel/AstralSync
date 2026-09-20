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

  it("does not collide with a plain profile id used by the other routes", () => {
    // Cantor pairing of two positive ids always exceeds either id, so a
    // pair key can never be mistaken for one of its own endpoints.
    expect(pairKey(4, 7)).toBeGreaterThan(7);
    expect(pairKey(1, 2)).toBeGreaterThan(2);
  });
});

describe("generation limit", () => {
  it("is a generous abuse backstop, not a quota", () => {
    // Regenerating a handful of times after editing a chart must never trip
    // it; the point is only to bound a runaway discard/regenerate loop.
    expect(GENERATION_HOURLY_LIMIT).toBeGreaterThanOrEqual(10);
  });
});
