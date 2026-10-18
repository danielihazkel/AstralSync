import { describe, expect, it } from "vitest";
import {
  civilRangeToUtc,
  isValidTimeZone,
  offsetMinutesAt,
  resolveBirthMoment,
  timezoneFor,
} from "./tz";

describe("timezoneFor (geo-tz, offline)", () => {
  it("resolves coordinates to IANA zones", () => {
    expect(timezoneFor(40.7, -74.0)).toBe("America/New_York");
    expect(timezoneFor(32.08, 34.78)).toBe("Asia/Jerusalem");
    expect(timezoneFor(48.4, 10.0)).toBe("Europe/Berlin");
  });
});

describe("isValidTimeZone", () => {
  it("accepts zones the runtime's IANA database knows", () => {
    expect(isValidTimeZone("Asia/Jerusalem")).toBe(true);
    expect(isValidTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects unknown and malformed zone names", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("Europe Berlin")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("historical UTC offset resolution", () => {
  it("resolves standard vs daylight offsets", () => {
    expect(offsetMinutesAt("America/New_York", new Date("2023-01-15T12:00:00Z"))).toBe(-300);
    expect(offsetMinutesAt("America/New_York", new Date("2023-07-15T12:00:00Z"))).toBe(-240);
    expect(offsetMinutesAt("Asia/Jerusalem", new Date("2023-07-15T12:00:00Z"))).toBe(180);
  });

  it("resolves an unambiguous birth moment with no warnings", () => {
    const r = resolveBirthMoment("America/New_York", {
      year: 2023, month: 1, day: 15, hour: 8, minute: 30,
    });
    expect(r.utc.toISOString()).toBe("2023-01-15T13:30:00.000Z");
    expect(r.offsetMinutes).toBe(-300);
    expect(r.warnings).toEqual([]);
  });

  it("PRD §8 edge case: birth near midnight across a DST transition (Havana gap)", () => {
    // Cuba springs forward at midnight: 2023-03-12 00:00 → 01:00, so 00:30
    // never existed. It resolves forward past the gap and is flagged.
    const r = resolveBirthMoment("America/Havana", {
      year: 2023, month: 3, day: 12, hour: 0, minute: 30,
    });
    expect(r.warnings).toContain("dst_gap");
    expect(r.utc.toISOString()).toBe("2023-03-12T05:30:00.000Z"); // 01:30 CDT
  });

  it("resolves a fall-back fold to the earlier (DST) instant and flags it", () => {
    // 2023-11-05 01:30 in New York occurred twice (EDT then EST).
    const r = resolveBirthMoment("America/New_York", {
      year: 2023, month: 11, day: 5, hour: 1, minute: 30,
    });
    expect(r.warnings).toContain("dst_ambiguous");
    expect(r.offsetMinutes).toBe(-240); // earlier pass, still EDT
    expect(r.utc.toISOString()).toBe("2023-11-05T05:30:00.000Z");
  });

  it("PRD §8 edge case: pre-1970 birth carries an offset warning (Einstein, 1879)", () => {
    // IANA reports Europe/Berlin LMT (+00:53:28) for 1879 — Berlin's mean
    // time, not Ulm's (+40 min). Exactly why the UI must allow override.
    const r = resolveBirthMoment("Europe/Berlin", {
      year: 1879, month: 3, day: 14, hour: 11, minute: 30,
    });
    expect(r.warnings).toContain("pre_1970_offset_uncertain");
    expect(r.offsetMinutes).toBeGreaterThanOrEqual(50);
    expect(r.offsetMinutes).toBeLessThanOrEqual(57);
  });

  it("handles half-hour zones", () => {
    const r = resolveBirthMoment("Asia/Kolkata", {
      year: 1995, month: 6, day: 1, hour: 12, minute: 0,
    });
    expect(r.offsetMinutes).toBe(330);
    expect(r.utc.toISOString()).toBe("1995-06-01T06:30:00.000Z");
  });
});

describe("civilRangeToUtc", () => {
  it("bounds the range by the zone's local midnights", () => {
    // Israel in October 2026 is IDT (UTC+3) until the 25th, then IST (+2):
    // each end takes its own offset.
    const r = civilRangeToUtc("2026-10-01", "2026-10-31", "Asia/Jerusalem");
    expect(r.from.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-31T22:00:00.000Z");
  });

  it("covers an early-morning hit on the 1st that UTC bounds dropped", () => {
    const hit = Date.parse("2026-09-30T22:30:00Z"); // 01:30 local, Oct 1
    const local = civilRangeToUtc("2026-10-01", "2026-10-31", "Asia/Jerusalem");
    const utc = civilRangeToUtc("2026-10-01", "2026-10-31");
    expect(hit >= local.from.getTime() && hit < local.to.getTime()).toBe(true);
    expect(hit >= utc.from.getTime()).toBe(false);
  });

  it("keeps UTC days when no zone is given (older clients)", () => {
    const r = civilRangeToUtc("2026-02-01", "2026-02-28");
    expect(r.from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("rolls the end over a year boundary", () => {
    const r = civilRangeToUtc("2026-12-01", "2026-12-31", "America/New_York");
    expect(r.to.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});
