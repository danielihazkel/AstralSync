import { describe, expect, it } from "vitest";
import { buildChart, separation } from "../src";

/**
 * Golden chart tests (PRD §8).
 *
 * Current fixtures assert against astronomically exact events (equinox,
 * solstice, J2000 epoch) at tight tolerance, and one well-documented
 * historical chart at degree tolerance. Full arcminute validation against
 * Swiss Ephemeris reference output for 10–15 charts is still TODO.
 */

function lonOf(chart: ReturnType<typeof buildChart>, planet: string): number {
  return chart.placements.find((p) => p.planet === planet)!.longitude;
}

describe("golden charts", () => {
  it("Sun is at 0° Aries at the March 2020 equinox", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2020, 2, 20, 3, 49, 36)),
      latitude: 0,
      longitude: 0,
    });
    expect(separation(lonOf(chart, "sun"), 0)).toBeLessThan(0.05);
    expect(chart.bigThree.sun === "aries" || chart.bigThree.sun === "pisces").toBe(true);
  });

  it("Sun is at 0° Cancer at the June 2020 solstice", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2020, 5, 20, 21, 43, 40)),
      latitude: 0,
      longitude: 0,
    });
    expect(separation(lonOf(chart, "sun"), 90)).toBeLessThan(0.05);
  });

  it("Sun longitude at the J2000 epoch matches the published value (~280.46°)", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
      latitude: 51.48,
      longitude: 0,
    });
    const sun = lonOf(chart, "sun");
    expect(sun).toBeGreaterThan(280.0);
    expect(sun).toBeLessThan(281.0);
    expect(chart.bigThree.sun).toBe("capricorn");
  });

  it("Albert Einstein (1879-03-14 11:30 LMT, Ulm): Sun, Moon, Ascendant", () => {
    // 11:30 LMT at 10°E ≈ 10:50 UT. Astro-Databank (Rodden AA):
    // Sun 23°30' Pisces, Moon 14°32' Sagittarius, Asc 11°38' Cancer.
    const chart = buildChart({
      utc: new Date(Date.UTC(1879, 2, 14, 10, 50, 0)),
      latitude: 48.4,
      longitude: 10.0,
      houseSystem: "placidus",
    });
    expect(chart.bigThree.sun).toBe("pisces");
    expect(separation(lonOf(chart, "sun"), 330 + 23.5)).toBeLessThan(1.0);

    expect(chart.bigThree.moon).toBe("sagittarius");
    expect(separation(lonOf(chart, "moon"), 240 + 14.53)).toBeLessThan(1.0);

    expect(chart.bigThree.ascendant).toBe("cancer");
    expect(separation(chart.houses!.ascendant, 90 + 11.63)).toBeLessThan(1.5);
  });
});

describe("retrograde detection", () => {
  it("flags Mercury retrograde on 2023-05-01 (Apr 21 – May 14 station)", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2023, 4, 1, 0, 0, 0)),
      latitude: 0,
      longitude: 0,
    });
    expect(chart.placements.find((p) => p.planet === "mercury")!.retrograde).toBe(true);
  });

  it("does not flag Mercury direct on 2023-03-01", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2023, 2, 1, 0, 0, 0)),
      latitude: 0,
      longitude: 0,
    });
    expect(chart.placements.find((p) => p.planet === "mercury")!.retrograde).toBe(false);
  });

  it("never flags the Sun or Moon retrograde", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2023, 4, 1, 0, 0, 0)),
      latitude: 0,
      longitude: 0,
    });
    expect(chart.placements.find((p) => p.planet === "sun")!.retrograde).toBe(false);
    expect(chart.placements.find((p) => p.planet === "moon")!.retrograde).toBe(false);
  });
});
