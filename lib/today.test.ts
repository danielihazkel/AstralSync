import { positionsAt } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import { computeToday, moonPhaseName, type HomeLocation } from "./today";

const JERUSALEM: HomeLocation = {
  label: "Jerusalem, Israel",
  lat: 31.77,
  lng: 35.21,
  tzIana: "Asia/Jerusalem",
};

describe("moonPhaseName", () => {
  it("names the cardinal points and the phases between", () => {
    expect(moonPhaseName(0)).toBe("New Moon");
    expect(moonPhaseName(355)).toBe("New Moon");
    expect(moonPhaseName(45)).toBe("Waxing Crescent");
    expect(moonPhaseName(90)).toBe("First Quarter");
    expect(moonPhaseName(135)).toBe("Waxing Gibbous");
    expect(moonPhaseName(180)).toBe("Full Moon");
    expect(moonPhaseName(225)).toBe("Waning Gibbous");
    expect(moonPhaseName(270)).toBe("Third Quarter");
    expect(moonPhaseName(315)).toBe("Waning Crescent");
  });
});

describe("computeToday", () => {
  it("reports a known full moon correctly", () => {
    // 2024-01-25 17:54 UTC was a full moon.
    const sky = computeToday(new Date(Date.UTC(2024, 0, 25, 18, 0)), null, []);
    expect(sky.moon.phaseName).toBe("Full Moon");
    expect(sky.moon.illumination).toBeGreaterThan(0.97);
    expect(sky.moon.nextQuarter.name).toBe("Third Quarter");
  });

  it("reports a known new moon correctly", () => {
    // 2024-01-11 11:57 UTC was a new moon.
    const sky = computeToday(new Date(Date.UTC(2024, 0, 11, 12, 0)), null, []);
    expect(sky.moon.phaseName).toBe("New Moon");
    expect(sky.moon.illumination).toBeLessThan(0.03);
  });

  it("maps the civil date to the Hebrew calendar without a location", () => {
    // 2024-04-23 daytime = 15 Nisan 5784 (first day of Pesach).
    const sky = computeToday(new Date(Date.UTC(2024, 3, 23, 12, 0)), null, []);
    expect(sky.hebrew.parts.day).toBe(15);
    expect(sky.hebrew.parts.monthKey).toBe("nisan");
    expect(sky.hebrew.parts.year).toBe(5784);
    expect(sky.hebrew.mazal.month).toBe("nisan");
    expect(sky.hebrew.approximate).toBe(true);
    expect(sky.hour).toBeNull();
  });

  it("advances the Hebrew date after sunset with a location", () => {
    // 20:00 Jerusalem time (17:00 UTC) in April is after sunset (~19:15).
    const evening = computeToday(
      new Date(Date.UTC(2024, 3, 22, 17, 0)),
      JERUSALEM,
      [],
    );
    expect(evening.hebrew.approximate).toBe(false);
    expect(evening.hebrew.parts.day).toBe(15); // 15 Nisan began at sunset
    // Noon the same civil day is still 14 Nisan.
    const noon = computeToday(
      new Date(Date.UTC(2024, 3, 22, 9, 0)),
      JERUSALEM,
      [],
    );
    expect(noon.hebrew.parts.day).toBe(14);
  });

  it("computes the current planetary hour with a location", () => {
    const sky = computeToday(
      new Date(Date.UTC(2024, 3, 22, 9, 0)), // noon in Jerusalem
      JERUSALEM,
      [],
    );
    expect(sky.hour).not.toBeNull();
    expect(sky.hour!.isDay).toBe(true);
    expect(sky.hour!.hourIndex).toBeGreaterThanOrEqual(1);
    expect(sky.hour!.hourIndex).toBeLessThanOrEqual(12);
    // Monday's day ruler is the Moon in the Chaldean cycle.
    expect(sky.hour!.dayRuler).toBe("moon");
  });

  it("finds notable transits per profile, tightest first, top 3", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    // A natal chart identical to the current sky guarantees exact conjunctions.
    const sky = computeToday(at, null, [
      { id: 1, displayName: "Now-born", placements: positionsAt(at) },
    ]);
    expect(sky.transits).toHaveLength(1);
    expect(sky.transits[0].displayName).toBe("Now-born");
    expect(sky.transits[0].aspects).toHaveLength(3);
    expect(sky.transits[0].aspects[0].orb).toBeCloseTo(0, 5);
    for (let i = 1; i < sky.transits[0].aspects.length; i++) {
      expect(sky.transits[0].aspects[i].orb).toBeGreaterThanOrEqual(
        sky.transits[0].aspects[i - 1].orb,
      );
    }
  });

  it("hides the transit section shape for empty profile lists", () => {
    const sky = computeToday(new Date(Date.UTC(2026, 7, 13)), null, []);
    expect(sky.transits).toEqual([]);
  });
});
