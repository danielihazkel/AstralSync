import { describe, expect, it } from "vitest";
import { detectAngleAspects } from "../src";

const HOUSES = { ascendant: 100, mc: 10 };

describe("detectAngleAspects", () => {
  it("detects majors from a planet to both angles", () => {
    const found = detectAngleAspects(
      [{ planet: "saturn", longitude: 102 }], // conj ASC orb 2, sq MC orb 2
      HOUSES,
    );
    expect(found).toEqual([
      { planet: "saturn", target: "ascendant", type: "conjunction", angle: 0, orb: 2 },
      { planet: "saturn", target: "mc", type: "square", angle: 90, orb: 2 },
    ]);
  });

  it("uses the default orb even for luminaries", () => {
    // orb 7: within the luminary orb (8) but past the default (6) — rejected.
    const asc = (lon: number) =>
      detectAngleAspects([{ planet: "sun" as const, longitude: lon }], HOUSES).filter(
        (a) => a.target === "ascendant",
      );
    expect(asc(107)).toEqual([]);
    expect(asc(105)).toMatchObject([
      { planet: "sun", target: "ascendant", type: "conjunction", orb: 5 },
    ]);
  });

  it("reports a Descendant conjunction as the ASC opposition", () => {
    const found = detectAngleAspects(
      [{ planet: "venus", longitude: 281 }], // 181° from ASC 100
      HOUSES,
    ).filter((a) => a.target === "ascendant");
    expect(found).toEqual([
      { planet: "venus", target: "ascendant", type: "opposition", angle: 180, orb: 1 },
    ]);
  });

  it("keeps only the tightest aspect per planet–angle pair", () => {
    // 55° from the MC: sextile orb 5 (within), square orb 35 (out) — one hit.
    const found = detectAngleAspects([{ planet: "mars", longitude: 65 }], HOUSES);
    expect(found.filter((a) => a.target === "mc")).toEqual([
      { planet: "mars", target: "mc", type: "sextile", angle: 60, orb: 5 },
    ]);
  });

  it("handles the 0° wrap", () => {
    const found = detectAngleAspects(
      [{ planet: "moon", longitude: 357 }], // 13° from MC 10 → conj? orb 13 no; vs ASC 100: 103° → square orb 13 no
      { ascendant: 355, mc: 265 },
    );
    expect(found).toEqual([
      { planet: "moon", target: "ascendant", type: "conjunction", angle: 0, orb: 2 },
      { planet: "moon", target: "mc", type: "square", angle: 90, orb: 2 },
    ]);
  });

  it("respects a custom orb configuration", () => {
    const p = [{ planet: "jupiter" as const, longitude: 104 }];
    expect(detectAngleAspects(p, HOUSES, { luminary: 8, default: 3 })).toEqual([]);
    // default 5: conj ASC orb 4 and square MC orb 4 both admit.
    expect(
      detectAngleAspects(p, HOUSES, { luminary: 8, default: 5 }),
    ).toMatchObject([
      { target: "ascendant", type: "conjunction", orb: 4 },
      { target: "mc", type: "square", orb: 4 },
    ]);
  });
});
