import { describe, expect, it } from "vitest";
import { computeAlmanacDay } from "./almanac";
import { computeMoonMonth } from "./skyCalendar";

/**
 * April 2024 golden month, in the tz-robust style of skyCalendar.test.ts:
 * days are bucketed machine-locally, so assertions stick to properties
 * stable in any test-machine timezone.
 */
describe("computeAlmanacDay", () => {
  const eclipseDay = computeAlmanacDay("2024-04-08");

  it("reuses the month grid's cell for the day", () => {
    const month = computeMoonMonth(2024, 4);
    expect(eclipseDay.moon).toEqual(
      month.days.find((d) => d.date === "2024-04-08"),
    );
    expect(eclipseDay.date).toBe("2024-04-08");
  });

  it("names the phase on the eclipse day", () => {
    expect(eclipseDay.phaseName).toBe("New Moon");
  });

  it("excludes the Moon from mundane aspects", () => {
    for (const day of ["2024-04-08", "2024-04-21"]) {
      const a = computeAlmanacDay(day);
      expect(a.mundane.every((h) => h.a !== "moon" && h.b !== "moon")).toBe(
        true,
      );
    }
  });

  it("finds the Jupiter–Uranus conjunction around 2024-04-21", () => {
    // Exact ~2024-04-21 02:30 UT; scan the surrounding local days so the
    // machine-local bucketing can't hide it.
    const hits = ["2024-04-20", "2024-04-21"]
      .flatMap((d) => computeAlmanacDay(d).mundane)
      .filter((h) => h.a === "jupiter" && h.b === "uranus" && h.angle === 0);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].utc.slice(0, 10)).toBe("2024-04-21");
  });

  it("finds Mercury's early-April station into retrograde", () => {
    // Station ~2024-04-01 22:14 UT; union of two local days is tz-proof.
    const stations = ["2024-04-01", "2024-04-02"]
      .flatMap((d) => computeAlmanacDay(d).stations)
      .filter((s) => s.planet === "mercury");
    expect(stations.some((s) => s.direction === "retrograde")).toBe(true);
  });

  it("lists non-moon ingresses with the entered sign", () => {
    // The Sun enters Taurus ~2024-04-19 14:00 UT.
    const ingresses = ["2024-04-19", "2024-04-20"]
      .flatMap((d) => computeAlmanacDay(d).ingresses)
      .filter((i) => i.planet === "sun");
    expect(ingresses).toHaveLength(1);
    expect(ingresses[0].sign).toBe("taurus");
  });

  it("throws on a date it has no month cell for", () => {
    expect(() => computeAlmanacDay("2024-04-31")).toThrow();
  });
});

describe("lunar mansion", () => {
  it("attaches the noon Moon's mansion, consistent with the mansion table", async () => {
    const { lunarMansion } = await import("./lunarMansions");
    const { astronomyEngineProvider } = await import("@astralsync/astro-core");
    const day = computeAlmanacDay("2024-04-08");
    expect(day.mansion.index).toBeGreaterThanOrEqual(1);
    expect(day.mansion.index).toBeLessThanOrEqual(28);
    expect(day.mansion.name.length).toBeGreaterThan(0);
    // Same instant convention as the phase: machine-local noon.
    const noon = new Date(2024, 3, 8, 12);
    expect(day.mansion).toEqual(
      lunarMansion(astronomyEngineProvider.eclipticLongitude("moon", noon)),
    );
  });
});
