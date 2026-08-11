import { describe, expect, it } from "vitest";
import { hebrewDateGematria } from "../src";

describe("Hebrew date gematria (Phase 2a)", () => {
  it("reduces day and year independently, then the sum (15 + 5760 → 6)", () => {
    const r = hebrewDateGematria({ day: 15, year: 5760 });
    // 15 → 6; 5760 → 18 → 9; 6+9 = 15 → 6
    expect(r.derivation.components).toEqual([
      { part: "day", raw: 15, steps: [15, 6], reduced: 6 },
      { part: "year", raw: 5760, steps: [5760, 18, 9], reduced: 9 },
    ]);
    expect(r.derivation.total).toBe(15);
    expect(r.derivation.steps).toEqual([15, 6]);
    expect(r.value).toBe(6);
    expect(r.isMaster).toBe(false);
  });

  it("preserves a master number at the final sum (3 + 5768 → 11)", () => {
    const r = hebrewDateGematria({ day: 3, year: 5768 });
    // 3; 5768 → 26 → 8; 3+8 = 11 — kept, never reduced to 2
    expect(r.value).toBe(11);
    expect(r.isMaster).toBe(true);
    expect(r.derivation.steps).toEqual([11]);
  });

  it("preserves a master number mid-reduction in a component (day 29 → 11)", () => {
    const r = hebrewDateGematria({ day: 29, year: 5757 });
    const day = r.derivation.components[0];
    expect(day.steps).toEqual([29, 11]); // stops at 11, never 2
    expect(day.reduced).toBe(11);
    // year 5757 → 24 → 6; 11+6 = 17 → 8
    expect(r.derivation.total).toBe(17);
    expect(r.value).toBe(8);
    expect(r.isMaster).toBe(false);
  });
});
