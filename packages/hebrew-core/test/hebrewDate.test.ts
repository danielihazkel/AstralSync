import { HDate, months } from "@hebcal/core";
import { describe, expect, it } from "vitest";
import { hebrewBirthDate, type MazalInput } from "../src";
import { gregorianToRd, hdateFromCivil } from "../src/calendar";

const NYC = {
  latitude: 40.7128,
  longitude: -74.006,
  tzId: "America/New_York",
};

function input(overrides: Partial<MazalInput> & Pick<MazalInput, "civilDate" | "utc">): MazalInput {
  return { ...NYC, ...overrides };
}

describe("sunset-aware Hebrew birth date (Phase 2a)", () => {
  it("matches hebcal's documented example (2008-11-13 → 15 Cheshvan 5769)", () => {
    const r = hebrewBirthDate(
      input({
        civilDate: { year: 2008, month: 11, day: 13 },
        utc: new Date(Date.UTC(2008, 10, 13, 17, 0, 0)), // noon EST, daytime
      }),
    );
    expect(r.civil).toEqual({
      year: 5769,
      month: months.CHESHVAN,
      day: 15,
      monthKey: "cheshvan",
      monthName: "Cheshvan",
      weekday: 4, // Thursday
      renderGematriya: "ט״ו חֶשְׁוָן תשס״ט",
    });
    expect(r.effective).toEqual(r.civil);
    expect(r.afterSunset).toBe(false);
    expect(r.ambiguity).toBeNull();
  });

  it("keeps the civil mapping for a daytime birth (2000-01-01 noon → 23 Tevet 5760)", () => {
    const r = hebrewBirthDate(
      input({
        civilDate: { year: 2000, month: 1, day: 1 },
        utc: new Date(Date.UTC(2000, 0, 1, 17, 0, 0)), // noon EST
      }),
    );
    expect(r.civil.day).toBe(23);
    expect(r.civil.monthKey).toBe("tevet");
    expect(r.civil.year).toBe(5760);
    expect(r.civil.weekday).toBe(6); // Saturday
    expect(r.afterSunset).toBe(false);
    expect(r.effective).toEqual(r.civil);
    expect(r.sunsetUtc).toBe("2000-01-01T21:39:45.000Z");
    expect(r.ambiguity).toBeNull();
  });

  it("flips to the next Hebrew day for a birth after sunset (18:30 EST → 24 Tevet)", () => {
    const r = hebrewBirthDate(
      input({
        civilDate: { year: 2000, month: 1, day: 1 },
        utc: new Date(Date.UTC(2000, 0, 1, 23, 30, 0)), // 18:30 EST, sunset was 16:39
      }),
    );
    expect(r.afterSunset).toBe(true);
    expect(r.civil.day).toBe(23);
    expect(r.effective.day).toBe(24);
    expect(r.effective.monthKey).toBe("tevet");
    expect(r.effective.weekday).toBe(0); // Saturday → Sunday
    expect(r.ambiguity).toBeNull();
  });

  it("flags an approximate time near sunset without suppressing the flip decision", () => {
    const r = hebrewBirthDate(
      input({
        civilDate: { year: 2000, month: 1, day: 1 },
        utc: new Date(Date.UTC(2000, 0, 1, 21, 30, 0)), // ~10 min before sunset
        timeCertainty: "approx",
      }),
    );
    expect(r.ambiguity).toBe("approx_time_near_sunset");
    expect(r.afterSunset).toBe(false);
    expect(r.effective.day).toBe(23);
  });

  it("does not flag an approximate time far from sunset", () => {
    const r = hebrewBirthDate(
      input({
        civilDate: { year: 2000, month: 1, day: 1 },
        utc: new Date(Date.UTC(2000, 0, 1, 17, 0, 0)), // noon, ~4.7h before sunset
        timeCertainty: "approx",
      }),
    );
    expect(r.ambiguity).toBeNull();
  });

  it("assumes daytime for unknown time but still reports the sunset", () => {
    const r = hebrewBirthDate(
      input({
        civilDate: { year: 2000, month: 1, day: 1 },
        utc: new Date(Date.UTC(2000, 0, 1, 17, 0, 0)), // local-noon convention
        timeCertainty: "unknown",
      }),
    );
    expect(r.ambiguity).toBe("unknown_time");
    expect(r.afterSunset).toBe(false);
    expect(r.effective).toEqual(r.civil);
    expect(r.sunsetUtc).toBe("2000-01-01T21:39:45.000Z");
  });

  it("handles leap-year Adar I and Adar II with the collapsed adar key", () => {
    const adar2 = hebrewBirthDate(
      input({
        civilDate: { year: 2019, month: 3, day: 21 },
        utc: new Date(Date.UTC(2019, 2, 21, 16, 0, 0)),
      }),
    );
    expect(adar2.civil.year).toBe(5779);
    expect(adar2.civil.day).toBe(14);
    expect(adar2.civil.month).toBe(months.ADAR_II); // 13
    expect(adar2.civil.monthName).toBe("Adar II");
    expect(adar2.civil.monthKey).toBe("adar");

    const adar1 = hebrewBirthDate(
      input({
        civilDate: { year: 2019, month: 2, day: 19 },
        utc: new Date(Date.UTC(2019, 1, 19, 17, 0, 0)),
      }),
    );
    expect(adar1.civil.day).toBe(14);
    expect(adar1.civil.month).toBe(months.ADAR_I); // 12
    expect(adar1.civil.monthName).toBe("Adar I");
    expect(adar1.civil.monthKey).toBe("adar");

    // Round trip through hebcal's own Hebrew-date constructor.
    expect(new HDate(14, months.ADAR_II, 5779).abs()).toBe(
      gregorianToRd(2019, 3, 21),
    );
  });

  it("falls back gracefully when no sunset exists (polar midnight sun)", () => {
    const r = hebrewBirthDate({
      civilDate: { year: 2020, month: 6, day: 21 },
      utc: new Date(Date.UTC(2020, 5, 21, 10, 0, 0)),
      latitude: 78.22,
      longitude: 15.64,
      tzId: "Arctic/Longyearbyen",
    });
    expect(r.ambiguity).toBe("no_sunset_polar");
    expect(r.sunsetUtc).toBeNull();
    expect(r.afterSunset).toBe(false);
    expect(r.effective).toEqual(r.civil);
  });

  it("builds HDates from explicit y/m/d identically to hebcal's Date path (RD guard)", () => {
    const viaCivil = hdateFromCivil({ year: 2008, month: 11, day: 13 });
    const viaDate = new HDate(new Date(2008, 10, 13));
    expect(viaCivil.abs()).toBe(viaDate.abs());
    expect(viaCivil.toString()).toBe(viaDate.toString());
  });
});
