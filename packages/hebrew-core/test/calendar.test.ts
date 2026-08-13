import { HDate, months } from "@hebcal/core";
import { describe, expect, it } from "vitest";
import { civilToHebrewDateParts, hebrewMonthStartCivil } from "../src";
import { gregorianToRd } from "../src/calendar";

describe("civilToHebrewDateParts (daytime mapping)", () => {
  it("matches hebcal's documented example (2008-11-13 → 15 Cheshvan 5769)", () => {
    expect(civilToHebrewDateParts({ year: 2008, month: 11, day: 13 })).toEqual({
      year: 5769,
      month: months.CHESHVAN,
      day: 15,
      monthKey: "cheshvan",
      monthName: "Cheshvan",
      weekday: 4,
      renderGematriya: "ט״ו חֶשְׁוָן תשס״ט",
    });
  });

  it("never sunset-adjusts: agrees with the raw civil HDate for a year of days", () => {
    for (let offset = 0; offset < 366; offset++) {
      const rd = gregorianToRd(2026, 1, 1) + offset;
      const hd = new HDate(rd);
      const g = hd.greg();
      const parts = civilToHebrewDateParts({
        year: g.getFullYear(),
        month: g.getMonth() + 1,
        day: g.getDate(),
      });
      expect([parts.year, parts.month, parts.day]).toEqual([
        hd.getFullYear(),
        hd.getMonth(),
        hd.getDate(),
      ]);
    }
  });

  it("distinguishes Adar I and Adar II in a leap year but collapses monthKey", () => {
    // 5784 is a Hebrew leap year; Purim (14 Adar II) fell on 2024-03-24.
    const adar2 = civilToHebrewDateParts({ year: 2024, month: 3, day: 24 });
    expect(adar2.year).toBe(5784);
    expect(adar2.day).toBe(14);
    expect(adar2.month).toBe(months.ADAR_II);
    expect(adar2.monthKey).toBe("adar");

    const adar1 = civilToHebrewDateParts({ year: 2024, month: 2, day: 25 });
    expect(adar1.month).toBe(months.ADAR_I);
    expect(adar1.monthKey).toBe("adar");
  });
});

describe("hebrewMonthStartCivil", () => {
  it("returns the civil date of Hebrew day 1 (15 Cheshvan 5769 → 1 Cheshvan = 2008-10-30)", () => {
    expect(hebrewMonthStartCivil({ year: 2008, month: 11, day: 13 })).toEqual({
      year: 2008,
      month: 10,
      day: 30,
    });
  });

  it("keeps Adar I and Adar II as separate months (mid-Adar II date → 1 Adar II, not 1 Adar I)", () => {
    const start = hebrewMonthStartCivil({ year: 2024, month: 3, day: 24 });
    const parts = civilToHebrewDateParts(start);
    expect(parts.day).toBe(1);
    expect(parts.month).toBe(months.ADAR_II);
    expect(start).toEqual({ year: 2024, month: 3, day: 11 });
  });

  it("round-trips: the start maps to day 1 of the same Hebrew month/year across boundaries", () => {
    // Walk ~3 Hebrew months of civil days, incl. 29/30-day month boundaries.
    for (let offset = 0; offset < 90; offset++) {
      const rd = gregorianToRd(2026, 8, 1) + offset;
      const g = new HDate(rd).greg();
      const civil = {
        year: g.getFullYear(),
        month: g.getMonth() + 1,
        day: g.getDate(),
      };
      const containing = civilToHebrewDateParts(civil);
      const startParts = civilToHebrewDateParts(hebrewMonthStartCivil(civil));
      expect(startParts.day).toBe(1);
      expect(startParts.month).toBe(containing.month);
      expect(startParts.year).toBe(containing.year);
    }
  });
});
