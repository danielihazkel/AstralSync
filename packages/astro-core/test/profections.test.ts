import { describe, expect, it } from "vitest";
import { annualProfection, TRADITIONAL_RULERS } from "../src";

const BIRTH = new Date(Date.UTC(1990, 2, 4, 10, 30, 0));

describe("annualProfection", () => {
  it("age 0 is a 1st-house year in the Ascendant sign", () => {
    const p = annualProfection("leo", BIRTH, new Date(Date.UTC(1990, 5, 1)));
    expect(p.age).toBe(0);
    expect(p.profectedHouse).toBe(1);
    expect(p.profectedSign).toBe("leo");
    expect(p.yearLord).toBe("sun");
  });

  it("wraps back to the 1st house at ages 12, 24, 36", () => {
    for (const years of [12, 24, 36]) {
      const p = annualProfection(
        "leo",
        BIRTH,
        new Date(Date.UTC(1990 + years, 5, 1)),
      );
      expect(p.age).toBe(years);
      expect(p.profectedHouse).toBe(1);
      expect(p.profectedSign).toBe("leo");
    }
  });

  it("advances whole signs from the Ascendant", () => {
    // Age 36 + more: 2026-06-01 → age 36 → 1st house. Age 35 → 12th.
    const p35 = annualProfection("leo", BIRTH, new Date(Date.UTC(2026, 0, 1)));
    expect(p35.age).toBe(35);
    expect(p35.profectedHouse).toBe(12);
    expect(p35.profectedSign).toBe("cancer");
    expect(p35.yearLord).toBe("moon");
    // Sign wrap: Ascendant late in the zodiac.
    const p = annualProfection("pisces", BIRTH, new Date(Date.UTC(1992, 5, 1)));
    expect(p.age).toBe(2);
    expect(p.profectedHouse).toBe(3);
    expect(p.profectedSign).toBe("taurus");
  });

  it("flips exactly at the birthday anniversary", () => {
    const justBefore = annualProfection(
      "aries",
      BIRTH,
      new Date(Date.UTC(2020, 2, 4, 10, 29, 0)),
    );
    const justAfter = annualProfection(
      "aries",
      BIRTH,
      new Date(Date.UTC(2020, 2, 4, 10, 31, 0)),
    );
    expect(justBefore.age).toBe(29);
    expect(justAfter.age).toBe(30);
    expect(justBefore.profectedHouse).toBe(6);
    expect(justAfter.profectedHouse).toBe(7);
    // The year brackets are the anniversaries.
    expect(justAfter.yearStartUtc).toBe("2020-03-04T10:30:00.000Z");
    expect(justAfter.yearEndUtc).toBe("2021-03-04T10:30:00.000Z");
  });

  it("uses traditional rulerships (no outer planets)", () => {
    expect(TRADITIONAL_RULERS.scorpio).toBe("mars");
    expect(TRADITIONAL_RULERS.aquarius).toBe("saturn");
    expect(TRADITIONAL_RULERS.pisces).toBe("jupiter");
    expect(Object.values(TRADITIONAL_RULERS)).not.toContain("uranus");
    expect(Object.values(TRADITIONAL_RULERS)).not.toContain("neptune");
    expect(Object.values(TRADITIONAL_RULERS)).not.toContain("pluto");
  });
});
