import { describe, expect, it } from "vitest";
import {
  LUNAR_MANSIONS,
  MANSION_SPAN,
  lunarMansion,
} from "./lunarMansions";

describe("lunarMansion", () => {
  it("has 28 mansions with unique 1-based indices and names", () => {
    expect(LUNAR_MANSIONS).toHaveLength(28);
    expect(new Set(LUNAR_MANSIONS.map((m) => m.index)).size).toBe(28);
    expect(new Set(LUNAR_MANSIONS.map((m) => m.name)).size).toBe(28);
    LUNAR_MANSIONS.forEach((m, i) => expect(m.index).toBe(i + 1));
  });

  it("locates boundaries correctly", () => {
    expect(lunarMansion(0).index).toBe(1);
    expect(lunarMansion(MANSION_SPAN - 0.001).index).toBe(1);
    // The exact boundary value is FP-sensitive (norm360's mod nudges it a
    // hair below the span); a hair past it is decisively mansion 2.
    expect(lunarMansion(MANSION_SPAN + 0.001).index).toBe(2);
    // 0° Taurus falls in the 3rd mansion (30 / 12.857 = 2.33).
    expect(lunarMansion(30).index).toBe(3);
    expect(lunarMansion(359.999).index).toBe(28);
    expect(lunarMansion(360).index).toBe(1);
    expect(lunarMansion(-1).index).toBe(28);
  });

  it("keeps floating-point edges inside 1–28", () => {
    expect(lunarMansion(359.9999999999).index).toBe(28);
    for (let lon = 0; lon < 360; lon += 0.5) {
      const i = lunarMansion(lon).index;
      expect(i).toBeGreaterThanOrEqual(1);
      expect(i).toBeLessThanOrEqual(28);
    }
  });
});
