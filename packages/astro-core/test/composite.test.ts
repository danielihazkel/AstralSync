import { describe, expect, it } from "vitest";
import {
  PLANETS,
  circularMidpoint,
  compositeChart,
  type Placement,
  type Sign,
} from "../src";
import { signOf } from "../src/chart";

function placement(planet: (typeof PLANETS)[number], longitude: number): Placement {
  return {
    planet,
    longitude,
    sign: signOf(longitude),
    degreeInSign: longitude % 30,
    house: 1,
    retrograde: true,
  };
}

describe("circularMidpoint", () => {
  it("takes the shorter arc across the 0° wrap (350° / 10° → 0°)", () => {
    expect(circularMidpoint(350, 10)).toBe(0);
    expect(circularMidpoint(10, 350)).toBe(0);
  });

  it("averages plainly when the pair does not wrap", () => {
    expect(circularMidpoint(30, 90)).toBe(60);
  });

  it("breaks exact oppositions deterministically, 90° east of the first arg", () => {
    expect(circularMidpoint(0, 180)).toBe(90);
    expect(circularMidpoint(180, 0)).toBe(270);
  });
});

describe("compositeChart", () => {
  const a = PLANETS.map((p, i) => placement(p, i * 20));
  const b = PLANETS.map((p, i) => placement(p, i * 20 + 40));

  it("puts each planet at the pair midpoint with derived sign", () => {
    const { placements } = compositeChart(a, b);
    expect(placements).toHaveLength(10);
    for (const [i, p] of placements.entries()) {
      expect(p.longitude).toBe(i * 20 + 20);
      expect(p.sign).toBe(signOf(p.longitude) as Sign);
      expect(p.degreeInSign).toBeGreaterThanOrEqual(0);
      expect(p.degreeInSign).toBeLessThan(30);
    }
  });

  it("has no houses and no motion", () => {
    const { placements } = compositeChart(a, b);
    expect(placements.every((p) => p.house === null)).toBe(true);
    expect(placements.every((p) => !p.retrograde)).toBe(true);
  });

  it("detects internal aspects at natal orbs", () => {
    // Midpoints land 20° apart in this fixture, so 60°/120°/180° pairs abound.
    const { aspects } = compositeChart(a, b);
    expect(aspects.length).toBeGreaterThan(0);
    expect(
      aspects.some((x) => x.type === "sextile" || x.type === "trine"),
    ).toBe(true);
    for (const x of aspects) {
      expect(x.orb).toBeLessThanOrEqual(8);
    }
  });

  it("skips planets missing from either side", () => {
    const { placements } = compositeChart(a.slice(0, 3), b);
    expect(placements.map((p) => p.planet)).toEqual(["sun", "moon", "mercury"]);
  });
});
