import { buildChart } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import {
  addDays,
  computeHebrewPeriodSummary,
  computeWesternPeriodSummary,
  formatCivil,
  periodFor,
  type ForecastPeriod,
} from "./forecast";
import type { WheelChart } from "./view-types";

// Deterministic noon regardless of the test machine's timezone.
const noonUtc = (d: { year: number; month: number; day: number }) =>
  new Date(Date.UTC(d.year, d.month - 1, d.day, 12));

function natalChart(overrides?: {
  timeCertainty?: "exact" | "approx" | "unknown";
}): WheelChart {
  const chart = buildChart({
    utc: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
    latitude: 51.48,
    longitude: 0,
    timeCertainty: overrides?.timeCertainty ?? "exact",
  });
  return { ...chart, tzWarnings: [] };
}

describe("periodFor", () => {
  it("day: start == end == today", () => {
    const p = periodFor("day", "western", { year: 2026, month: 8, day: 13 });
    expect(p).toEqual({
      kind: "day",
      start: { year: 2026, month: 8, day: 13 },
      end: { year: 2026, month: 8, day: 13 },
      days: 1,
    });
  });

  it("week: snaps to the preceding Sunday for both modes", () => {
    // 2026-08-13 is a Thursday; its week began Sunday 2026-08-09.
    for (const mode of ["western", "hebrew"] as const) {
      const p = periodFor("week", mode, { year: 2026, month: 8, day: 13 });
      expect(p.start).toEqual({ year: 2026, month: 8, day: 9 });
      expect(p.end).toEqual({ year: 2026, month: 8, day: 15 });
      expect(p.days).toBe(7);
    }
  });

  it("week: a Sunday starts its own week", () => {
    const p = periodFor("week", "western", { year: 2026, month: 8, day: 9 });
    expect(p.start).toEqual({ year: 2026, month: 8, day: 9 });
  });

  it("week: crosses civil month boundaries", () => {
    // 2026-09-01 is a Tuesday; week began Sunday 2026-08-30.
    const p = periodFor("week", "western", { year: 2026, month: 9, day: 1 });
    expect(p.start).toEqual({ year: 2026, month: 8, day: 30 });
    expect(p.end).toEqual({ year: 2026, month: 9, day: 5 });
  });

  it("month (western): full civil month incl. leap February", () => {
    const p = periodFor("month", "western", { year: 2026, month: 8, day: 13 });
    expect(p.start).toEqual({ year: 2026, month: 8, day: 1 });
    expect(p.end).toEqual({ year: 2026, month: 8, day: 31 });
    expect(p.days).toBe(31);
    const feb = periodFor("month", "western", { year: 2028, month: 2, day: 10 });
    expect(feb.end.day).toBe(29);
  });

  it("month (hebrew): starts on Hebrew day 1 and spans 29 or 30 days", () => {
    const p = periodFor("month", "hebrew", { year: 2026, month: 8, day: 13 });
    const summary = computeHebrewPeriodSummary(p);
    expect(summary.days[0].hebrew.day).toBe(1);
    expect([29, 30]).toContain(p.days);
    expect(summary.months).toHaveLength(1);
    // The day after the period is Hebrew day 1 of the next month.
    const next = computeHebrewPeriodSummary(
      periodFor("day", "hebrew", addDays(p.end, 1)),
    );
    expect(next.days[0].hebrew.day).toBe(1);
  });
});

describe("computeWesternPeriodSummary", () => {
  const week: ForecastPeriod = periodFor("week", "western", {
    year: 2026,
    month: 8,
    day: 13,
  });

  it("day kind: single day, houses overlaid, aspects within transit orbs", () => {
    const p = periodFor("day", "western", { year: 2026, month: 8, day: 13 });
    const s = computeWesternPeriodSummary(natalChart(), 3, p, noonUtc);
    expect(s.natal).toEqual({
      version: 3,
      isSolarChart: false,
      moonUncertain: false,
    });
    expect(s.moonBySign).toHaveLength(1);
    expect(s.events).toHaveLength(0);
    for (const pl of s.startPlacements) {
      expect(pl.house).toBeGreaterThanOrEqual(1);
      expect(pl.house).toBeLessThanOrEqual(12);
    }
    for (const w of s.topAspects) {
      const limit =
        w.a === "sun" || w.a === "moon" || w.b === "sun" || w.b === "moon"
          ? 3
          : 2;
      expect(w.minOrb).toBeLessThanOrEqual(limit);
    }
  });

  it("week kind: contiguous Moon spans covering the whole period", () => {
    const s = computeWesternPeriodSummary(natalChart(), 1, week, noonUtc);
    expect(s.moonBySign.length).toBeGreaterThanOrEqual(2); // Moon ~2.5 days/sign
    expect(s.moonBySign[0].fromDate).toEqual(week.start);
    expect(s.moonBySign[s.moonBySign.length - 1].toDate).toEqual(week.end);
    for (let i = 1; i < s.moonBySign.length; i++) {
      expect(s.moonBySign[i].fromDate).toEqual(
        addDays(s.moonBySign[i - 1].toDate, 1),
      );
    }
    expect(s.moonNext).toBeNull(); // only for kind=day
  });

  it("week/month kinds exclude transiting-Moon aspect windows and cap the list", () => {
    const s = computeWesternPeriodSummary(natalChart(), 1, week, noonUtc);
    for (const w of s.topAspects) expect(w.a).not.toBe("moon");
    const nonOuter = s.topAspects.filter(
      (w) => !["jupiter", "saturn", "uranus", "neptune", "pluto"].includes(w.a),
    );
    expect(nonOuter.length).toBeLessThanOrEqual(8);
  });

  it("month kind: detects the Sun's ingress (one happens every civil month)", () => {
    const p = periodFor("month", "western", { year: 2026, month: 8, day: 13 });
    const s = computeWesternPeriodSummary(natalChart(), 1, p, noonUtc);
    const sunIngress = s.events.filter(
      (e) => e.type === "ingress" && e.planet === "sun",
    );
    expect(sunIngress).toHaveLength(1);
    expect(s.events.every((e) => !(e.type === "ingress" && e.planet === "moon"))).toBe(
      true,
    );
  });

  it("detects at least one station across a year of monthly summaries", () => {
    let stations = 0;
    for (let m = 1; m <= 12; m++) {
      const p = periodFor("month", "western", { year: 2026, month: m, day: 5 });
      const s = computeWesternPeriodSummary(natalChart(), 1, p, noonUtc);
      stations += s.events.filter((e) => e.type === "station").length;
    }
    expect(stations).toBeGreaterThanOrEqual(2); // Mercury alone stations ~6×/year
  });

  it("kind=day reports the Moon's next sign only when it changes", () => {
    // Across any 4 consecutive days the Moon must change sign at least once
    // (max ~2.5 days per sign), so moonNext is non-null on at least one day.
    let seen = 0;
    for (let day = 10; day <= 13; day++) {
      const p = periodFor("day", "western", { year: 2026, month: 8, day });
      const s = computeWesternPeriodSummary(natalChart(), 1, p, noonUtc);
      if (s.moonNext) {
        seen++;
        expect(s.moonNext.sign).not.toBe(s.moonBySign[0].sign);
        expect(s.moonNext.date).toEqual(addDays(p.end, 1));
      }
    }
    expect(seen).toBeGreaterThanOrEqual(1);
  });

  it("solar natal: no house overlay; moon uncertainty propagates", () => {
    const p = periodFor("day", "western", { year: 2026, month: 8, day: 13 });
    const s = computeWesternPeriodSummary(
      natalChart({ timeCertainty: "unknown" }),
      1,
      p,
      noonUtc,
    );
    expect(s.natal.isSolarChart).toBe(true);
    for (const pl of s.startPlacements) expect(pl.house).toBeNull();

    const natal = natalChart();
    const uncertain: WheelChart = {
      ...natal,
      uncertainties: [
        ...natal.uncertainties,
        { field: "moon_sign", reason: "test" },
      ],
    };
    expect(
      computeWesternPeriodSummary(uncertain, 1, p, noonUtc).natal.moonUncertain,
    ).toBe(true);
  });
});

describe("computeHebrewPeriodSummary", () => {
  it("week: 7 days, day planets follow the Sunday-first cycle", () => {
    const p = periodFor("week", "hebrew", { year: 2026, month: 8, day: 13 });
    const s = computeHebrewPeriodSummary(p);
    expect(s.days).toHaveLength(7);
    expect(s.days.map((d) => d.dayPlanet)).toEqual([
      "sun",
      "moon",
      "mars",
      "mercury",
      "jupiter",
      "venus",
      "saturn",
    ]);
    for (const d of s.days) {
      expect(d.dateGematria.value).toBeGreaterThanOrEqual(1);
      expect(d.hebrew.renderGematriya).toBeTruthy();
    }
  });

  it("splits months when a Hebrew month boundary falls mid-period", () => {
    // Find a week containing a Hebrew month boundary by scanning from a month
    // start backwards to the enclosing week.
    const monthStart = periodFor("month", "hebrew", {
      year: 2026,
      month: 8,
      day: 13,
    }).start;
    const week = periodFor("week", "hebrew", monthStart);
    const s = computeHebrewPeriodSummary(week);
    if (s.days[0].hebrew.day === 1) {
      // Boundary fell exactly on Sunday — single month, still valid.
      expect(s.months).toHaveLength(1);
    } else {
      expect(s.months).toHaveLength(2);
      expect(formatCivil(s.months[0].toCivil)).toBe(
        formatCivil(addDays(s.months[1].fromCivil, -1)),
      );
      expect(s.months[0].monthName).not.toBe(s.months[1].monthName);
    }
    // Spans tile the period exactly.
    expect(s.months[0].fromCivil).toEqual(week.start);
    expect(s.months[s.months.length - 1].toCivil).toEqual(week.end);
  });

  it("keeps Adar I and Adar II separate but both map to the adar mazal", () => {
    // 5784: 30 Adar I = 2024-03-10, 1 Adar II = 2024-03-11.
    const p: ForecastPeriod = {
      kind: "week",
      start: { year: 2024, month: 3, day: 10 },
      end: { year: 2024, month: 3, day: 16 },
      days: 7,
    };
    const s = computeHebrewPeriodSummary(p);
    expect(s.months).toHaveLength(2);
    expect(s.months[0].monthName).toBe("Adar I");
    expect(s.months[1].monthName).toBe("Adar II");
    expect(s.months[0].mazal.sign).toBe("pisces");
    expect(s.months[1].mazal.sign).toBe("pisces");
    expect(s.months[0].monthKey).toBe("adar");
  });
});
