import { describe, expect, it } from "vitest";
import { detectPatterns, signOf, type Planet } from "../src";

function member(planet: Planet, longitude: number) {
  return { planet, longitude, sign: signOf(longitude) };
}

describe("detectPatterns", () => {
  it("finds a stellium of three planets sharing a sign", () => {
    const patterns = detectPatterns([
      member("sun", 95),
      member("mercury", 102),
      member("venus", 118),
      member("mars", 200),
    ]);
    expect(patterns).toEqual([
      {
        type: "stellium",
        planets: ["sun", "mercury", "venus"],
        signs: ["cancer"],
      },
    ]);
  });

  it("finds a grand trine and reports the maximal set once", () => {
    // Four planets pairwise trine is impossible; three at 0/120/240 with a
    // fourth conjunct one corner must yield exactly two overlapping trines
    // (sun-moon-mars and venus-moon-mars), both maximal.
    const patterns = detectPatterns([
      member("sun", 10),
      member("moon", 130),
      member("mars", 250),
      member("venus", 14),
    ]);
    const trines = patterns.filter((p) => p.type === "grand_trine");
    expect(trines).toHaveLength(2);
    for (const t of trines) expect(t.planets).toHaveLength(3);
  });

  it("finds a t-square with the correct apex", () => {
    const patterns = detectPatterns([
      member("sun", 0),
      member("moon", 180),
      member("saturn", 92),
    ]);
    expect(patterns).toEqual([
      {
        type: "t_square",
        planets: ["sun", "moon", "saturn"],
        signs: ["aries", "libra", "cancer"],
        apex: "saturn",
      },
    ]);
  });

  it("reports a grand cross and suppresses its t-squares", () => {
    const patterns = detectPatterns([
      member("sun", 0),
      member("moon", 90),
      member("mars", 180),
      member("saturn", 270),
    ]);
    expect(patterns).toEqual([
      {
        type: "grand_cross",
        planets: ["sun", "moon", "mars", "saturn"],
        signs: ["aries", "cancer", "libra", "capricorn"],
      },
    ]);
  });

  it("finds a yod pointing at its apex", () => {
    const patterns = detectPatterns([
      member("venus", 0),
      member("mars", 60),
      member("neptune", 210),
    ]);
    expect(patterns).toEqual([
      {
        type: "yod",
        planets: ["venus", "mars", "neptune"],
        signs: ["aries", "gemini", "scorpio"],
        apex: "neptune",
      },
    ]);
  });

  it("rejects near-misses just outside orb", () => {
    // Trine legs at 128° (8 past exact, orb 7) — no pattern.
    expect(
      detectPatterns([
        member("sun", 0),
        member("moon", 128),
        member("mars", 240),
      ]),
    ).toEqual([]);
    // Yod quincunx at 154° (4 past exact, orb 3) — no yod.
    expect(
      detectPatterns([
        member("venus", 0),
        member("mars", 60),
        member("neptune", 214),
      ]),
    ).toEqual([]);
  });

  it("is deterministic and orders members by PLANETS order", () => {
    const input = [
      member("saturn", 92),
      member("moon", 180),
      member("sun", 0),
    ];
    const a = detectPatterns(input);
    const b = detectPatterns([...input].reverse());
    expect(a).toEqual(b);
    expect(a[0].planets).toEqual(["sun", "moon", "saturn"]);
  });
});
