import { buildChart, separation } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import {
  computeTertiaryProgressions,
  computeCycles,
  computeLunarReturn,
  computePlanetaryReturn,
  computeProgressions,
  computeSolarArc,
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

  it("casts a full progressed chart at the progressed instant", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    const prog = computeProgressions(NATAL, at);
    expect(prog.chart.input.utc).toBe(prog.progressedUtc);
    expect(prog.chart.input.latitude).toBe(51.48);
    expect(prog.chart.isSolarChart).toBe(false);
    expect(prog.chart.houses).not.toBeNull();
    // Same instant, same pipeline: the chart's planets sit exactly where the
    // overlay placements do.
    for (const p of prog.placements) {
      const cp = prog.chart.placements.find((c) => c.planet === p.planet)!;
      expect(cp.longitude).toBe(p.longitude);
    }
  });

  it("advances the progressed MC about one degree per year of age", () => {
    // At exactly age 30 the progressed instant is 30 days past birth; the
    // MC (like the RAMC) advances roughly 1°/day of progression.
    const at = new Date(
      Date.UTC(1990, 2, 4, 10, 30, 0) + 30 * 365.2425 * 86_400_000,
    );
    const prog = computeProgressions(NATAL, at);
    const motion = separation(
      prog.chart.houses!.mc,
      NATAL.houses!.mc,
    );
    expect(motion).toBeGreaterThan(25);
    expect(motion).toBeLessThan(35);
  });

  it("degrades the progressed chart to solar against a solar natal", () => {
    const solar = chartOf(new Date(Date.UTC(1990, 2, 4, 12, 0, 0)), "unknown");
    const prog = computeProgressions(solar, new Date(Date.UTC(2026, 7, 13)));
    expect(prog.chart.isSolarChart).toBe(true);
    expect(prog.chart.houses).toBeNull();
  });
});

describe("computeSolarArc", () => {
  const AT = new Date(Date.UTC(2026, 7, 13));

  it("directs the Sun to exactly the progressed Sun longitude", () => {
    const arc = computeSolarArc(NATAL, AT);
    const prog = computeProgressions(NATAL, AT);
    const directedSun = arc.placements.find((p) => p.planet === "sun")!;
    const progSun = prog.placements.find((p) => p.planet === "sun")!;
    expect(directedSun.longitude).toBeCloseTo(progSun.longitude, 6);
  });

  it("advances every point by the same arc, about a degree per year", () => {
    const arc = computeSolarArc(NATAL, AT);
    const ageYears =
      (AT.getTime() - Date.UTC(1990, 2, 4, 10, 30, 0)) /
      (365.2425 * 86_400_000);
    expect(arc.arcDegrees / ageYears).toBeGreaterThan(0.94);
    expect(arc.arcDegrees / ageYears).toBeLessThan(1.02);
    for (const p of arc.placements) {
      const natalP = NATAL.placements.find((n) => n.planet === p.planet)!;
      const advanced = (natalP.longitude + arc.arcDegrees) % 360;
      expect(separation(p.longitude, advanced)).toBeLessThan(1e-9);
      // The directed chart is symbolic: it mirrors the natal condition.
      expect(p.retrograde).toBe(natalP.retrograde);
    }
  });

  it("reads contacts at the fixed 1° directions orb", () => {
    const arc = computeSolarArc(NATAL, AT);
    for (const c of arc.crossAspects) expect(c.orb).toBeLessThanOrEqual(1);
    for (const c of arc.angleAspects) expect(c.orb).toBeLessThanOrEqual(1);
    for (let i = 1; i < arc.crossAspects.length; i++) {
      expect(arc.crossAspects[i].orb).toBeGreaterThanOrEqual(
        arc.crossAspects[i - 1].orb,
      );
    }
  });

  it("overlays natal houses on the directed placements", () => {
    const arc = computeSolarArc(NATAL, AT);
    for (const p of arc.placements) {
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
    }
  });

  it("degrades houseless with no angle contacts against a solar natal", () => {
    const solar = chartOf(new Date(Date.UTC(1990, 2, 4, 12, 0, 0)), "unknown");
    const arc = computeSolarArc(solar, AT);
    expect(arc.placements.every((p) => p.house === null)).toBe(true);
    expect(arc.angleAspects).toEqual([]);
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

  it("relocates only the houses, never the instant or planets", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    const birth = computeSolarReturn(NATAL, at)!;
    // Sydney vs the Greenwich-latitude birth location: far enough that the
    // Ascendant cannot coincide.
    const home = computeSolarReturn(NATAL, at, {
      latitude: -33.87,
      longitude: 151.21,
    })!;
    expect(birth.relocated).toBe(false);
    expect(home.relocated).toBe(true);
    expect(home.returnUtc).toBe(birth.returnUtc);
    expect(home.year).toBe(birth.year);
    for (const p of home.chart.placements) {
      const bp = birth.chart.placements.find((x) => x.planet === p.planet)!;
      expect(p.longitude).toBe(bp.longitude);
    }
    expect(home.chart.input.latitude).toBe(-33.87);
    expect(
      separation(
        home.chart.houses!.ascendant,
        birth.chart.houses!.ascendant,
      ),
    ).toBeGreaterThan(1);
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
    expect(lr.relocated).toBe(false);
    expect(computeLunarReturn(NATAL, at)).toEqual(lr);
  });

  it("relocates only the houses, never the instant or planets", () => {
    const birth = computeLunarReturn(NATAL, at)!;
    // Sydney vs the Greenwich-latitude birth location: far enough that the
    // Ascendant cannot coincide.
    const home = computeLunarReturn(NATAL, at, {
      latitude: -33.87,
      longitude: 151.21,
    })!;
    expect(birth.relocated).toBe(false);
    expect(home.relocated).toBe(true);
    expect(home.returnUtc).toBe(birth.returnUtc);
    expect(home.nextReturnUtc).toBe(birth.nextReturnUtc);
    for (const p of home.chart.placements) {
      const bp = birth.chart.placements.find((x) => x.planet === p.planet)!;
      expect(p.longitude).toBe(bp.longitude);
    }
    expect(home.chart.input.latitude).toBe(-33.87);
    expect(
      separation(
        home.chart.houses!.ascendant,
        birth.chart.houses!.ascendant,
      ),
    ).toBeGreaterThan(1);
  });
});

describe("computePlanetaryReturn", () => {
  const YEAR_MS = 365.2425 * 86_400_000;
  const at = new Date(Date.UTC(2026, 7, 13));

  it("finds the 1990 natal's first Saturn return in early 2020", () => {
    const r = computePlanetaryReturn(NATAL, at, "saturn");
    expect(new Date(r.lastExactUtc!).getUTCFullYear()).toBe(2020);
    // The return chart's Saturn sits on the natal Saturn longitude.
    const returnSaturn = r.chart!.placements.find((p) => p.planet === "saturn")!;
    expect(separation(returnSaturn.longitude, r.natalLongitude)).toBeLessThan(
      0.01,
    );
    expect(r.chart!.input.latitude).toBe(51.48);
    // The next return is a full cycle out.
    const gap = new Date(r.nextExactUtc!).getTime() - new Date(r.lastExactUtc!).getTime();
    expect(gap / YEAR_MS).toBeGreaterThan(28);
    expect(gap / YEAR_MS).toBeLessThan(31);
  });

  it("spaces Jupiter returns about 11.86 years apart", () => {
    const r = computePlanetaryReturn(NATAL, at, "jupiter");
    expect(r.lastExactUtc).not.toBeNull();
    expect(r.nextExactUtc).not.toBeNull();
    const gap =
      new Date(r.nextExactUtc!).getTime() - new Date(r.lastExactUtc!).getTime();
    expect(gap / YEAR_MS).toBeGreaterThan(10.5);
    expect(gap / YEAR_MS).toBeLessThan(13);
  });

  it("reports a retrograde triple pass as three crossings", () => {
    // Natal Saturn at ~358° Pisces (born 1996-03-20) sits inside Saturn's
    // 2025–26 retrograde loop: passes Apr 2025, Sep 2025, Jan 2026.
    const natal = chartOf(new Date(Date.UTC(1996, 2, 20, 12, 0, 0)));
    const r = computePlanetaryReturn(
      natal,
      new Date(Date.UTC(2026, 0, 1)),
      "saturn",
    );
    expect(r.crossings).toHaveLength(3);
    expect(r.crossings.map((c) => new Date(c).getUTCFullYear())).toEqual([
      2025, 2025, 2026,
    ]);
  });

  it("young chart: null last return and chart, non-null next", () => {
    const kid = chartOf(new Date(Date.UTC(2015, 5, 1, 12, 0, 0)));
    for (const planet of ["jupiter", "saturn"] as const) {
      const r = computePlanetaryReturn(kid, at, planet);
      expect(r.lastExactUtc).toBeNull();
      expect(r.chart).toBeNull();
      expect(r.nextExactUtc).not.toBeNull();
      expect(new Date(r.nextExactUtc!).getTime()).toBeGreaterThan(at.getTime());
    }
  });

  it("is deterministic for a fixed instant", () => {
    expect(computePlanetaryReturn(NATAL, at, "saturn")).toEqual(
      computePlanetaryReturn(NATAL, at, "saturn"),
    );
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
    expect(view.planetaryReturns.map((r) => r.planet)).toEqual([
      "jupiter",
      "saturn",
    ]);
    // Born 1990-03-04, viewed 2026-08-13 → age 36, a 1st-house year again.
    expect(view.profection).not.toBeNull();
    expect(view.profection!.age).toBe(36);
    expect(view.profection!.profectedHouse).toBe(1);
    expect(view.profection!.profectedSign).toBe(NATAL.bigThree.ascendant);
  });

  it("omits the profection on a solar natal chart", () => {
    const solar = chartOf(new Date(Date.UTC(1990, 2, 4, 12, 0, 0)), "unknown");
    const view = computeCycles(solar, 1, new Date(Date.UTC(2026, 7, 13)))!;
    expect(view.profection).toBeNull();
    expect(view.engine.name).toBe("astronomy-engine");
  });

  it("attaches the firdaria for a housed chart and omits it on solar", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    const view = computeCycles(NATAL, 1, at)!;
    // 1990-03-04 10:30 UT in Greenwich is a day birth (Sun above the
    // horizon); at age 36 a day chart sits in the Moon major period
    // (Sun 0–10, Venus 10–18, Mercury 18–31, Moon 31–40).
    expect(view.firdaria).not.toBeNull();
    expect(view.firdaria!.isDay).toBe(true);
    expect(view.firdaria!.major.lord).toBe("moon");
    expect(view.firdaria!.sub).not.toBeNull();
    expect(view.firdaria!.cycle).toHaveLength(9);

    const solar = chartOf(new Date(Date.UTC(1990, 2, 4, 12, 0, 0)), "unknown");
    expect(
      computeCycles(solar, 1, at)!.firdaria,
    ).toBeNull();
  });

  it("is deterministic for a fixed instant", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    expect(computeCycles(NATAL, 1, at)).toEqual(computeCycles(NATAL, 1, at));
  });
});

describe("computeTertiaryProgressions", () => {
  it("advances one day per tropical month and reads natal contacts", () => {
    const at = new Date(Date.UTC(2026, 7, 13));
    const t = computeTertiaryProgressions(NATAL, at);
    const natalUtc = new Date(NATAL.input.utc);
    const ageDays = (at.getTime() - natalUtc.getTime()) / 86_400_000;
    expect(t.ageMonths).toBeCloseTo(ageDays / 27.321582, 3);
    const offsetDays =
      (Date.parse(t.progressedUtc) - natalUtc.getTime()) / 86_400_000;
    expect(offsetDays).toBeCloseTo(t.ageMonths, 6);
    expect(t.placements).toHaveLength(10);
    // Sorted by orb, never wider than the default transit orbs.
    for (let i = 1; i < t.crossAspects.length; i++) {
      expect(t.crossAspects[i].orb).toBeGreaterThanOrEqual(t.crossAspects[i - 1].orb);
    }
    for (const c of t.crossAspects) expect(c.orb).toBeLessThanOrEqual(3);
  });
});

describe("computeProgressedLunation", () => {
  it("names the phase and maps the turning points back to real time", () => {
    const natalUtc = new Date(NATAL.input.utc);
    const at = new Date(Date.UTC(2026, 7, 13));
    const prog = computeProgressions(NATAL, at);
    const l = prog.lunation;
    expect(l.phaseDeg).toBeGreaterThanOrEqual(0);
    expect(l.phaseDeg).toBeLessThan(360);
    expect(l.waxing).toBe(l.phaseDeg < 180);
    // Turning points are ordered and span decades, not days: the last New
    // Moon precedes now, the next Full/New follow, ~15/30 years apart.
    const last = Date.parse(l.lastNewMoonUtc);
    const nextNew = Date.parse(l.nextNewMoonUtc);
    const nextFull = Date.parse(l.nextFullMoonUtc);
    expect(last).toBeLessThanOrEqual(at.getTime());
    expect(nextNew).toBeGreaterThan(at.getTime());
    expect(nextFull).toBeGreaterThan(at.getTime());
    const years = (nextNew - last) / (365.2425 * 86_400_000);
    expect(years).toBeGreaterThan(28);
    expect(years).toBeLessThan(31);
    expect(last).toBeGreaterThan(natalUtc.getTime() - 31 * 365.25 * 86_400_000);
  });
});
