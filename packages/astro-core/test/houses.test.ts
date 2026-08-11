import { describe, expect, it } from "vitest";
import {
  angleDiff,
  buildChart,
  equalHouses,
  houseOf,
  norm360,
  wholeSignHouses,
} from "../src";

describe("house systems", () => {
  const base = {
    utc: new Date(Date.UTC(1990, 5, 15, 14, 30, 0)),
    latitude: 40.7,
    longitude: -74.0,
  };

  it("Placidus: cusp 1 = Ascendant, cusp 10 = MC, cusps advance monotonically", () => {
    const chart = buildChart({ ...base, houseSystem: "placidus" });
    const h = chart.houses!;
    expect(h.system).toBe("placidus");
    expect(h.fallbackApplied).toBe(false);
    expect(h.cusps[0]).toBeCloseTo(h.ascendant, 6);
    expect(h.cusps[9]).toBeCloseTo(h.mc, 6);
    // each cusp lies strictly ahead of the previous, and the 12 gaps sum to 360
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const gap = norm360(h.cusps[(i + 1) % 12] - h.cusps[i]);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(120);
      total += gap;
    }
    expect(total).toBeCloseTo(360, 6);
  });

  it("Placidus at the equator reduces to equal 30° arcs in right ascension", () => {
    // At φ=0 the ascensional difference vanishes; opposite cusps differ by 180°.
    const chart = buildChart({ ...base, latitude: 0, houseSystem: "placidus" });
    const h = chart.houses!;
    for (let i = 0; i < 6; i++) {
      expect(Math.abs(angleDiff(h.cusps[i + 6], h.cusps[i] + 180))).toBeLessThan(1e-6);
    }
  });

  it("falls back to Whole Sign at high latitude (Svalbard, 78°N)", () => {
    const chart = buildChart({ ...base, latitude: 78, houseSystem: "placidus" });
    const h = chart.houses!;
    expect(h.system).toBe("whole_sign");
    expect(h.requestedSystem).toBe("placidus");
    expect(h.fallbackApplied).toBe(true);
    expect(chart.uncertainties.some((u) => u.field === "houses")).toBe(true);
    for (const cusp of h.cusps) expect(cusp % 30).toBe(0);
  });

  it("Whole Sign cusps start at 0° of the rising sign", () => {
    const cusps = wholeSignHouses(101.6); // 11.6° Cancer rising
    expect(cusps[0]).toBe(90);
    expect(cusps[3]).toBe(180);
    expect(cusps).toHaveLength(12);
  });

  it("Equal House cusps step 30° from the exact Ascendant", () => {
    const cusps = equalHouses(101.6);
    expect(cusps[0]).toBeCloseTo(101.6);
    expect(cusps[11]).toBeCloseTo(norm360(101.6 + 330));
  });

  it("houseOf assigns longitudes across the 0° Aries wrap", () => {
    const cusps = equalHouses(350); // house 1 spans 350°–20°
    expect(houseOf(355, cusps)).toBe(1);
    expect(houseOf(10, cusps)).toBe(1);
    expect(houseOf(25, cusps)).toBe(2);
    expect(houseOf(349, cusps)).toBe(12);
  });
});
