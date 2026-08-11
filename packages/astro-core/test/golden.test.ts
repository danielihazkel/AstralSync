import { describe, expect, it } from "vitest";
import { buildChart, positionsAt, separation } from "../src";

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

describe("positions at an instant", () => {
  it("matches the equinox Sun and carries no houses", () => {
    const utc = new Date(Date.UTC(2020, 2, 20, 3, 49, 36));
    const positions = positionsAt(utc);
    const sun = positions.find((p) => p.planet === "sun")!;
    expect(separation(sun.longitude, 0)).toBeLessThan(0.05);
    for (const p of positions) {
      expect(p.house).toBeNull();
      expect(p.degreeInSign).toBeGreaterThanOrEqual(0);
      expect(p.degreeInSign).toBeLessThan(30);
    }
  });

  it("matches the J2000 Sun longitude (~280.46°)", () => {
    const positions = positionsAt(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)));
    const sun = positions.find((p) => p.planet === "sun")!;
    expect(sun.longitude).toBeGreaterThan(280.0);
    expect(sun.longitude).toBeLessThan(281.0);
    expect(sun.sign).toBe("capricorn");
  });

  it("agrees exactly with buildChart placements at the same instant", () => {
    const utc = new Date(Date.UTC(2023, 4, 1, 0, 0, 0));
    const positions = positionsAt(utc);
    const chart = buildChart({ utc, latitude: 0, longitude: 0 });
    for (const p of positions) {
      const cp = chart.placements.find((c) => c.planet === p.planet)!;
      expect(p.longitude).toBe(cp.longitude);
      expect(p.retrograde).toBe(cp.retrograde);
    }
  });

  it("flags Mercury retrograde at the 2023 station windows, never the luminaries", () => {
    const rx = positionsAt(new Date(Date.UTC(2023, 4, 1, 0, 0, 0)));
    expect(rx.find((p) => p.planet === "mercury")!.retrograde).toBe(true);
    expect(rx.find((p) => p.planet === "sun")!.retrograde).toBe(false);
    expect(rx.find((p) => p.planet === "moon")!.retrograde).toBe(false);

    const direct = positionsAt(new Date(Date.UTC(2023, 2, 1, 0, 0, 0)));
    expect(direct.find((p) => p.planet === "mercury")!.retrograde).toBe(false);
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
