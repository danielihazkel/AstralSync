import { describe, expect, it } from "vitest";
import {
  HEBREW_MONTH_KEYS,
  MONTH_MAZAL,
  monthKeyFromMonthNumber,
  SEFER_YETZIRAH,
} from "../src";

describe("month mazal table (Phase 2a)", () => {
  it("covers all 12 month keys", () => {
    for (const key of HEBREW_MONTH_KEYS) {
      expect(MONTH_MAZAL[key].month).toBe(key);
    }
  });

  it("maps Nisan→Aries through Adar→Pisces in zodiac order", () => {
    const zodiac = [
      "aries",
      "taurus",
      "gemini",
      "cancer",
      "leo",
      "virgo",
      "libra",
      "scorpio",
      "sagittarius",
      "capricorn",
      "aquarius",
      "pisces",
    ];
    expect(HEBREW_MONTH_KEYS.map((k) => MONTH_MAZAL[k].sign)).toEqual(zodiac);
  });

  it("collapses Adar I (12) and Adar II (13) to the adar key", () => {
    expect(monthKeyFromMonthNumber(12)).toBe("adar");
    expect(monthKeyFromMonthNumber(13)).toBe("adar");
    expect(monthKeyFromMonthNumber(1)).toBe("nisan");
    expect(monthKeyFromMonthNumber(11)).toBe("shvat");
    expect(() => monthKeyFromMonthNumber(0)).toThrow(RangeError);
    expect(() => monthKeyFromMonthNumber(14)).toThrow(RangeError);
  });
});

describe("Sefer Yetzirah table (Gra recension per Kaplan)", () => {
  it("covers all 12 month keys", () => {
    for (const key of HEBREW_MONTH_KEYS) {
      expect(SEFER_YETZIRAH[key].month).toBe(key);
    }
  });

  it("uses exactly the twelve simple letters (no mothers or doubles)", () => {
    const letters = HEBREW_MONTH_KEYS.map((k) => SEFER_YETZIRAH[k].letter);
    const mothers = ["א", "מ", "ש"];
    const doubles = ["ב", "ג", "ד", "כ", "פ", "ר", "ת"];
    expect(new Set(letters).size).toBe(12);
    for (const letter of letters) {
      expect(mothers).not.toContain(letter);
      expect(doubles).not.toContain(letter);
    }
  });

  it("assigns distinct tribes and faculties", () => {
    const tribes = HEBREW_MONTH_KEYS.map((k) => SEFER_YETZIRAH[k].tribe);
    const faculties = HEBREW_MONTH_KEYS.map((k) => SEFER_YETZIRAH[k].faculty);
    expect(new Set(tribes).size).toBe(12);
    expect(new Set(faculties).size).toBe(12);
  });
});
