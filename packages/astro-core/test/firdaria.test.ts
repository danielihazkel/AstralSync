import { describe, expect, it } from "vitest";
import {
  currentFirdaria,
  firdariaSequence,
  FIRDARIA_CYCLE_YEARS,
  FIRDARIA_YEARS,
} from "../src";

const YEAR_MS = 365.2425 * 86_400_000;
const BIRTH = new Date(Date.UTC(1990, 2, 4, 10, 30));

function atAge(years: number): Date {
  return new Date(BIRTH.getTime() + years * YEAR_MS);
}

describe("firdariaSequence", () => {
  it("orders day births Sun-first and night births Moon-first, nodes after Mars", () => {
    expect(firdariaSequence(true)).toEqual([
      "sun",
      "venus",
      "mercury",
      "moon",
      "saturn",
      "jupiter",
      "mars",
      "north_node",
      "south_node",
    ]);
    expect(firdariaSequence(false)).toEqual([
      "moon",
      "saturn",
      "jupiter",
      "mars",
      "north_node",
      "south_node",
      "sun",
      "venus",
      "mercury",
    ]);
  });

  it("sums to the 75-year cycle", () => {
    const total = firdariaSequence(true).reduce(
      (acc, lord) => acc + FIRDARIA_YEARS[lord],
      0,
    );
    expect(total).toBe(FIRDARIA_CYCLE_YEARS);
  });
});

describe("currentFirdaria", () => {
  it("walks the published day-birth boundaries", () => {
    // Day scheme by age: Sun 0–10, Venus 10–18, Mercury 18–31, Moon 31–40,
    // Saturn 40–51, Jupiter 51–63, Mars 63–70, NN 70–73, SN 73–75.
    const cases: Array<[number, string]> = [
      [5, "sun"],
      [12, "venus"],
      [25, "mercury"],
      [35, "moon"],
      [45, "saturn"],
      [55, "jupiter"],
      [65, "mars"],
      [71, "north_node"],
      [74, "south_node"],
    ];
    for (const [age, lord] of cases) {
      const f = currentFirdaria(BIRTH, true, atAge(age))!;
      expect(f.major.lord, `age ${age}`).toBe(lord);
      expect(f.secondCycle).toBe(false);
    }
  });

  it("walks the published night-birth boundaries", () => {
    // Night scheme by age: Moon 0–9, Saturn 9–20, Jupiter 20–32, Mars 32–39,
    // NN 39–42, SN 42–44, Sun 44–54, Venus 54–62, Mercury 62–75.
    const cases: Array<[number, string]> = [
      [4, "moon"],
      [15, "saturn"],
      [25, "jupiter"],
      [35, "mars"],
      [40, "north_node"],
      [43, "south_node"],
      [50, "sun"],
      [58, "venus"],
      [70, "mercury"],
    ];
    for (const [age, lord] of cases) {
      expect(currentFirdaria(BIRTH, false, atAge(age))!.major.lord, `age ${age}`).toBe(
        lord,
      );
    }
  });

  it("opens each planetary major with its own sub-lord and walks the loop", () => {
    // Day birth, Sun major (10y → sevenths of ~1.43y): sub 0 Sun, sub 3
    // (age 5 → 5 / (10/7) = 3.5) lands on the Moon (Sun→Venus→Mercury→Moon).
    const opening = currentFirdaria(BIRTH, true, atAge(0.5))!;
    expect(opening.major.lord).toBe("sun");
    expect(opening.sub!.lord).toBe("sun");

    const midway = currentFirdaria(BIRTH, true, atAge(5))!;
    expect(midway.sub!.lord).toBe("moon");
    // Sub bounds nest inside the major.
    expect(new Date(midway.sub!.startUtc).getTime()).toBeGreaterThanOrEqual(
      new Date(midway.major.startUtc).getTime(),
    );
    expect(new Date(midway.sub!.endUtc).getTime()).toBeLessThanOrEqual(
      new Date(midway.major.endUtc).getTime(),
    );
  });

  it("gives the node periods no sub-lord", () => {
    expect(currentFirdaria(BIRTH, true, atAge(71))!.sub).toBeNull();
    expect(currentFirdaria(BIRTH, true, atAge(74))!.sub).toBeNull();
  });

  it("repeats the wheel after 75 years", () => {
    const f = currentFirdaria(BIRTH, true, atAge(76))!;
    expect(f.secondCycle).toBe(true);
    expect(f.major.lord).toBe("sun"); // one year into the second cycle
    // The second cycle's opening period starts 75 years after birth.
    expect(new Date(f.major.startUtc).getTime()).toBeCloseTo(
      BIRTH.getTime() + 75 * YEAR_MS,
      -4,
    );
  });

  it("returns a nine-period cycle spanning exactly 75 years", () => {
    const f = currentFirdaria(BIRTH, true, atAge(20))!;
    expect(f.cycle).toHaveLength(9);
    expect(f.cycle[0].startUtc).toBe(BIRTH.toISOString());
    expect(new Date(f.cycle[8].endUtc).getTime()).toBeCloseTo(
      BIRTH.getTime() + 75 * YEAR_MS,
      -4,
    );
    // Periods abut exactly.
    for (let i = 1; i < f.cycle.length; i++) {
      expect(f.cycle[i].startUtc).toBe(f.cycle[i - 1].endUtc);
    }
  });

  it("returns null before birth", () => {
    expect(currentFirdaria(BIRTH, true, new Date(BIRTH.getTime() - 1))).toBeNull();
  });
});
