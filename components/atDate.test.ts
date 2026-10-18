import { afterEach, describe, expect, it } from "vitest";
import { journalCreateSchema, lifeEventCreateSchema } from "@/lib/validation";
import {
  MAX_AT_DATE,
  MIN_AT_DATE,
  clampAtDate,
  localNoonIso,
  todayLocalDate,
} from "./atDate";

describe("todayLocalDate", () => {
  it("formats the local civil date with zero padding", () => {
    // Local-time constructor, so the expected string is timezone-safe.
    expect(todayLocalDate(new Date(2026, 7, 3, 23, 59))).toBe("2026-08-03");
    expect(todayLocalDate(new Date(1999, 0, 1, 0, 0))).toBe("1999-01-01");
  });
});

describe("localNoonIso", () => {
  it("pins the instant to local noon of the picked day", () => {
    const iso = localNoonIso("2026-08-13");
    const parsed = new Date(iso);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(13);
    expect(parsed.getHours()).toBe(12);
    expect(parsed.getMinutes()).toBe(0);
  });

  it("produces a valid ISO instant", () => {
    expect(() => new Date(localNoonIso("1700-01-01")).toISOString()).not.toThrow();
  });

  describe("in a zone east of UTC+12", () => {
    const original = process.env.TZ;
    afterEach(() => {
      restoreTz(original);
    });

    it("keeps the civil date as the first ten characters", () => {
      // NZDT (UTC+13): local noon on the 15th is 23:00Z on the 14th, which
      // as a Z string failed the journal/life-event "at must fall on the
      // date" check for every save.
      process.env.TZ = "Pacific/Auckland";
      expect(localNoonIso("2026-01-15")).toBe("2026-01-15T12:00:00+13:00");
      process.env.TZ = "Pacific/Kiritimati";
      expect(localNoonIso("2026-01-15")).toBe("2026-01-15T12:00:00+14:00");
      expect(new Date(localNoonIso("2026-01-15")).toISOString()).toBe(
        "2026-01-14T22:00:00.000Z",
      );
    });

    it("passes the journal and life-event schemas", () => {
      process.env.TZ = "Pacific/Auckland";
      const at = localNoonIso("2026-01-15");
      expect(
        journalCreateSchema.safeParse({
          entryDate: "2026-01-15",
          bodyMd: "x",
          at,
        }).success,
      ).toBe(true);
      expect(
        lifeEventCreateSchema.safeParse({
          title: "Moved",
          eventDate: "2026-01-15",
          category: "relocation",
          at,
        }).success,
      ).toBe(true);
    });
  });

  it("writes west-of-UTC offsets with a minus sign", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(localNoonIso("2026-01-15")).toBe("2026-01-15T12:00:00-08:00");
      expect(localNoonIso("2026-07-15")).toBe("2026-07-15T12:00:00-07:00");
    } finally {
      restoreTz(original);
    }
  });
});

describe("clampAtDate", () => {
  it("passes in-range dates through", () => {
    expect(clampAtDate("2026-08-13", "2026-01-01")).toBe("2026-08-13");
  });

  it("clamps to the ephemeris bounds", () => {
    expect(clampAtDate("1500-06-01", "2026-01-01")).toBe(MIN_AT_DATE);
    expect(clampAtDate("2500-06-01", "2026-01-01")).toBe(MAX_AT_DATE);
  });

  it("keeps the previous date on a cleared or malformed input", () => {
    expect(clampAtDate("", "2026-08-13")).toBe("2026-08-13");
    expect(clampAtDate("garbage", "2026-08-13")).toBe("2026-08-13");
  });
});

/** process.env coerces undefined to the string "undefined", which Node then
 *  reads as a (bogus) zone — delete instead when there was none. */
function restoreTz(original: string | undefined) {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
}
