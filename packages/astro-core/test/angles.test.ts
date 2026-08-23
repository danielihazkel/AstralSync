import { describe, expect, it } from "vitest";
import {
  angleDiff,
  julianDay,
  meanObliquity,
  norm360,
  separation,
} from "../src/angles";

/** Direct tests for the angle/time primitives — previously validated only
 *  transitively through cusp accuracy in the golden suite. */

describe("julianDay", () => {
  it("maps the Unix epoch to JD 2440587.5", () => {
    expect(julianDay(new Date(Date.UTC(1970, 0, 1)))).toBe(2_440_587.5);
  });

  it("maps the J2000.0 epoch to JD 2451545.0", () => {
    expect(julianDay(new Date(Date.UTC(2000, 0, 1, 12)))).toBe(2_451_545.0);
  });

  it("advances exactly one per UTC day", () => {
    const a = julianDay(new Date(Date.UTC(2026, 7, 23)));
    const b = julianDay(new Date(Date.UTC(2026, 7, 24)));
    expect(b - a).toBe(1);
  });
});

describe("meanObliquity", () => {
  it("matches the IAU 2006 value at J2000 (23°26′21.406″)", () => {
    expect(meanObliquity(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(
      84_381.406 / 3600,
      9,
    );
  });

  it("decreases by ~46.8″ per century", () => {
    const e2000 = meanObliquity(new Date(Date.UTC(2000, 0, 1, 12)));
    const e2100 = meanObliquity(new Date(Date.UTC(2100, 0, 1, 12)));
    expect((e2000 - e2100) * 3600).toBeCloseTo(46.8, 0);
  });

  it("stays in the 23.4° neighborhood across the supported window", () => {
    for (const year of [1700, 1900, 2026, 2200]) {
      const e = meanObliquity(new Date(Date.UTC(year, 0, 1)));
      expect(e).toBeGreaterThan(23.4);
      expect(e).toBeLessThan(23.5);
    }
  });
});

describe("angle primitives", () => {
  it("norm360 wraps negatives and multiples", () => {
    expect(norm360(-30)).toBe(330);
    expect(norm360(720)).toBe(0);
    expect(norm360(359.5)).toBe(359.5);
  });

  it("angleDiff is signed and wrap-aware", () => {
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(350, 10)).toBe(-20);
    expect(angleDiff(180, 0)).toBe(180); // opposition maps to +180, not −180
  });

  it("separation is unsigned and wrap-aware", () => {
    expect(separation(359, 1)).toBe(2);
    expect(separation(90, 270)).toBe(180);
  });
});
