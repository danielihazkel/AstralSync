import { buildChart, separation } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import {
  computeCycles,
  computeLunarReturn,
  computeProgressions,
  computeSolarReturn,
} from "./cycles";
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

const NATAL = chartOf(new Date(Date.UTC(1990, 2, 4, 10, 30, 0)));

describe("computeProgressions", () => {
  it("advances one ephemeris day per tropical year of age", () => {
    // Exactly 30 tropical years after birth → progressed instant is 30 days
    // after birth.
    const at = new Date(
      Date.UTC(1990, 2, 4, 10, 30, 0) + 30 * 365.2425 * 86_400_000,
    );
    const prog = computeProgressions(NATAL, at);
    expect(prog.ageYears).toBeCloseTo(30, 6);
    expect(new Date(prog.progressedUtc).getTime()).toBeCloseTo(
      Date.UTC(1990, 2, 4, 10, 30, 0) + 30 * 86_400_000,
      -3,
    );
    // The progressed Sun has moved roughly 1°/year: ~30° past natal.
    const natalSun = NATAL.placements.find((p) => p.planet === "sun")!;
    const progSun = prog.placements.find((p) => p.planet === "sun")!;
    expect(separation(progSun.longitude, natalSun.longitude)).toBeGreaterThan(27);
    expect(separation(progSun.longitude, natalSun.longitude)).toBeLessThan(33);
  });

  it("overlays natal houses and sorts contacts by orb", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    const prog = computeProgressions(NATAL, at);
    expect(prog.placements.every((p) => p.house !== null)).toBe(true);
    for (let i = 1; i < prog.crossAspects.length; i++) {
      expect(prog.crossAspects[i].orb).toBeGreaterThanOrEqual(
        prog.crossAspects[i - 1].orb,
      );
    }
  });

  it("leaves houses null against a solar natal chart", () => {
    const solar = chartOf(new Date(Date.UTC(1990, 2, 4, 12, 0, 0)), "unknown");
    const prog = computeProgressions(solar, new Date(Date.UTC(2026, 7, 13)));
    expect(prog.placements.every((p) => p.house === null)).toBe(true);
  });
});

describe("computeSolarReturn", () => {
  it("returns a chart whose Sun matches the natal Sun longitude", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    const sr = computeSolarReturn(NATAL, at)!;
    expect(sr).not.toBeNull();
    const natalSun = NATAL.placements.find((p) => p.planet === "sun")!;
    const srSun = sr.chart.placements.find((p) => p.planet === "sun")!;
    expect(separation(srSun.longitude, natalSun.longitude)).toBeLessThan(0.01);
  });

  it("picks the most recent return not after `at`", () => {
    // Just before the 2026 birthday: the 2025 return is the current one.
    const before = computeSolarReturn(NATAL, new Date(Date.UTC(2026, 1, 1)))!;
    expect(before.year).toBe(2025);
    // Well after the 2026 birthday: the 2026 return.
    const after = computeSolarReturn(NATAL, new Date(Date.UTC(2026, 7, 13)))!;
    expect(after.year).toBe(2026);
    expect(new Date(after.returnUtc).getUTCFullYear()).toBe(2026);
    // The return lands within ~2 days of the calendar birthday.
    const birthday = Date.UTC(2026, 2, 4, 10, 30, 0);
    expect(
      Math.abs(new Date(after.returnUtc).getTime() - birthday),
    ).toBeLessThan(2 * 86_400_000);
  });

  it("casts full houses for the birth location", () => {
    const sr = computeSolarReturn(NATAL, new Date(Date.UTC(2026, 7, 13)))!;
    expect(sr.chart.houses).not.toBeNull();
    expect(sr.chart.input.latitude).toBe(51.48);
    expect(sr.chart.isSolarChart).toBe(false);
  });
});

describe("computeLunarReturn", () => {
  const DAY_MS = 86_400_000;
  const at = new Date(Date.UTC(2026, 7, 13));

  it("returns a chart whose Moon matches the natal Moon longitude", () => {
    const lr = computeLunarReturn(NATAL, at)!;
    expect(lr).not.toBeNull();
    const natalMoon = NATAL.placements.find((p) => p.planet === "moon")!;
    const lrMoon = lr.chart.placements.find((p) => p.planet === "moon")!;
    expect(separation(lrMoon.longitude, natalMoon.longitude)).toBeLessThan(0.01);
  });

  it("picks the most recent return not after `at`, within one sidereal month", () => {
    const lr = computeLunarReturn(NATAL, at)!;
    const returnMs = new Date(lr.returnUtc).getTime();
    expect(returnMs).toBeLessThanOrEqual(at.getTime());
    expect(at.getTime() - returnMs).toBeLessThan(27.6 * DAY_MS);
  });

  it("finds the next return one sidereal month after the current one", () => {
    const lr = computeLunarReturn(NATAL, at)!;
    const gap =
      new Date(lr.nextReturnUtc).getTime() - new Date(lr.returnUtc).getTime();
    expect(gap).toBeGreaterThan(27.0 * DAY_MS);
    expect(gap).toBeLessThan(27.7 * DAY_MS);
    expect(new Date(lr.nextReturnUtc).getTime()).toBeGreaterThan(at.getTime());
  });

  it("casts full houses for the birth location and is deterministic", () => {
    const lr = computeLunarReturn(NATAL, at)!;
    expect(lr.chart.houses).not.toBeNull();
    expect(lr.chart.input.latitude).toBe(51.48);
    expect(computeLunarReturn(NATAL, at)).toEqual(lr);
  });
});

describe("computeCycles", () => {
  it("assembles the full view with natal flags and engine info", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    const view = computeCycles(NATAL, 3, at)!;
    expect(view.computedAt).toBe(at.toISOString());
    expect(view.natal).toEqual({
      version: 3,
      isSolarChart: false,
      moonUncertain: false,
    });
    expect(view.progressions.placements).toHaveLength(10);
    expect(view.solarReturn.year).toBe(2026);
    expect(view.lunarReturn).not.toBeNull();
    expect(view.engine.name).toBe("astronomy-engine");
  });

  it("is deterministic for a fixed instant", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    expect(computeCycles(NATAL, 1, at)).toEqual(computeCycles(NATAL, 1, at));
  });
});
