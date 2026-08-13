import { describe, expect, it } from "vitest";
import { upcomingEclipses } from "../src";

/**
 * Reference events (NASA eclipse catalog / Five Millennium Canon):
 * - 2024-04-08 18:17 UT — total solar eclipse, Sun at ~19°24' Aries.
 * - 2025-03-14 06:59 UT — total lunar eclipse, Moon at ~23°57' Virgo.
 * - 2025-09-07 18:12 UT — total lunar eclipse, Moon at ~15°23' Pisces.
 */

const HOUR_MS = 3_600_000;

function peakMs(iso: string): number {
  return new Date(iso).getTime();
}

describe("upcomingEclipses", () => {
  it("finds the 2024-04-08 total solar eclipse in Aries", () => {
    const events = upcomingEclipses(new Date(Date.UTC(2024, 3, 1)), 14);
    const solar = events.filter((e) => e.kind === "solar");
    expect(solar).toHaveLength(1);
    expect(solar[0].type).toBe("total");
    expect(solar[0].sign).toBe("aries");
    expect(solar[0].degreeInSign).toBeGreaterThan(18.5);
    expect(solar[0].degreeInSign).toBeLessThan(20.5);
    expect(
      Math.abs(peakMs(solar[0].peakUtc) - Date.UTC(2024, 3, 8, 18, 17)),
    ).toBeLessThan(HOUR_MS);
    expect(solar[0].obscuration).toBe(1);
  });

  it("finds the 2025-03-14 total lunar eclipse in Virgo", () => {
    const events = upcomingEclipses(new Date(Date.UTC(2025, 2, 1)), 20);
    const lunar = events.filter((e) => e.kind === "lunar");
    expect(lunar).toHaveLength(1);
    expect(lunar[0].type).toBe("total");
    expect(lunar[0].sign).toBe("virgo");
    expect(lunar[0].degreeInSign).toBeGreaterThan(23);
    expect(lunar[0].degreeInSign).toBeLessThan(25);
    expect(
      Math.abs(peakMs(lunar[0].peakUtc) - Date.UTC(2025, 2, 14, 6, 59)),
    ).toBeLessThan(HOUR_MS);
    expect(lunar[0].obscuration).toBe(1);
  });

  it("returns both events of an eclipse season sorted by peak", () => {
    // Sep 2025 season: total lunar Sep 7, partial solar Sep 21.
    const events = upcomingEclipses(new Date(Date.UTC(2025, 8, 1)), 30);
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("lunar");
    expect(events[0].sign).toBe("pisces");
    expect(events[1].kind).toBe("solar");
    expect(events[1].type).toBe("partial");
    const times = events.map((e) => peakMs(e.peakUtc));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("returns nothing when no eclipse peaks inside the horizon", () => {
    // Mid-eclipse-season gap: no eclipses in May 2024.
    expect(upcomingEclipses(new Date(Date.UTC(2024, 4, 1)), 21)).toHaveLength(
      0,
    );
  });

  it("excludes an eclipse just past the horizon", () => {
    // 2024-04-08 is 7 days after Apr 1; a 6-day horizon must miss it.
    const events = upcomingEclipses(new Date(Date.UTC(2024, 3, 1)), 6);
    expect(events.filter((e) => e.kind === "solar")).toHaveLength(0);
  });
});
