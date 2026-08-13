import { describe, expect, it } from "vitest";
import {
  MAX_JOURNAL_DATE,
  MIN_JOURNAL_DATE,
  clampJournalDate,
  localNoonIso,
  todayLocalDate,
} from "./journalDate";

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
});

describe("clampJournalDate", () => {
  it("passes in-range dates through", () => {
    expect(clampJournalDate("2026-08-13", "2026-01-01")).toBe("2026-08-13");
  });

  it("clamps to the ephemeris bounds", () => {
    expect(clampJournalDate("1500-06-01", "2026-01-01")).toBe(MIN_JOURNAL_DATE);
    expect(clampJournalDate("2500-06-01", "2026-01-01")).toBe(MAX_JOURNAL_DATE);
  });

  it("keeps the previous date on a cleared or malformed input", () => {
    expect(clampJournalDate("", "2026-08-13")).toBe("2026-08-13");
    expect(clampJournalDate("garbage", "2026-08-13")).toBe("2026-08-13");
  });
});
