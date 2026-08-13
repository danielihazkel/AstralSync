import { describe, expect, it } from "vitest";
import { buildChart, isDayChart, partOfFortune, partOfFortunePlacement } from "../src";

describe("partOfFortune", () => {
  it("day formula: Asc + Moon − Sun", () => {
    expect(partOfFortune(100, 40, 100, true)).toBeCloseTo(160, 10);
  });

  it("night formula reverses the luminaries", () => {
    expect(partOfFortune(100, 40, 100, false)).toBeCloseTo(40, 10);
  });

  it("wraps into [0, 360)", () => {
    const lon = partOfFortune(350, 10, 40, true);
    expect(lon).toBeGreaterThanOrEqual(0);
    expect(lon).toBeLessThan(360);
    expect(lon).toBeCloseTo(20, 10);
  });

  it("degenerates to the Ascendant at a New Moon (either sect)", () => {
    expect(partOfFortune(123.4, 77, 77, true)).toBeCloseTo(123.4, 10);
    expect(partOfFortune(123.4, 77, 77, false)).toBeCloseTo(123.4, 10);
  });
});

describe("isDayChart", () => {
  it("matches the Sun's house side of the horizon on a real chart", () => {
    // Noon in Greenwich: the Sun rides high — houses 7–12 — a day chart.
    const noon = buildChart({
      utc: new Date(Date.UTC(2000, 5, 21, 12, 0, 0)),
      latitude: 51.48,
      longitude: 0,
      timeCertainty: "exact",
    });
    const noonSun = noon.placements.find((p) => p.planet === "sun")!;
    expect(isDayChart(noonSun.longitude, noon.houses!.cusps)).toBe(true);
    expect([7, 8, 9, 10, 11, 12]).toContain(noonSun.house);

    // Midnight: the Sun is below the horizon — a night chart.
    const midnight = buildChart({
      utc: new Date(Date.UTC(2000, 5, 21, 0, 0, 0)),
      latitude: 51.48,
      longitude: 0,
      timeCertainty: "exact",
    });
    const midnightSun = midnight.placements.find((p) => p.planet === "sun")!;
    expect(isDayChart(midnightSun.longitude, midnight.houses!.cusps)).toBe(false);
  });
});

describe("partOfFortunePlacement", () => {
  it("builds a full point placement consistent with the raw formula", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(1990, 2, 4, 10, 30, 0)),
      latitude: 51.48,
      longitude: 0,
      timeCertainty: "exact",
    });
    const sun = chart.placements.find((p) => p.planet === "sun")!;
    const moon = chart.placements.find((p) => p.planet === "moon")!;
    const cusps = chart.houses!.cusps;
    const placement = partOfFortunePlacement(
      chart.houses!.ascendant,
      sun.longitude,
      moon.longitude,
      cusps,
    );
    expect(placement.point).toBe("part_of_fortune");
    expect(placement.longitude).toBeCloseTo(
      partOfFortune(
        chart.houses!.ascendant,
        sun.longitude,
        moon.longitude,
        isDayChart(sun.longitude, cusps),
      ),
      10,
    );
    expect(placement.degreeInSign).toBeGreaterThanOrEqual(0);
    expect(placement.degreeInSign).toBeLessThan(30);
    expect(placement.retrograde).toBe(false);
    expect(placement.house).toBeNull();
  });
});
