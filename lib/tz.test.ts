import { describe, expect, it } from "vitest";
import { offsetMinutesAt, resolveBirthMoment, timezoneFor } from "./tz";

describe("timezoneFor (geo-tz, offline)", () => {
  it("resolves coordinates to IANA zones", () => {
    expect(timezoneFor(40.7, -74.0)).toBe("America/New_York");
    expect(timezoneFor(32.08, 34.78)).toBe("Asia/Jerusalem");
    expect(timezoneFor(48.4, 10.0)).toBe("Europe/Berlin");
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
