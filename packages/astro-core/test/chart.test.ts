import { describe, expect, it } from "vitest";
import { buildChart } from "../src";

/**
 * Dedicated buildChart tests — the golden suite pins longitudes and cusps;
 * this file pins the uncertainty branches (previously exercised only in
 * passing) and behavior at the ephemeris validity bounds.
 *
 * Noon Moon cusp distances for the fixture dates (astronomy-engine, UTC):
 *   1990-06-04 12:00 → 0.32° into Scorpio (inside both thresholds)
 *   1990-06-05 12:00 → 12.20° (outside both)
 *   1990-06-06 12:00 → 5.93° (inside the solar 7.5°, outside the approx 2.5°)
 */

const LONDON = { latitude: 51.5, longitude: 0 };

function fields(chart: ReturnType<typeof buildChart>): string[] {
  return chart.uncertainties.map((u) => u.field);
}

describe("buildChart uncertainty branches", () => {
  it("emits no uncertainties for an exact mid-latitude birth", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(1990, 5, 5, 12)),
      ...LONDON,
      timeCertainty: "exact",
    });
    expect(chart.uncertainties).toEqual([]);
    expect(chart.isSolarChart).toBe(false);
    expect(chart.houses).not.toBeNull();
  });

  it("approx time always flags ascendant and houses", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(1990, 5, 5, 12)),
      ...LONDON,
      timeCertainty: "approx",
    });
    expect(fields(chart).sort()).toEqual(["ascendant", "houses"]);
    // Approx is not solar: houses are still computed.
    expect(chart.houses).not.toBeNull();
    expect(chart.isSolarChart).toBe(false);
  });

  it("approx time adds moon_sign only within 2.5° of a cusp", () => {
    const near = buildChart({
      utc: new Date(Date.UTC(1990, 5, 4, 12)), // 0.32° from the cusp
      ...LONDON,
      timeCertainty: "approx",
    });
    expect(fields(near)).toContain("moon_sign");

    const mid = buildChart({
      utc: new Date(Date.UTC(1990, 5, 6, 12)), // 5.93° — solar band only
      ...LONDON,
      timeCertainty: "approx",
    });
    expect(fields(mid)).not.toContain("moon_sign");
  });

  it("unknown time suppresses houses and flags the wider 7.5° Moon band", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(1990, 5, 6, 12)), // 5.93° from the cusp
      ...LONDON,
      timeCertainty: "unknown",
    });
    expect(chart.isSolarChart).toBe(true);
    expect(chart.houses).toBeNull();
    expect(chart.bigThree.ascendant).toBeNull();
    expect(fields(chart).sort()).toEqual(["ascendant", "houses", "moon_sign"]);
    for (const p of chart.placements) expect(p.house).toBeNull();
  });

  it("unknown time far from a cusp flags only ascendant and houses", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(1990, 5, 5, 12)), // 12.20° from the cusp
      ...LONDON,
      timeCertainty: "unknown",
    });
    expect(fields(chart).sort()).toEqual(["ascendant", "houses"]);
  });
});

describe("buildChart at the ephemeris validity bounds", () => {
  // The Pluto model bounds the usable window to ~1700–2200 (the same range
  // lib/validation.ts and lib/aspectSearch.ts clamp to).
  const BOUNDS = [
    new Date(Date.UTC(1700, 0, 1, 12)),
    new Date(Date.UTC(2200, 11, 31, 12)),
  ];

  it.each(BOUNDS.map((d) => [d.toISOString(), d] as const))(
    "produces a complete, internally consistent chart at %s",
    (_label, utc) => {
      const chart = buildChart({ utc, ...LONDON, timeCertainty: "exact" });
      expect(chart.placements).toHaveLength(10);
      for (const p of chart.placements) {
        expect(Number.isFinite(p.longitude)).toBe(true);
        expect(p.longitude).toBeGreaterThanOrEqual(0);
        expect(p.longitude).toBeLessThan(360);
        // degreeInSign must agree with the longitude it came from.
        expect(p.degreeInSign).toBeCloseTo(p.longitude % 30, 10);
        expect(p.house).toBeGreaterThanOrEqual(1);
        expect(p.house).toBeLessThanOrEqual(12);
      }
      expect(chart.houses!.cusps).toHaveLength(12);
      for (const c of chart.houses!.cusps) {
        expect(Number.isFinite(c)).toBe(true);
      }
      expect(Number.isFinite(chart.houses!.ascendant)).toBe(true);
      expect(Number.isFinite(chart.houses!.mc)).toBe(true);
    },
  );
});
