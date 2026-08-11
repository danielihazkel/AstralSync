import { describe, expect, it } from "vitest";
import { buildChart } from "../src";

describe("solar chart mode (unknown birth time, PRD §3.1)", () => {
  // Caller convention: local noon converted to UTC.
  const chart = buildChart({
    utc: new Date(Date.UTC(1985, 9, 12, 10, 0, 0)),
    latitude: 32.08,
    longitude: 34.78,
    timeCertainty: "unknown",
  });

  it("still yields a complete, valid chart", () => {
    expect(chart.isSolarChart).toBe(true);
    expect(chart.placements).toHaveLength(10);
    expect(chart.bigThree.sun).toBeTruthy();
    expect(chart.aspects.length).toBeGreaterThan(0);
  });

  it("suppresses Ascendant and houses with machine-readable reasons", () => {
    expect(chart.houses).toBeNull();
    expect(chart.bigThree.ascendant).toBeNull();
    for (const p of chart.placements) expect(p.house).toBeNull();
    const fields = chart.uncertainties.map((u) => u.field);
    expect(fields).toContain("ascendant");
    expect(fields).toContain("houses");
  });

  it("flags a cusp-adjacent Moon as uncertain when time is approximate", () => {
    // Find an instant where the Moon sits within 2.5° of a sign boundary by
    // scanning a lunar month at 1h resolution, then assert the flag.
    let flagged = false;
    for (let h = 0; h < 24 * 30 && !flagged; h++) {
      const c = buildChart({
        utc: new Date(Date.UTC(2024, 0, 1, h, 0, 0)),
        latitude: 40,
        longitude: -74,
        timeCertainty: "approx",
      });
      const moon = c.placements.find((p) => p.planet === "moon")!;
      const toCusp = Math.min(moon.degreeInSign, 30 - moon.degreeInSign);
      if (toCusp <= 2.5) {
        expect(c.uncertainties.some((u) => u.field === "moon_sign")).toBe(true);
        flagged = true;
      }
    }
    expect(flagged).toBe(true);
  });

  it("always flags Ascendant and houses as uncertain for approximate time", () => {
    const c = buildChart({
      utc: new Date(Date.UTC(2024, 0, 1, 12, 0, 0)),
      latitude: 40,
      longitude: -74,
      timeCertainty: "approx",
    });
    expect(c.houses).not.toBeNull(); // approx still computes houses …
    const fields = c.uncertainties.map((u) => u.field);
    expect(fields).toContain("ascendant"); // … but flags them
    expect(fields).toContain("houses");
  });
});
