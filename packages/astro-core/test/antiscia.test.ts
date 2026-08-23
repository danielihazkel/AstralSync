import { describe, expect, it } from "vitest";
import { antiscionOf, detectAntiscia } from "../src";
import type { Planet } from "../src/types";

function at(planet: Planet, longitude: number) {
  return { planet, longitude };
}

describe("antiscionOf", () => {
  it("reflects across 0° Cancer / 0° Capricorn", () => {
    // 5° Gemini (65°) reflects to 25° Cancer (115°) — the classical
    // Gemini↔Cancer pairing.
    expect(antiscionOf(65)).toBe(115);
    expect(antiscionOf(115)).toBe(65);
    // The solstitial points are their own antiscia.
    expect(antiscionOf(90)).toBe(90);
    expect(antiscionOf(270)).toBe(270);
    // 10° Aries (10°) ↔ 20° Virgo (170°).
    expect(antiscionOf(10)).toBe(170);
  });

  it("is an involution everywhere", () => {
    for (const lon of [0, 33.3, 89.99, 181, 300.5]) {
      expect(antiscionOf(antiscionOf(lon))).toBeCloseTo(lon, 10);
    }
  });
});

describe("detectAntiscia", () => {
  it("finds antiscia and contra-antiscia within the 1° orb", () => {
    const found = detectAntiscia([
      at("sun", 65), // antiscion at 115
      at("moon", 115.4), // antiscia, orb 0.4
      at("mars", 295.2), // sun+mars = 0.2 past 360 → contra, orb 0.2
      at("saturn", 200), // nothing with anyone
    ]);
    expect(found).toEqual([
      { a: "sun", b: "mars", type: "contra_antiscia", orb: expect.closeTo(0.2) },
      { a: "sun", b: "moon", type: "antiscia", orb: expect.closeTo(0.4) },
    ]);
  });

  it("prefers the antiscion on a tie and honors a custom orb", () => {
    // On the axis: 90 + 90 = 180 exactly — antiscia at orb 0.
    const axis = detectAntiscia([at("sun", 90), at("moon", 90)]);
    expect(axis).toEqual([
      { a: "sun", b: "moon", type: "antiscia", orb: expect.closeTo(0) },
    ]);

    const wide = [at("sun", 65), at("moon", 117)]; // sum 182 → orb 2
    expect(detectAntiscia(wide)).toHaveLength(0);
    expect(detectAntiscia(wide, 3)).toHaveLength(1);
  });

  it("a planet conjunct another's antiscion degree is an antiscia contact", () => {
    const sunLon = 33.3;
    const found = detectAntiscia([
      at("sun", sunLon),
      at("venus", antiscionOf(sunLon)),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].type).toBe("antiscia");
    expect(found[0].orb).toBeCloseTo(0, 10);
  });
});
