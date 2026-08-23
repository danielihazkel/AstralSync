import * as Astronomy from "astronomy-engine";
import { describe, expect, it } from "vitest";
import {
  astronomyEngineProvider as eph,
  findAspectHits,
  findIngresses,
  findLongitudeCrossings,
  findMundaneAspects,
  findStations,
  separation,
} from "../src";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function utc(
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
}

describe("findAspectHits", () => {
  it("finds the Sun–Moon conjunction of the 2024-04-08 eclipse", () => {
    // Golden fixture instant: total solar eclipse, peak 18:17 UT. The exact
    // Sun–Moon longitude conjunction falls within minutes of the peak.
    const hits = findAspectHits(
      (t) => eph.eclipticLongitude("moon", t),
      (t) => eph.eclipticLongitude("sun", t),
      [0],
      utc(2024, 4, 7),
      utc(2024, 4, 10),
      HOUR_MS,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].angle).toBe(0);
    const peak = utc(2024, 4, 8, 18, 17).getTime();
    expect(Math.abs(hits[0].utc.getTime() - peak)).toBeLessThan(30 * 60_000);
  });

  it("finds every major lunar aspect to the Sun across a lunation", () => {
    // One synodic month holds exactly one of each: two squares (waxing,
    // waning), two trines, two sextiles, one opposition, plus conjunctions
    // at either end. Scan new moon → new moon (2024-04-08 → 2024-05-08).
    const hits = findAspectHits(
      (t) => eph.eclipticLongitude("moon", t),
      (t) => eph.eclipticLongitude("sun", t),
      [0, 60, 90, 120, 180],
      utc(2024, 4, 9),
      utc(2024, 5, 7),
      HOUR_MS,
    );
    const byAngle = (a: number) => hits.filter((h) => h.angle === a).length;
    expect(byAngle(60)).toBe(2);
    expect(byAngle(90)).toBe(2);
    expect(byAngle(120)).toBe(2);
    expect(byAngle(180)).toBe(1);
    expect(byAngle(0)).toBe(0);
  });

  it("supports a fixed natal longitude as the reference", () => {
    const natalSun = 19.398; // 2024-04-08 golden fixture Sun, ~19°24' Aries
    const hits = findAspectHits(
      (t) => eph.eclipticLongitude("sun", t),
      () => natalSun,
      [0],
      utc(2025, 4, 1),
      utc(2025, 4, 15),
      DAY_MS,
    );
    // The solar return: one conjunction, within a day of April 8.
    expect(hits).toHaveLength(1);
    expect(
      Math.abs(hits[0].utc.getTime() - utc(2025, 4, 9).getTime()),
    ).toBeLessThan(2 * DAY_MS);
  });
});

describe("findLongitudeCrossings", () => {
  it("finds Saturn's triple pass over 0° Aries (2025 retrograde loop)", () => {
    // Saturn enters Aries 2025-05-25, retrogrades back into Pisces
    // 2025-09-01, re-enters Aries 2026-02-14.
    const hits = findLongitudeCrossings(
      (t) => eph.eclipticLongitude("saturn", t),
      [0],
      utc(2025, 1, 1),
      utc(2026, 6, 1),
      10 * DAY_MS,
    );
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.ascending)).toEqual([true, false, true]);
    const months = hits.map(
      (h) => `${h.utc.getUTCFullYear()}-${h.utc.getUTCMonth() + 1}`,
    );
    expect(months).toEqual(["2025-5", "2025-9", "2026-2"]);
  });

  it("keeps a crossing that lands exactly on a sample instant", () => {
    // A linear 1°/hour motion through the target at exactly the second
    // sample: the strict sign-change bracket sees (−1)·0 and 0·(+1), never a
    // negative product, so the exact-sample branch must claim the hit.
    const t0 = utc(2024, 1, 1).getTime();
    const hits = findLongitudeCrossings(
      (t) => 100 + (t.getTime() - t0) / 3_600_000 - 2, // crosses 100 at +2h
      [100],
      new Date(t0),
      new Date(t0 + 6 * 3_600_000),
      3_600_000,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].utc.getTime()).toBe(t0 + 2 * 3_600_000);
    expect(hits[0].ascending).toBe(true);
  });

  it("evaluates valueAt once per sample, not once per target", () => {
    // Perf regression pin: the ephemeris evaluation is the dominant cost of
    // every scan, so it must be shared across targets. A constant value far
    // from every target crosses nothing, so no refinement calls happen and
    // the count is exactly one per coarse sample.
    let calls = 0;
    const steps = 10;
    findLongitudeCrossings(
      () => {
        calls++;
        return 45;
      },
      [0, 90, 180, 270],
      utc(2024, 4, 1),
      new Date(utc(2024, 4, 1).getTime() + steps * DAY_MS),
      DAY_MS,
    );
    expect(calls).toBe(steps + 1);
  });

  it("refines crossings to well under a minute of arc", () => {
    const hits = findLongitudeCrossings(
      (t) => eph.eclipticLongitude("moon", t),
      [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
      utc(2024, 4, 1),
      utc(2024, 4, 15),
      6 * HOUR_MS,
    );
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(
        separation(eph.eclipticLongitude("moon", h.utc), h.target),
      ).toBeLessThan(1 / 3600);
    }
  });
});

describe("findIngresses", () => {
  it("finds the Moon's ~13-14 sign ingresses in April 2024, in order", () => {
    const hits = findIngresses("moon", utc(2024, 4, 1), utc(2024, 5, 1));
    expect(hits.length).toBeGreaterThanOrEqual(13);
    expect(hits.length).toBeLessThanOrEqual(14);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].utc.getTime()).toBeGreaterThan(hits[i - 1].utc.getTime());
      // Consecutive ingresses step one sign forward.
      expect(hits[i].signIndex).toBe((hits[i - 1].signIndex + 1) % 12);
    }
  });

  it("reports the entered sign for a retrograde boundary crossing", () => {
    // Saturn's 2025-09-01 descending crossing of 0° Aries re-enters Pisces.
    const hits = findIngresses("saturn", utc(2025, 8, 1), utc(2025, 10, 1));
    expect(hits).toHaveLength(1);
    expect(hits[0].ascending).toBe(false);
    expect(hits[0].signIndex).toBe(11); // pisces
  });
});

describe("findStations", () => {
  it("finds Mercury's 2023 spring station pair to within a day", () => {
    // Mercury stationed retrograde 2023-04-21 and direct 2023-05-15.
    const events = findStations(utc(2023, 4, 1), utc(2023, 5, 31), ["mercury"]);
    expect(events).toHaveLength(2);
    expect(events[0].direction).toBe("retrograde");
    expect(events[1].direction).toBe("direct");
    expect(
      Math.abs(events[0].utc.getTime() - utc(2023, 4, 21).getTime()),
    ).toBeLessThan(2 * DAY_MS);
    expect(
      Math.abs(events[1].utc.getTime() - utc(2023, 5, 15).getTime()),
    ).toBeLessThan(2 * DAY_MS);
  });

  it("finds no station for planets moving steadily", () => {
    // Venus ran direct through all of 2022 H2? No — use a quiet window:
    // Venus was direct (no station) across March–April 2024.
    const events = findStations(utc(2024, 3, 1), utc(2024, 4, 30), ["venus"]);
    expect(events).toHaveLength(0);
  });
});

describe("findMundaneAspects", () => {
  it("agrees with the lunar quarters (quarters ARE Sun–Moon aspects)", () => {
    const hits = findMundaneAspects(utc(2024, 4, 1), utc(2024, 5, 1), {
      planets: ["sun", "moon"],
      angles: [0, 90, 180],
    });
    let q = Astronomy.SearchMoonQuarter(utc(2024, 4, 1));
    let quarters = 0;
    while (q.time.date.getTime() < utc(2024, 5, 1).getTime()) {
      quarters++;
      const match = hits.find(
        (h) => Math.abs(h.utc.getTime() - q.time.date.getTime()) < 2 * 60_000,
      );
      expect(match, `quarter at ${q.time.date.toISOString()}`).toBeDefined();
      q = Astronomy.NextMoonQuarter(q);
    }
    expect(quarters).toBeGreaterThanOrEqual(4);
    // Nothing beyond the quarters: one hit per quarter, no extras.
    expect(hits).toHaveLength(quarters);
  });

  it("finds the 2024-04-21 Jupiter–Uranus conjunction, faster body first", () => {
    const hits = findMundaneAspects(utc(2024, 4, 1), utc(2024, 5, 1), {
      planets: ["jupiter", "uranus"],
      angles: [0],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].a).toBe("jupiter");
    expect(hits[0].b).toBe("uranus");
    expect(hits[0].angle).toBe(0);
    expect(["2024-04-20", "2024-04-21"]).toContain(
      hits[0].utc.toISOString().slice(0, 10),
    );
  });

  it("returns hits whose separation is exact, in time order", () => {
    const hits = findMundaneAspects(utc(2024, 4, 8), utc(2024, 4, 9), {
      planets: ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "moon"],
    });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      const sep = separation(
        eph.eclipticLongitude(h.a, h.utc),
        eph.eclipticLongitude(h.b, h.utc),
      );
      expect(Math.abs(sep - h.angle), `${h.a}-${h.b}`).toBeLessThan(1e-3);
    }
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].utc.getTime()).toBeGreaterThanOrEqual(
        hits[i - 1].utc.getTime(),
      );
    }
  });
});
