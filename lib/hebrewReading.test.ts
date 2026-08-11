import { buildMazalChart } from "@astralsync/hebrew-core";
import { gematriaExpression, hebrewDateGematria } from "@astralsync/numero-core";
import { describe, expect, it } from "vitest";
import { resolveHebrewReading } from "./hebrewReading";
import type { StoredHebrewGematria, StoredMazal } from "./view-types";
import { CONTENT_VERSION } from "./versions";

/**
 * Fixtures mirror lib/snapshots.ts computeHebrew: mazal chart from
 * hebrew-core, date gematria keyed to the effective date, katan name
 * reading for Hebrew names. NYC 2000-01-01 23:30Z is after sunset →
 * effective 24 Tevet 5760, a Sunday.
 */

function fixtures(overrides: { timeCertainty?: "exact" | "approx" | "unknown"; hebrewName?: boolean } = {}) {
  const mazal = buildMazalChart({
    civilDate: { year: 2000, month: 1, day: 1 },
    utc: new Date(Date.UTC(2000, 0, 1, overrides.timeCertainty === "unknown" ? 17 : 23, 30, 0)),
    latitude: 40.7128,
    longitude: -74.006,
    tzId: "America/New_York",
    timeCertainty: overrides.timeCertainty ?? "exact",
  }) as StoredMazal;
  const gematria: StoredHebrewGematria = {
    dateGematria: hebrewDateGematria({
      day: mazal.hebrewDate.effective.day,
      year: mazal.hebrewDate.effective.year,
    }),
    katanName:
      overrides.hebrewName === false ? null : gematriaExpression("דוד כהן", "katan"),
  };
  return { mazal, gematria };
}

describe("resolveHebrewReading", () => {
  it("composes all seven slots for an exact evening birth with a Hebrew name", () => {
    const { mazal, gematria } = fixtures();
    const r = resolveHebrewReading(mazal, gematria, CONTENT_VERSION);
    expect(r.sections.map((s) => s.slot)).toEqual([
      "hebrew_date",
      "month_mazal",
      "day_planet",
      "hour_planet",
      "sefer_yetzirah",
      "date_gematria",
      "name_gematria",
    ]);
    expect(r.missingKeys).toEqual([]);
    expect(r.dir).toBe("rtl");
    expect(r.stale).toBe(false);
  });

  it("keys sections to the effective (sunset-adjusted) date", () => {
    const { mazal, gematria } = fixtures();
    const r = resolveHebrewReading(mazal, gematria, CONTENT_VERSION);
    const bySlot = Object.fromEntries(r.sections.map((s) => [s.slot, s]));
    // Effective 24 Tevet 5760: 24→6, 5760→18→9, 6+9=15→6.
    expect(bySlot.month_mazal.key).toBe("mazal_month/tevet");
    expect(bySlot.sefer_yetzirah.key).toBe("sefer_yetzirah/tevet");
    expect(bySlot.date_gematria.key).toBe("hebrew_date_gematria/6");
    // Sunday (after-sunset flip from Saturday) → day planet sun.
    expect(bySlot.day_planet.key).toBe("day_planet/sun");
    // דוד(5) + כהן(3) = 8 in mispar katan.
    expect(bySlot.name_gematria.key).toBe("name_gematria/8");
  });

  it("renders the hebrew_date section from data with an after-sunset note", () => {
    const { mazal, gematria } = fixtures();
    const r = resolveHebrewReading(mazal, gematria, CONTENT_VERSION);
    const date = r.sections[0];
    expect(date.key).toBeNull();
    expect(date.bodyMd).toContain(mazal.hebrewDate.effective.renderGematriya);
    expect(date.bodyMd).toContain("לאחר שקיעת החמה");
    expect(date.source).toBe("1.1.2000");
  });

  it("writes Hebrew provenance strings", () => {
    const { mazal, gematria } = fixtures();
    const r = resolveHebrewReading(mazal, gematria, CONTENT_VERSION);
    const bySlot = Object.fromEntries(r.sections.map((s) => [s.slot, s]));
    expect(bySlot.month_mazal.source).toBe("חודש טבת — מזל גדי");
    expect(bySlot.day_planet.source).toBe("יום ראשון — חמה");
    expect(bySlot.sefer_yetzirah.source).toBe("אות ע — שבט דן");
    expect(bySlot.name_gematria.source).toBe("דוד כהן — מספר קטן 8");
    expect(bySlot.hour_planet.source).toContain("של הלילה");
  });

  it("skips the hour slot for unknown time and drops the sunset note", () => {
    const { mazal, gematria } = fixtures({ timeCertainty: "unknown" });
    const r = resolveHebrewReading(mazal, gematria, CONTENT_VERSION);
    expect(r.sections.map((s) => s.slot)).not.toContain("hour_planet");
    expect(r.sections[0].bodyMd).not.toContain("לאחר שקיעת החמה");
  });

  it("skips the name slot without a Hebrew name", () => {
    const { mazal, gematria } = fixtures({ hebrewName: false });
    const r = resolveHebrewReading(mazal, gematria, CONTENT_VERSION);
    expect(r.sections.map((s) => s.slot)).not.toContain("name_gematria");
    expect(r.missingKeys).toEqual([]);
  });

  it("degrades gracefully on an unauthored library", () => {
    const { mazal, gematria } = fixtures();
    const empty = { version: CONTENT_VERSION, entries: new Map() };
    const r = resolveHebrewReading(mazal, gematria, CONTENT_VERSION, empty);
    // Only the data-rendered date section survives.
    expect(r.sections.map((s) => s.slot)).toEqual(["hebrew_date"]);
    expect(r.missingKeys).toEqual([
      "mazal_month/tevet",
      "day_planet/sun",
      "hour_planet/moon",
      "sefer_yetzirah/tevet",
      "hebrew_date_gematria/6",
      "name_gematria/8",
    ]);
  });

  it("marks pre-2c snapshots as stale", () => {
    const { mazal, gematria } = fixtures();
    const r = resolveHebrewReading(mazal, gematria, "0");
    expect(r.stale).toBe(true);
    expect(r.snapshotContentVersion).toBe("0");
  });
});
