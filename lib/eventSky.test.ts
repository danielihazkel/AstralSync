import { describe, expect, it } from "vitest";
import type { CrossAspect, Placement } from "@astralsync/astro-core";
import {
  FAST_MOVERS,
  filterAspectsForPrecision,
  filterPlacementsForPrecision,
  meaningfulAtPrecision,
  precisionCaveat,
  timeLordLines,
  type EventCyclesInput,
} from "./eventSky";

function aspect(a: string): CrossAspect {
  return {
    a,
    b: "sun",
    type: "square",
    angle: 90,
    orb: 1,
  } as unknown as CrossAspect;
}

function placement(planet: string): Placement {
  return {
    planet,
    longitude: 0,
    sign: "aries",
    degreeInSign: 0,
    house: null,
    retrograde: false,
  } as unknown as Placement;
}

describe("precision honesty", () => {
  it("shows everything for a day-precision event", () => {
    for (const p of [...FAST_MOVERS, "saturn", "pluto"] as const) {
      expect(meaningfulAtPrecision(p as never, "day")).toBe(true);
    }
    expect(precisionCaveat("day")).toBeNull();
  });

  it("hides the fast movers once the date is only a month or a year", () => {
    // A "2014" event is stored as 2014-01-01: the Moon's position there is
    // an artefact of the storage convention, not a fact about the event.
    for (const precision of ["month", "year"] as const) {
      expect(meaningfulAtPrecision("moon" as never, precision)).toBe(false);
      expect(meaningfulAtPrecision("venus" as never, precision)).toBe(false);
      expect(meaningfulAtPrecision("mars" as never, precision)).toBe(false);
      expect(meaningfulAtPrecision("saturn" as never, precision)).toBe(true);
      expect(meaningfulAtPrecision("pluto" as never, precision)).toBe(true);
    }
  });

  it("filters aspect rows by the moving body, not the natal target", () => {
    const rows = [aspect("moon"), aspect("saturn"), aspect("pluto")];
    expect(filterAspectsForPrecision(rows, "day")).toHaveLength(3);
    const filtered = filterAspectsForPrecision(rows, "year");
    expect(filtered.map((r) => r.a)).toEqual(["saturn", "pluto"]);
  });

  it("filters the positions table the same way", () => {
    const rows = [placement("sun"), placement("jupiter")];
    expect(filterPlacementsForPrecision(rows, "day")).toHaveLength(2);
    expect(
      filterPlacementsForPrecision(rows, "month").map((p) => p.planet),
    ).toEqual(["jupiter"]);
  });

  it("explains itself whenever it hides something", () => {
    expect(precisionCaveat("month")).toMatch(/month/);
    expect(precisionCaveat("year")).toMatch(/year/);
    // Never silently hides.
    expect(precisionCaveat("month")).toMatch(/hidden/);
  });
});

describe("timeLordLines", () => {
  const full: EventCyclesInput = {
    profection: {
      age: 21,
      profectedHouse: 10,
      profectedSign: "sagittarius",
      yearLord: "jupiter",
    },
    firdaria: {
      major: { lord: "saturn" },
      sub: { lord: "mercury" },
      secondCycle: false,
    },
    zodiacalReleasing: {
      fortune: {
        current: {
          l1: { sign: "aquarius", lord: "saturn", loosedBond: true, angular: "10th" },
          l2: { sign: "pisces", lord: "jupiter", loosedBond: false, angular: null },
        },
      },
      spirit: {
        current: {
          l1: { sign: "leo", lord: "sun", loosedBond: false, angular: null },
        },
      },
    },
    progressions: { placements: [{ planet: "sun", sign: "aries" }] },
  };

  it("names every technique in play, in reading order", () => {
    expect(timeLordLines(full).map((l) => l.kind)).toEqual([
      "profection",
      "firdaria",
      "releasing",
      "releasing",
      "progressed-sun",
    ]);
  });

  it("carries the profection's house, sign and lord as raw keys", () => {
    const [p] = timeLordLines(full);
    // Raw keys, not prose: the component owns the labels so there is only
    // one set of planet and sign names in the app.
    expect(p).toEqual({
      kind: "profection",
      age: 21,
      house: 10,
      sign: "sagittarius",
      lord: "jupiter",
    });
  });

  it("marks a peak period and a loosing of the bond", () => {
    const zr = timeLordLines(full).filter((l) => l.kind === "releasing");
    expect(zr[0]).toMatchObject({
      lot: "fortune",
      sign: "aquarius",
      subSign: "pisces",
      peak: true,
      loosedBond: true,
    });
    expect(zr[1]).toMatchObject({ lot: "spirit", subSign: null, peak: false });
  });

  it("renders a node firdaria period, which takes no sub-lord", () => {
    const f = timeLordLines({
      ...full,
      firdaria: { major: { lord: "north_node" }, sub: null, secondCycle: true },
    }).find((l) => l.kind === "firdaria");
    expect(f).toEqual({
      kind: "firdaria",
      major: "north_node",
      sub: null,
      secondCycle: true,
    });
  });

  it("returns nothing for a solar chart, where none of it applies", () => {
    expect(
      timeLordLines({
        profection: null,
        firdaria: null,
        zodiacalReleasing: null,
        progressions: null,
      }),
    ).toEqual([]);
  });
});
