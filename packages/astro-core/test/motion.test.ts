import { describe, expect, it } from "vitest";
import { astronomyEngineProvider, isApplying } from "../src";

describe("isApplying", () => {
  it("transit closing on a static natal point applies", () => {
    // Transiting body at 85°, natal point at 0°: square at 90° with the
    // separation growing toward it — applying.
    expect(isApplying(85, 1, 0, 0, 90)).toBe(true);
    // Past exact (95°) and still moving forward — separating.
    expect(isApplying(95, 1, 0, 0, 90)).toBe(false);
  });

  it("retrograde motion flips the verdict", () => {
    expect(isApplying(85, -1, 0, 0, 90)).toBe(false);
    expect(isApplying(95, -1, 0, 0, 90)).toBe(true);
  });

  it("uses the relative speed of both bodies", () => {
    // A behind B approaching a conjunction, but B runs away faster.
    expect(isApplying(355, 1, 0, 0.5, 0)).toBe(true);
    expect(isApplying(355, 0.5, 0, 1, 0)).toBe(false);
  });

  it("handles separations on the other side of zero", () => {
    // A at 5° ahead of B closing back toward the conjunction.
    expect(isApplying(5, -1, 0, 0, 0)).toBe(true);
    expect(isApplying(5, 1, 0, 0, 0)).toBe(false);
  });

  it("approaching an opposition from either side applies", () => {
    expect(isApplying(175, 1, 0, 0, 180)).toBe(true);
    // Past exact and moving on: separating. Retrograding back: applying.
    expect(isApplying(185, 1, 0, 0, 180)).toBe(false);
    expect(isApplying(185, -1, 0, 0, 180)).toBe(true);
  });

  it("an exactly perfected aspect reads as separating", () => {
    expect(isApplying(90, 1, 0, 0, 90)).toBe(false);
  });
});

describe("longitudeSpeed", () => {
  const eph = astronomyEngineProvider;
  const AT = new Date("1990-08-01T12:00:00Z");

  it("matches the bodies' real daily motion", () => {
    const sun = eph.longitudeSpeed("sun", AT);
    expect(sun).toBeGreaterThan(0.9);
    expect(sun).toBeLessThan(1.05);
    const moon = eph.longitudeSpeed("moon", AT);
    expect(moon).toBeGreaterThan(11.5);
    expect(moon).toBeLessThan(15.5);
  });

  it("is negative during a retrograde period", () => {
    // Mercury retrograde mid-December 2023 (station Dec 13, direct Jan 1/2).
    const retro = new Date("2023-12-20T00:00:00Z");
    expect(eph.longitudeSpeed("mercury", retro)).toBeLessThan(0);
    expect(eph.isRetrograde("mercury", retro)).toBe(true);
  });

  it("agrees in sign with isRetrograde", () => {
    for (const planet of ["mercury", "venus", "mars", "jupiter", "saturn"] as const) {
      const speed = eph.longitudeSpeed(planet, AT);
      expect(speed < 0).toBe(eph.isRetrograde(planet, AT));
    }
  });
});
