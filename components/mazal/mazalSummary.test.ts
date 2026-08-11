import { buildMazalChart } from "@astralsync/hebrew-core";
import { gematriaExpression, hebrewDateGematria } from "@astralsync/numero-core";
import { describe, expect, it } from "vitest";
import type { StoredHebrewGematria, StoredMazal } from "@/lib/view-types";
import { buildMazalSummary } from "./mazalSummary";

/**
 * Panel render states as pure values (the component itself is markup only):
 * full chart, after-sunset flip with both candidate dates, unknown-time
 * suppression, and the polar fallback.
 */

const NYC = { latitude: 40.7128, longitude: -74.006, tzId: "America/New_York" };

function fixture(
  overrides: Partial<Parameters<typeof buildMazalChart>[0]> = {},
): { mazal: StoredMazal; gematria: StoredHebrewGematria } {
  const mazal = buildMazalChart({
    civilDate: { year: 2000, month: 1, day: 1 },
    utc: new Date(Date.UTC(2000, 0, 1, 23, 30, 0)), // 18:30 EST, after sunset
    ...NYC,
    ...overrides,
  }) as StoredMazal;
  return {
    mazal,
    gematria: {
      dateGematria: hebrewDateGematria({
        day: mazal.hebrewDate.effective.day,
        year: mazal.hebrewDate.effective.year,
      }),
      katanName: gematriaExpression("דוד כהן", "katan"),
    },
  };
}

describe("buildMazalSummary render states", () => {
  it("renders the full summary for an exact evening birth", () => {
    const { mazal, gematria } = fixture();
    const s = buildMazalSummary(mazal, gematria);
    expect(s.dateDisplay).toBe(mazal.hebrewDate.effective.renderGematriya);
    expect(s.monthLabel).toBe("Gedi — Tevet");
    expect(s.sign).toBe("capricorn");
    expect(s.dayPlanetLabel).toBe("Sun — Sunday");
    expect(s.hourLabel).toBe("Moon — night hour 2 of 12");
    expect(s.seferLabel).toBe("ע (Ayin) · Tribe of Dan · Anger");
    expect(s.dateGematria).toEqual({ value: 6, isMaster: false });
    expect(s.chips).toEqual([]);
  });

  it("shows both candidate dates on an after-sunset flip", () => {
    const { mazal, gematria } = fixture();
    const s = buildMazalSummary(mazal, gematria);
    expect(s.afterSunset).toBe(true);
    expect(s.alternateDate).toBe(mazal.hebrewDate.civil.renderGematriya);
    expect(s.alternateDate).not.toBe(s.dateDisplay);
  });

  it("suppresses the hour and chips the uncertain fields for unknown time", () => {
    const { mazal, gematria } = fixture({
      utc: new Date(Date.UTC(2000, 0, 1, 17, 0, 0)),
      timeCertainty: "unknown",
    });
    const s = buildMazalSummary(mazal, gematria);
    expect(s.hourPlanet).toBeNull();
    expect(s.hourLabel).toBeNull();
    expect(s.afterSunset).toBe(false);
    expect(s.alternateDate).toBeNull();
    const fields = s.chips.map((c) => c.field);
    expect(fields).toContain("hebrew_date");
    expect(fields).toContain("day_planet");
    expect(fields).toContain("planetary_hour");
    for (const chip of s.chips) expect(chip.reason).toBeTruthy();
  });

  it("marks a master date number", () => {
    const { mazal } = fixture();
    const s = buildMazalSummary(mazal, {
      dateGematria: hebrewDateGematria({ day: 3, year: 5768 }), // 3 + 8 = 11
      katanName: null,
    });
    expect(s.dateGematria).toEqual({ value: 11, isMaster: true });
  });

  it("falls back gracefully at polar latitudes", () => {
    const { mazal, gematria } = fixture({
      civilDate: { year: 2020, month: 6, day: 21 },
      utc: new Date(Date.UTC(2020, 5, 21, 10, 0, 0)),
      latitude: 78.22,
      longitude: 15.64,
      tzId: "Arctic/Longyearbyen",
    });
    const s = buildMazalSummary(mazal, gematria);
    expect(s.hourLabel).toBeNull();
    expect(s.chips.map((c) => c.field)).toContain("planetary_hour");
  });
});
