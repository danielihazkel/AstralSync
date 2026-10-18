import { describe, expect, it } from "vitest";
import {
  astronomyEngineProvider,
  eclipticToRightAscension,
  meanObliquity,
  progressedRamc,
  ramcAt,
  separation,
} from "../src";

describe("eclipticToRightAscension", () => {
  it("fixes the equinoxes and solstices", () => {
    const eps = 23.44;
    expect(eclipticToRightAscension(0, eps)).toBeCloseTo(0, 9);
    expect(eclipticToRightAscension(90, eps)).toBeCloseTo(90, 9);
    expect(eclipticToRightAscension(180, eps)).toBeCloseTo(180, 9);
    expect(eclipticToRightAscension(270, eps)).toBeCloseTo(270, 9);
  });

  it("matches tan(α) = cos(ε)·tan(λ) in each quadrant", () => {
    const eps = 23.44;
    for (const lon of [30, 120, 210, 300]) {
      const ra = eclipticToRightAscension(lon, eps);
      expect(Math.floor(ra / 90)).toBe(Math.floor(lon / 90));
      const r = (d: number) => (d * Math.PI) / 180;
      expect(Math.tan(r(ra))).toBeCloseTo(
        Math.cos(r(eps)) * Math.tan(r(lon)),
        9,
      );
    }
  });
});

describe("progressedRamc", () => {
  const natal = new Date(Date.UTC(1990, 2, 4, 10, 30, 0));
  const DAY = 86_400_000;

  it("equals the natal RAMC at the birth instant", () => {
    expect(progressedRamc(natal, natal, 34.78)).toBeCloseTo(
      ramcAt(natal, 34.78),
      9,
    );
  });

  it("advances by the progressed Sun's arc in right ascension", () => {
    const progressed = new Date(natal.getTime() + 30.5 * DAY);
    const sunRa = (utc: Date) =>
      eclipticToRightAscension(
        astronomyEngineProvider.eclipticLongitude("sun", utc),
        meanObliquity(utc),
      );
    const expected = ramcAt(natal, 0) + (sunRa(progressed) - sunRa(natal));
    expect(
      separation(progressedRamc(natal, progressed, 0), expected),
    ).toBeLessThan(1e-9);
    // ~1° per progressed day, nothing like the ~361° of sidereal time.
    const advance = separation(
      progressedRamc(natal, progressed, 0),
      ramcAt(natal, 0),
    );
    expect(advance).toBeGreaterThan(27);
    expect(advance).toBeLessThan(34);
  });
});
