import { describe, expect, it } from "vitest";
import {
  MAX_ALMANAC_DATE,
  MIN_ALMANAC_DATE,
  addDaysCivil,
  isValidAlmanacDate,
} from "./almanacDate";

describe("isValidAlmanacDate", () => {
  it("accepts well-formed in-range dates", () => {
    expect(isValidAlmanacDate("2026-08-16")).toBe(true);
    expect(isValidAlmanacDate(MIN_ALMANAC_DATE)).toBe(true);
    expect(isValidAlmanacDate(MAX_ALMANAC_DATE)).toBe(true);
    expect(isValidAlmanacDate("2024-02-29")).toBe(true); // leap day
  });

  it("rejects malformed strings", () => {
    expect(isValidAlmanacDate("2026-8-16")).toBe(false);
    expect(isValidAlmanacDate("16-08-2026")).toBe(false);
    expect(isValidAlmanacDate("2026-08-16T00:00")).toBe(false);
    expect(isValidAlmanacDate("almanac")).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(isValidAlmanacDate("2026-02-30")).toBe(false);
    expect(isValidAlmanacDate("2026-13-01")).toBe(false);
    expect(isValidAlmanacDate("2023-02-29")).toBe(false); // not a leap year
  });

  it("rejects dates outside the ephemeris range", () => {
    expect(isValidAlmanacDate("1699-12-31")).toBe(false);
    expect(isValidAlmanacDate("2200-01-01")).toBe(false);
  });
});

describe("addDaysCivil", () => {
  it("crosses month, year and leap boundaries", () => {
    expect(addDaysCivil("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysCivil("2023-02-28", 1)).toBe("2023-03-01");
    expect(addDaysCivil("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysCivil("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysCivil("2026-08-16", 0)).toBe("2026-08-16");
  });
});
