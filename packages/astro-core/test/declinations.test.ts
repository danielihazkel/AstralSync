import * as Astronomy from "astronomy-engine";
import { describe, expect, it } from "vitest";
import {
  astronomyEngineProvider,
  declinationsAt,
  detectDeclinationAspects,
  meanObliquity,
  type PlanetDeclination,
} from "../src";
import type { Planet } from "../src/types";
import { PLANETS } from "../src/types";

/**
 * The provider computes declination from ecliptic-of-date angles + mean
 * obliquity; the cross-check here goes the independent way — rotating the
 * J2000 vector through astronomy-engine's EQJ→EQD matrix (precession +
 * nutation) — so agreement validates both the frame handling and the
 * obliquity shortcut.
 */
function referenceDeclination(planet: Planet, utc: Date): number {
  const BODY: Record<string, Astronomy.Body> = {
    sun: Astronomy.Body.Sun,
    moon: Astronomy.Body.Moon,
    mercury: Astronomy.Body.Mercury,
    venus: Astronomy.Body.Venus,
    mars: Astronomy.Body.Mars,
    jupiter: Astronomy.Body.Jupiter,
    saturn: Astronomy.Body.Saturn,
    uranus: Astronomy.Body.Uranus,
    neptune: Astronomy.Body.Neptune,
    pluto: Astronomy.Body.Pluto,
  };
  const rot = Astronomy.Rotation_EQJ_EQD(utc);
  const vec = Astronomy.RotateVector(rot, Astronomy.GeoVector(BODY[planet], utc, true));
  const r = Math.sqrt(vec.x ** 2 + vec.y ** 2 + vec.z ** 2);
  return (Math.asin(vec.z / r) * 180) / Math.PI;
}

describe("provider declination", () => {
  it("matches the EQD rotation path within 0.01° for all planets", () => {
    const at = new Date(Date.UTC(2026, 7, 23, 12));
    for (const planet of PLANETS) {
      expect(astronomyEngineProvider.declination(planet, at)).toBeCloseTo(
        referenceDeclination(planet, at),
        2,
      );
    }
  });

  it("puts the solstice Sun at the obliquity and the equinox Sun near zero", () => {
    const solstice = astronomyEngineProvider.declination(
      "sun",
      new Date(Date.UTC(2026, 5, 21, 12)),
    );
    expect(solstice).toBeCloseTo(23.44, 1);
    const equinox = astronomyEngineProvider.declination(
      "sun",
      new Date(Date.UTC(2026, 2, 20, 12)),
    );
    expect(Math.abs(equinox)).toBeLessThan(0.1);
  });
});

describe("declinationsAt / out of bounds", () => {
  it("flags the standstill-era Moon as out of bounds", () => {
    const decs = declinationsAt(new Date(Date.UTC(2025, 2, 7)));
    const moon = decs.find((d) => d.planet === "moon")!;
    expect(moon.declination).toBeCloseTo(28.34, 1);
    expect(moon.outOfBounds).toBe(true);
  });

  it("never flags the Sun out of bounds across the year", () => {
    for (const m of [0, 2, 5, 8, 11]) {
      const decs = declinationsAt(new Date(Date.UTC(2026, m, 15)));
      expect(decs.find((d) => d.planet === "sun")!.outOfBounds).toBe(false);
    }
  });

  it("keeps the Moon in bounds through the 2015 minor-standstill lull", () => {
    // Monthly maxima stay near ±18° around a minor standstill — well inside
    // the obliquity, so no day that March is out of bounds.
    for (let day = 1; day <= 28; day++) {
      const decs = declinationsAt(new Date(Date.UTC(2015, 2, day)));
      expect(decs.find((d) => d.planet === "moon")!.outOfBounds).toBe(false);
    }
  });

  it("uses the obliquity of date as the bounds threshold", () => {
    const at = new Date(Date.UTC(2026, 0, 1));
    const eps = meanObliquity(at);
    const decs = declinationsAt(at);
    for (const d of decs) {
      expect(d.outOfBounds).toBe(Math.abs(d.declination) > eps);
    }
  });
});

describe("detectDeclinationAspects", () => {
  const dec = (planet: Planet, declination: number): PlanetDeclination => ({
    planet,
    declination,
    outOfBounds: false,
  });

  it("finds parallels and contraparallels within the 1° orb", () => {
    const found = detectDeclinationAspects([
      dec("sun", 10),
      dec("moon", 10.4), // parallel, orb 0.4
      dec("mars", -9.8), // contraparallel to sun (0.2) and moon (0.6)
      dec("saturn", 20), // nothing
    ]);
    expect(found).toEqual([
      { a: "sun", b: "mars", type: "contraparallel", orb: expect.closeTo(0.2) },
      { a: "sun", b: "moon", type: "parallel", orb: expect.closeTo(0.4) },
      { a: "moon", b: "mars", type: "contraparallel", orb: expect.closeTo(0.6) },
    ]);
  });

  it("yields one aspect per pair, preferring the parallel on a tie", () => {
    // One planet on the equator: parallel and contraparallel orbs are both
    // 0.5 — the tie resolves to the parallel.
    const found = detectDeclinationAspects([dec("sun", 0), dec("moon", 0.5)]);
    expect(found).toHaveLength(1);
    expect(found[0].type).toBe("parallel");

    // Straddling the equator symmetrically is an exact contraparallel.
    const contra = detectDeclinationAspects([dec("sun", 0.1), dec("moon", -0.1)]);
    expect(contra).toHaveLength(1);
    expect(contra[0].type).toBe("contraparallel");
    expect(contra[0].orb).toBeCloseTo(0);
  });

  it("excludes pairs beyond the orb and honors a custom orb", () => {
    const pair = [dec("sun", 10), dec("moon", 11.5)];
    expect(detectDeclinationAspects(pair)).toHaveLength(0);
    expect(detectDeclinationAspects(pair, 2)).toHaveLength(1);
  });
});
