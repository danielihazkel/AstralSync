import * as Astronomy from "astronomy-engine";
import { describe, expect, it } from "vitest";
import {
  meanLilith,
  meanNode,
  norm360,
  overlayHouses,
  pointsAt,
  positionsAt,
  separation,
  trueNode,
} from "../src";

const J2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));

describe("meanNode", () => {
  it("matches the Meeus epoch value at J2000 (125.0445° ≈ 5°03′ Leo)", () => {
    expect(separation(meanNode(J2000), 125.0445)).toBeLessThan(0.01);
  });

  it("regresses ~19.35° per year (18.6-year cycle)", () => {
    const later = new Date(Date.UTC(2001, 0, 1, 12, 0, 0));
    let motion = norm360(meanNode(later) - meanNode(J2000));
    if (motion > 180) motion -= 360;
    expect(motion).toBeLessThan(-19);
    expect(motion).toBeGreaterThan(-20);
  });
});

describe("trueNode", () => {
  it("equals the Moon's longitude exactly at an ascending node crossing", () => {
    // At a crossing the Moon lies on the ecliptic, so its position vector IS
    // the node line — the osculating node must agree with the Moon itself.
    let event = Astronomy.SearchMoonNode(new Date(Date.UTC(2024, 0, 1)));
    while (event.kind !== Astronomy.NodeEventKind.Ascending) {
      event = Astronomy.NextMoonNode(event);
    }
    const at = event.time.date;
    const moon = positionsAt(at).find((p) => p.planet === "moon")!;
    expect(separation(trueNode(at), moon.longitude)).toBeLessThan(0.05);
  });

  it("stays within the ±1.75° osculation band of the mean node", () => {
    // Two independent implementations (Meeus polynomial vs. osculating
    // elements from the ephemeris) cross-check each other here.
    for (const year of [1950, 1979, 2000, 2013, 2026]) {
      const utc = new Date(Date.UTC(year, 5, 15));
      expect(separation(trueNode(utc), meanNode(utc))).toBeLessThan(2.0);
    }
  });
});

describe("meanLilith", () => {
  it("matches the Meeus epoch value at J2000 (263.353° ≈ 23°21′ Sagittarius)", () => {
    expect(separation(meanLilith(J2000), 263.353)).toBeLessThan(0.01);
  });

  it("advances ~40.7° per year prograde (8.85-year apsidal cycle)", () => {
    const later = new Date(Date.UTC(2001, 0, 1, 12, 0, 0));
    const motion = norm360(meanLilith(later) - meanLilith(J2000));
    expect(motion).toBeGreaterThan(40);
    expect(motion).toBeLessThan(41.5);
  });

  it("points roughly at the Moon when the Moon is at apogee", () => {
    // The actual apsis direction oscillates around the mean line; this is a
    // sanity bound, not a precision check.
    const apsis = Astronomy.SearchLunarApsis(new Date(Date.UTC(2024, 0, 1)));
    const apogee =
      apsis.kind === Astronomy.ApsisKind.Apocenter
        ? apsis
        : Astronomy.NextLunarApsis(apsis);
    const at = apogee.time.date;
    const moon = positionsAt(at).find((p) => p.planet === "moon")!;
    expect(separation(meanLilith(at), moon.longitude)).toBeLessThan(30);
  });
});

describe("pointsAt", () => {
  it("returns north node, south node (opposite), and lilith with null houses", () => {
    const points = pointsAt(J2000);
    expect(points.map((p) => p.point)).toEqual([
      "north_node",
      "south_node",
      "lilith",
    ]);
    const [north, south] = points;
    expect(separation(norm360(north.longitude + 180), south.longitude)).toBeLessThan(1e-9);
    expect(points.every((p) => p.house === null)).toBe(true);
    expect(points.every((p) => p.degreeInSign >= 0 && p.degreeInSign < 30)).toBe(true);
  });

  it("mean variant uses the polynomial and is always retrograde", () => {
    const [north, south, lilith] = pointsAt(J2000, "mean");
    expect(north.longitude).toBe(meanNode(J2000));
    expect(north.retrograde).toBe(true);
    expect(south.retrograde).toBe(true);
    expect(lilith.retrograde).toBe(false);
  });

  it("derives signs correctly (J2000 mean node in Leo, lilith in Sagittarius)", () => {
    const [north, south, lilith] = pointsAt(J2000, "mean");
    expect(north.sign).toBe("leo");
    expect(south.sign).toBe("aquarius");
    expect(lilith.sign).toBe("sagittarius");
  });

  it("overlays houses like planetary placements", () => {
    const cusps = Array.from({ length: 12 }, (_, i) => i * 30);
    const overlaid = overlayHouses(pointsAt(J2000, "mean"), cusps);
    // Mean node 125.04° falls in the 30°-wide house starting at 120°.
    expect(overlaid[0].house).toBe(5);
    expect(overlayHouses(pointsAt(J2000), null)[0].house).toBeNull();
  });
});
