import { describe, expect, it } from "vitest";
import {
  ageOn,
  personalDay,
  personalMonth,
  personalYear,
  pinnacleAt,
  pinnacles,
  rootDigit,
  universalYear,
} from "../src";

// 1990-03-21: month 3, day 21 → 3, year 1990 → 19 → 1; Life Path 7.
const ORDINARY = { year: 1990, month: 3, day: 21 };
// 1975-04-07: year 1975 → 22 (kept); Life Path 33.
const MASTER = { year: 1975, month: 4, day: 7 };

describe("personal cycles", () => {
  it("reduces month, day and calendar year separately, then their sum", () => {
    // 3 + 3 + (2026 → 10 → 1) = 7
    expect(personalYear(ORDINARY, 2026)).toEqual({
      value: 7,
      isMaster: false,
      steps: [7],
    });
    expect(universalYear(2026).value).toBe(1);
  });

  it("builds the month on the year and the day on the month", () => {
    // October: 7 + 1 = 8; the 18th: 8 + 9 = 17 → 8
    expect(personalMonth(ORDINARY, 2026, 10).value).toBe(8);
    expect(personalDay(ORDINARY, 2026, 10, 18)).toEqual({
      value: 8,
      isMaster: false,
      steps: [17, 8],
    });
  });

  it("keeps a master number the sum lands on", () => {
    // Nov 29: 11 + (29 → 11) + (2009 → 11) = 33
    const y = personalYear({ month: 11, day: 29 }, 2009);
    expect(y.value).toBe(33);
    expect(y.isMaster).toBe(true);
  });

  it("walks a nine-year cycle", () => {
    const years = Array.from({ length: 9 }, (_, i) =>
      rootDigit(personalYear(ORDINARY, 2026 + i).value),
    );
    expect(new Set(years).size).toBe(9);
  });
});

describe("pinnacles and challenges", () => {
  it("computes the four periods for an ordinary date", () => {
    const list = pinnacles(ORDINARY);
    expect(list.map((p) => p.number.value)).toEqual([6, 4, 1, 4]);
    expect(list.map((p) => p.challenge)).toEqual([0, 2, 2, 2]);
    // First ends at 36 − 7.
    expect(list.map((p) => [p.fromAge, p.toAge])).toEqual([
      [0, 29],
      [29, 38],
      [38, 47],
      [47, null],
    ]);
  });

  it("keeps master pinnacles but reduces challenges to root digits", () => {
    const list = pinnacles(MASTER);
    // P1 4+7 = 11, P2 7+22 = 29 → 11, P3 11+11 = 22, P4 4+22 = 26 → 8
    expect(list.map((p) => p.number.value)).toEqual([11, 11, 22, 8]);
    // m=4, d=7, y=22→4
    expect(list.map((p) => p.challenge)).toEqual([3, 3, 0, 0]);
    // Life Path 33 → root 6 → first ends at 30.
    expect(list[0].toAge).toBe(30);
  });

  it("never yields a challenge outside 0–8", () => {
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 9, 11, 19, 22, 29, 31]) {
        for (const year of [1900, 1975, 1999, 2004]) {
          for (const p of pinnacles({ year, month, day })) {
            expect(p.challenge).toBeGreaterThanOrEqual(0);
            expect(p.challenge).toBeLessThanOrEqual(8);
          }
        }
      }
    }
  });

  it("finds the pinnacle in force at an age", () => {
    const list = pinnacles(ORDINARY);
    expect(pinnacleAt(list, 28).index).toBe(1);
    expect(pinnacleAt(list, 29).index).toBe(2);
    expect(pinnacleAt(list, 90).index).toBe(4);
  });
});

describe("ageOn", () => {
  it("counts a year only once the birthday has passed", () => {
    expect(ageOn(ORDINARY, { year: 2026, month: 3, day: 20 })).toBe(35);
    expect(ageOn(ORDINARY, { year: 2026, month: 3, day: 21 })).toBe(36);
  });
});

describe("rootDigit", () => {
  it("folds master numbers to their roots", () => {
    expect([11, 22, 33, 7].map(rootDigit)).toEqual([2, 4, 6, 7]);
  });
});
