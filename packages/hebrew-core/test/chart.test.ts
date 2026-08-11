import { describe, expect, it } from "vitest";
import { buildMazalChart, type MazalInput } from "../src";

const NYC = {
  latitude: 40.7128,
  longitude: -74.006,
  tzId: "America/New_York",
};

function input(overrides: Partial<MazalInput> & Pick<MazalInput, "civilDate" | "utc">): MazalInput {
  return { ...NYC, ...overrides };
}

describe("buildMazalChart (Phase 2a)", () => {
  it("composes a complete chart for an exact evening birth", () => {
    const chart = buildMazalChart(
      input({
        civilDate: { year: 2000, month: 1, day: 1 },
        utc: new Date(Date.UTC(2000, 0, 1, 23, 30, 0)), // 18:30 EST, after sunset
      }),
    );
    expect(chart.schemaVersion).toBe(1);
    expect(chart.input).toEqual({
      civilDate: { year: 2000, month: 1, day: 1 },
      utc: "2000-01-01T23:30:00.000Z",
      latitude: NYC.latitude,
      longitude: NYC.longitude,
      tzId: NYC.tzId,
      timeCertainty: "exact",
    });
    // Effective date is 24 Tevet 5760 (Sunday) — everything keys off it.
    expect(chart.hebrewDate.afterSunset).toBe(true);
    expect(chart.mazal).toMatchObject({ month: "tevet", mazal: "gedi", sign: "capricorn" });
    expect(chart.seferYetzirah).toMatchObject({ month: "tevet", letter: "ע", tribe: "dan" });
    expect(chart.dayPlanet).toEqual({ weekday: 0, planet: "sun", ambiguous: false });
    expect(chart.planetaryHour).not.toBeNull();
    expect(chart.planetaryHour?.isDay).toBe(false);
    expect(chart.uncertainties).toEqual([]);
    expect(chart.engine.name).toBe("@hebcal/core");
    expect(chart.engine.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("suppresses the hour and flags date-derived fields for unknown time", () => {
    const chart = buildMazalChart(
      input({
        civilDate: { year: 2000, month: 1, day: 1 },
        utc: new Date(Date.UTC(2000, 0, 1, 17, 0, 0)), // local-noon convention
        timeCertainty: "unknown",
      }),
    );
    expect(chart.planetaryHour).toBeNull();
    expect(chart.dayPlanet.ambiguous).toBe(true);
    const fields = chart.uncertainties.map((u) => u.field);
    expect(fields).toContain("hebrew_date");
    expect(fields).toContain("day_planet");
    expect(fields).toContain("planetary_hour");
    // Mid-month: a one-day shift cannot change the mazal.
    expect(fields).not.toContain("mazal");
  });

  it("flags the mazal only on a Hebrew month boundary", () => {
    // 2000-09-29 is 29 Elul 5760; the next day is 1 Tishrei 5761.
    const chart = buildMazalChart(
      input({
        civilDate: { year: 2000, month: 9, day: 29 },
        utc: new Date(Date.UTC(2000, 8, 29, 16, 0, 0)),
        timeCertainty: "unknown",
      }),
    );
    expect(chart.hebrewDate.civil.monthKey).toBe("elul");
    expect(chart.uncertainties.map((u) => u.field)).toContain("mazal");
  });

  it("flags the planetary hour as uncertain for approximate time without suppressing it", () => {
    const chart = buildMazalChart(
      input({
        civilDate: { year: 2000, month: 1, day: 1 },
        utc: new Date(Date.UTC(2000, 0, 1, 17, 0, 0)),
        timeCertainty: "approx",
      }),
    );
    expect(chart.planetaryHour?.uncertain).toBe(true);
    expect(chart.uncertainties.map((u) => u.field)).toContain("planetary_hour");
    // Noon is far from sunset, so the date itself is not ambiguous.
    expect(chart.uncertainties.map((u) => u.field)).not.toContain("hebrew_date");
  });

  it("reports the polar fallback on both the date and the hour", () => {
    const chart = buildMazalChart({
      civilDate: { year: 2020, month: 6, day: 21 },
      utc: new Date(Date.UTC(2020, 5, 21, 10, 0, 0)),
      latitude: 78.22,
      longitude: 15.64,
      tzId: "Arctic/Longyearbyen",
    });
    expect(chart.hebrewDate.ambiguity).toBe("no_sunset_polar");
    expect(chart.planetaryHour).toBeNull();
    const fields = chart.uncertainties.map((u) => u.field);
    expect(fields).toContain("hebrew_date");
    expect(fields).toContain("planetary_hour");
  });
});
