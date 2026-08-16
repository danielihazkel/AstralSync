import { buildChart } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import { computeAspectSearch } from "./aspectSearch";
import type { WheelChart } from "./view-types";

function chartOf(
  utc: Date,
  timeCertainty: "exact" | "approx" | "unknown" = "exact",
): WheelChart {
  const chart = buildChart({
    utc,
    latitude: 51.48,
    longitude: 0,
    timeCertainty,
  });
  return { ...chart, tzWarnings: [] };
}

const BIRTH_UTC = Date.UTC(1990, 2, 4, 10, 30, 0);
const NATAL = chartOf(new Date(BIRTH_UTC));

const DAY_MS = 86_400_000;

describe("computeAspectSearch", () => {
  it("finds the next solar return as the first Sun-conjunct-natal-Sun hit", () => {
    const from = new Date(Date.UTC(2026, 7, 13));
    const result = computeAspectSearch(NATAL, 1, {
      planet: "sun",
      target: "sun",
      aspect: "conjunction",
      count: 2,
      from,
    })!;
    // Next birthday: 2027-03-04, give or take the calendar drift.
    const first = new Date(result.hits[0].utc).getTime();
    expect(Math.abs(first - Date.UTC(2027, 2, 4))).toBeLessThan(2 * DAY_MS);
    // Consecutive returns are one tropical year apart.
    const second = new Date(result.hits[1].utc).getTime();
    expect((second - first) / DAY_MS).toBeCloseTo(365.24, 0);
    expect(result.truncated).toBe(false);
    expect(result.natal.version).toBe(1);
  });

  it("spaces transiting-Moon conjunctions one sidereal month apart and honors count", () => {
    const from = new Date(Date.UTC(2026, 7, 13));
    const result = computeAspectSearch(NATAL, 1, {
      planet: "moon",
      target: "venus",
      aspect: "conjunction",
      count: 4,
      from,
    })!;
    expect(result.hits).toHaveLength(4);
    for (let i = 1; i < result.hits.length; i++) {
      const gap =
        (new Date(result.hits[i].utc).getTime() -
          new Date(result.hits[i - 1].utc).getTime()) /
        DAY_MS;
      expect(gap).toBeGreaterThan(26);
      expect(gap).toBeLessThan(29);
    }
  });

  it("returns time-ascending hits with retrograde passes tagged", () => {
    // Six Mercury conjunctions span ~2 years and at least one Rx loop, so
    // some hit lands mid-retrograde.
    const result = computeAspectSearch(NATAL, 1, {
      planet: "mercury",
      target: "sun",
      aspect: "conjunction",
      count: 6,
      from: new Date(Date.UTC(2026, 0, 1)),
    })!;
    expect(result.hits).toHaveLength(6);
    for (let i = 1; i < result.hits.length; i++) {
      expect(result.hits[i].utc > result.hits[i - 1].utc).toBe(true);
    }
    expect(result.hits.some((h) => h.retrograde)).toBe(true);
    expect(result.hits.some((h) => !h.retrograde)).toBe(true);
  });

  it("targets the natal Ascendant when the chart has houses", () => {
    const result = computeAspectSearch(NATAL, 1, {
      planet: "sun",
      target: "ascendant",
      aspect: "conjunction",
      count: 1,
      from: new Date(Date.UTC(2026, 7, 13)),
    })!;
    expect(result.hits).toHaveLength(1);
    // The Sun crosses every longitude yearly.
    const gap =
      new Date(result.hits[0].utc).getTime() - Date.UTC(2026, 7, 13);
    expect(gap).toBeLessThan(367 * DAY_MS);
  });

  it("returns null for an angle target on a houseless solar chart", () => {
    const solar = chartOf(new Date(Date.UTC(1990, 2, 4, 12, 0, 0)), "unknown");
    const result = computeAspectSearch(solar, 1, {
      planet: "sun",
      target: "mc",
      aspect: "conjunction",
      count: 1,
      from: new Date(Date.UTC(2026, 7, 13)),
    });
    expect(result).toBeNull();
  });

  it("truncates at the ephemeris cap instead of erroring", () => {
    const result = computeAspectSearch(NATAL, 1, {
      planet: "saturn",
      target: "sun",
      aspect: "conjunction",
      count: 10,
      from: new Date(Date.UTC(2195, 0, 1)),
    })!;
    expect(result.truncated).toBe(true);
    expect(result.hits.length).toBeLessThan(10);
    for (const h of result.hits) {
      expect(h.utc < "2201-01-01").toBe(true);
    }
  });

  it("clamps the start to the ephemeris floor", () => {
    const result = computeAspectSearch(NATAL, 1, {
      planet: "sun",
      target: "sun",
      aspect: "conjunction",
      count: 1,
      from: new Date(Date.UTC(1600, 0, 1)),
    })!;
    expect(result.from).toBe("1700-01-01T00:00:00.000Z");
  });
});
