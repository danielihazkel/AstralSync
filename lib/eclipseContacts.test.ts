import { describe, expect, it } from "vitest";
import {
  ECLIPSE_ORB,
  describeEclipseContacts,
  eclipseContacts,
  natalEclipsePoints,
} from "./eclipseContacts";

describe("eclipseContacts", () => {
  const points = natalEclipsePoints({
    placements: [
      { planet: "sun", longitude: 19.5 },
      { planet: "moon", longitude: 201 },
      { planet: "mars", longitude: 100 },
    ],
    houses: { ascendant: 358.5, mc: 270 },
  });

  it("finds conjunctions and oppositions inside the orb, tightest first", () => {
    // The 2024-04-08 eclipse at 19°24′ Aries.
    const c = eclipseContacts(19.4, points);
    expect(c.map((x) => [x.point, x.type])).toEqual([
      ["sun", "conjunction"],
      ["moon", "opposition"],
    ]);
    expect(c[0].orb).toBeCloseTo(0.1, 6);
  });

  it("wraps across 0° Aries and respects the orb edge", () => {
    expect(eclipseContacts(1.0, points).map((x) => x.point)).toEqual(["ascendant"]);
    expect(eclipseContacts(358.5 + ECLIPSE_ORB + 0.01, points)).toEqual([]);
  });

  it("leaves a solar chart's Moon and missing angles out", () => {
    const solar = natalEclipsePoints({
      placements: [{ planet: "moon", longitude: 10 }, { planet: "sun", longitude: 50 }],
      houses: null,
      isSolarChart: true,
    });
    expect(solar.map((p) => p.point)).toEqual(["sun"]);
  });

  it("reads as a short phrase", () => {
    expect(
      describeEclipseContacts([
        { point: "sun", type: "conjunction", orb: 0.12 },
        { point: "ascendant", type: "opposition", orb: 2 },
      ]),
    ).toBe("on natal Sun (0.1°), opposite natal Ascendant (2.0°)");
  });
});
