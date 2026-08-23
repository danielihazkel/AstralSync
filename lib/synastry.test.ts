import { buildChart, houseOf, type CrossAspect } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import type { ContentEntry, ContentIndex } from "./content";
import {
  computeComposite,
  computeDavison,
  computeGroupSynastry,
  computeSynastry,
  normalizePair,
  resolveSynastryEntries,
  synastryAspectKey,
  type SynastryInputSide,
} from "./synastry";
import { synastryQuerySchema } from "./validation";
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

function side(
  profileId: number,
  displayName: string,
  chart: WheelChart,
): SynastryInputSide {
  return { profileId, displayName, version: 1, chart };
}

const CHART_A = chartOf(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)));
const CHART_B = chartOf(new Date(Date.UTC(1995, 5, 15, 6, 30, 0)));
const SIDE_A = side(1, "Alice", CHART_A);
const SIDE_B = side(2, "Ben", CHART_B);

describe("computeGroupSynastry", () => {
  const SIDE_C = side(3, "Cora", chartOf(new Date(Date.UTC(1988, 10, 2, 18, 0, 0))));

  it("summarizes every unordered pair, agreeing with the full pair view", () => {
    const group = computeGroupSynastry([SIDE_A, SIDE_B, SIDE_C]);
    expect(group.profiles.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(group.pairs.map((p) => [p.aId, p.bId])).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
    const ab = group.pairs[0];
    const full = computeSynastry(SIDE_A, SIDE_B);
    expect(ab.count).toBe(full.aspects.length);
    expect(ab.strongest).toEqual(full.aspects[0]);
  });

  it("handles fewer than two charts and empty contact sets", () => {
    expect(computeGroupSynastry([SIDE_A]).pairs).toEqual([]);
    expect(computeGroupSynastry([]).profiles).toEqual([]);
  });
});

describe("computeSynastry", () => {
  it("is deterministic and echoes both sides", () => {
    const first = computeSynastry(SIDE_A, SIDE_B);
    const second = computeSynastry(SIDE_A, SIDE_B);
    expect(first).toEqual(second);
    expect(first.a.profileId).toBe(1);
    expect(first.a.displayName).toBe("Alice");
    expect(first.b.profileId).toBe(2);
    expect(first.a.isSolarChart).toBe(false);
    expect(first.b.isSolarChart).toBe(false);
  });

  it("keeps the direction invariant: aspect.a is A's planet, aspect.b is B's", () => {
    const view = computeSynastry(SIDE_A, SIDE_B);
    expect(view.aspects.length).toBeGreaterThan(0);
    const longitudeOf = (chart: WheelChart, planet: string) =>
      chart.placements.find((p) => p.planet === planet)!.longitude;
    for (const c of view.aspects) {
      // The reported orb must be reproducible from A's longitude for `a`
      // and B's longitude for `b` — swapped sides would not line up.
      const sep = Math.abs(
        ((longitudeOf(CHART_A, c.a) - longitudeOf(CHART_B, c.b) + 540) % 360) -
          180,
      );
      expect(Math.abs(sep - c.angle)).toBeCloseTo(c.orb, 6);
    }
  });

  it("includes the midpoint composite view", () => {
    const view = computeSynastry(SIDE_A, SIDE_B);
    const { chart } = view.composite;
    expect(chart.placements).toHaveLength(10);
    expect(chart.houses).toBeNull();
    expect(chart.isSolarChart).toBe(false);
    expect(view.composite.eitherSolar).toBe(false);
    // Each composite planet is equidistant from both natal positions.
    for (const p of chart.placements) {
      const lonA = CHART_A.placements.find((x) => x.planet === p.planet)!.longitude;
      const lonB = CHART_B.placements.find((x) => x.planet === p.planet)!.longitude;
      const sep = (from: number) =>
        Math.abs((((p.longitude - from) % 360) + 540) % 360 - 180);
      expect(sep(lonA)).toBeCloseTo(sep(lonB), 6);
    }
    expect(chart.bigThree.ascendant).toBeNull();
  });

  it("flags the composite when a side is solar or its Moon is uncertain", () => {
    const solar = chartOf(new Date(Date.UTC(1995, 5, 15, 12, 0, 0)), "unknown");
    const composite = computeComposite(CHART_A, solar);
    expect(composite.eitherSolar).toBe(true);
    expect(composite.moonUncertain).toBe(
      solar.uncertainties.some((u) => u.field === "moon_sign"),
    );
  });

  it("sorts aspects by orb, tightest first", () => {
    const view = computeSynastry(SIDE_A, SIDE_B);
    for (let i = 1; i < view.aspects.length; i++) {
      expect(view.aspects[i].orb).toBeGreaterThanOrEqual(
        view.aspects[i - 1].orb,
      );
    }
  });

  it("applies natal orbs (8/6), not the tighter transit orbs", () => {
    const view = computeSynastry(SIDE_A, SIDE_B);
    // Under transit orbs (3/2) no orb could exceed 3.
    expect(view.aspects.some((c) => c.orb > 3)).toBe(true);
    for (const c of view.aspects) {
      const limit =
        c.a === "sun" || c.a === "moon" || c.b === "sun" || c.b === "moon"
          ? 8
          : 6;
      expect(c.orb).toBeLessThanOrEqual(limit);
    }
  });

  it("computes mutual house overlays against the other side's cusps", () => {
    const view = computeSynastry(SIDE_A, SIDE_B);
    for (const sideView of [view.a, view.b]) {
      for (const p of sideView.overlayPlacements) {
        expect(p.house).toBeGreaterThanOrEqual(1);
        expect(p.house).toBeLessThanOrEqual(12);
      }
    }
    // Direction check: A's overlay uses B's cusps (and vice versa).
    for (const p of view.a.overlayPlacements) {
      expect(p.house).toBe(houseOf(p.longitude, CHART_B.houses!.cusps));
    }
    for (const p of view.b.overlayPlacements) {
      expect(p.house).toBe(houseOf(p.longitude, CHART_A.houses!.cusps));
    }
  });

  it("suppresses the overlay toward a solar side without leaking own houses", () => {
    const solarB = side(2, "Ben", chartOf(new Date(Date.UTC(1995, 5, 15)), "unknown"));
    const view = computeSynastry(SIDE_A, solarB);
    expect(view.b.isSolarChart).toBe(true);
    // A-in-B is suppressed (B has no houses) — and must NOT fall back to
    // A's own natal houses, which the stored placements still carry.
    for (const p of view.a.overlayPlacements) expect(p.house).toBeNull();
    // B-in-A still works: B's planets land in A's houses.
    for (const p of view.b.overlayPlacements) {
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
    }
  });

  it("handles a solar A symmetrically", () => {
    const solarA = side(1, "Alice", chartOf(new Date(Date.UTC(2000, 0, 1)), "unknown"));
    const view = computeSynastry(solarA, SIDE_B);
    expect(view.a.isSolarChart).toBe(true);
    for (const p of view.b.overlayPlacements) expect(p.house).toBeNull();
    for (const p of view.a.overlayPlacements) {
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
    }
  });

  it("reports planet-to-angle contacts both directions, sorted by orb", () => {
    const view = computeSynastry(SIDE_A, SIDE_B);
    // Both charts are housed; ten planets against two angles at a 6° orb
    // reliably yields contacts in each direction.
    expect(view.angleContacts.aOnB.length).toBeGreaterThan(0);
    expect(view.angleContacts.bOnA.length).toBeGreaterThan(0);
    for (const list of [view.angleContacts.aOnB, view.angleContacts.bOnA]) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i].orb).toBeGreaterThanOrEqual(list[i - 1].orb);
      }
    }
    // Direction invariant: aOnB pairs A's planet longitudes with B's angles.
    const bAngles = {
      ascendant: CHART_B.houses!.ascendant,
      mc: CHART_B.houses!.mc,
    };
    for (const c of view.angleContacts.aOnB) {
      const lon = CHART_A.placements.find((p) => p.planet === c.planet)!.longitude;
      let sep = Math.abs(((lon - bAngles[c.target]) % 360 + 360) % 360);
      if (sep > 180) sep = 360 - sep;
      expect(Math.abs(sep - c.angle)).toBeCloseTo(c.orb, 6);
    }
  });

  it("yields no angle contacts against a solar side", () => {
    const solarB = side(2, "Ben", chartOf(new Date(Date.UTC(1995, 5, 15)), "unknown"));
    const view = computeSynastry(SIDE_A, solarB);
    expect(view.angleContacts.aOnB).toEqual([]);
    expect(view.angleContacts.bOnA.length).toBeGreaterThan(0);
  });

  it("surfaces moon_sign uncertainty per side", () => {
    const uncertain: WheelChart = {
      ...CHART_A,
      uncertainties: [
        ...CHART_A.uncertainties,
        { field: "moon_sign", reason: "test: Moon near a sign boundary" },
      ],
    };
    const view = computeSynastry(side(1, "Alice", uncertain), SIDE_B);
    expect(view.a.moonUncertain).toBe(true);
    expect(view.b.moonUncertain).toBe(false);
  });
});

describe("computeDavison", () => {
  function chartAt(
    utc: Date,
    latitude: number,
    longitude: number,
    timeCertainty: "exact" | "approx" | "unknown" = "exact",
  ): WheelChart {
    return {
      ...buildChart({ utc, latitude, longitude, timeCertainty }),
      tzWarnings: [],
    };
  }

  it("casts a real chart at the exact time and place midpoint", () => {
    // London 2000-01-01 12:00Z × New York 1995-06-15 06:30Z.
    const a = chartAt(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), 51.5, -0.1);
    const b = chartAt(new Date(Date.UTC(1995, 5, 15, 6, 30, 0)), 40.7, -74.0);
    const view = computeDavison(a, b);
    expect(new Date(view.midpoint.utc).getTime()).toBe(
      (Date.UTC(2000, 0, 1, 12, 0, 0) + Date.UTC(1995, 5, 15, 6, 30, 0)) / 2,
    );
    expect(view.midpoint.latitude).toBeCloseTo(46.1, 6);
    expect(view.midpoint.longitude).toBeCloseTo(-37.05, 6);
    // A real chart: houses, angles, retrogrades all present.
    expect(view.chart.houses).not.toBeNull();
    expect(view.chart.bigThree.ascendant).not.toBeNull();
    expect(view.chart.placements).toHaveLength(10);
    expect(view.chart.input.utc).toBe(view.midpoint.utc);
    expect(view.eitherSolar).toBe(false);
    expect(view.moonUncertain).toBe(false);
  });

  it("takes the shorter arc across the antimeridian", () => {
    // Tokyo (139.7°E) × Honolulu (157.9°W): the midpoint is mid-Pacific
    // (~171°E), not in Africa near 9°W.
    const a = chartAt(new Date(Date.UTC(1990, 0, 1, 0, 0, 0)), 35.7, 139.7);
    const b = chartAt(new Date(Date.UTC(1992, 0, 1, 0, 0, 0)), 21.3, -157.9);
    const view = computeDavison(a, b);
    expect(Math.abs(view.midpoint.longitude)).toBeGreaterThan(90);
    expect(view.midpoint.longitude).toBeLessThanOrEqual(180);
  });

  it("inherits the weaker time certainty", () => {
    const exact = chartAt(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), 51.5, 0);
    const approx = chartAt(
      new Date(Date.UTC(1995, 5, 15, 6, 30, 0)),
      40.7,
      -74.0,
      "approx",
    );
    expect(computeDavison(exact, approx).chart.input.timeCertainty).toBe(
      "approx",
    );
    expect(computeDavison(approx, exact).chart.input.timeCertainty).toBe(
      "approx",
    );

    const solar = chartAt(
      new Date(Date.UTC(1995, 5, 15, 12, 0, 0)),
      40.7,
      -74.0,
      "unknown",
    );
    const view = computeDavison(exact, solar);
    expect(view.chart.isSolarChart).toBe(true);
    expect(view.chart.houses).toBeNull();
    expect(view.eitherSolar).toBe(true);
  });

  it("propagates a natal Moon-sign uncertainty", () => {
    const uncertain: WheelChart = {
      ...CHART_A,
      uncertainties: [
        ...CHART_A.uncertainties,
        { field: "moon_sign", reason: "test: Moon near a sign boundary" },
      ],
    };
    expect(computeDavison(uncertain, CHART_B).moonUncertain).toBe(true);
    expect(computeDavison(CHART_A, CHART_B).moonUncertain).toBe(false);
  });

  it("rides along in computeSynastry", () => {
    const view = computeSynastry(SIDE_A, SIDE_B);
    expect(view.davison.chart.placements).toHaveLength(10);
    expect(view.davison).toEqual(computeDavison(CHART_A, CHART_B));
  });
});

describe("synastryAspectKey", () => {
  it("orders the pair canonically by PLANETS index, slash-segmented", () => {
    // The file synastry_aspect/sun-mars-square.md yields this key
    // (keyFromPath turns filename hyphens into slashes).
    expect(synastryAspectKey("mars", "sun", "square")).toBe(
      "synastry_aspect/sun/mars/square",
    );
    expect(synastryAspectKey("sun", "mars", "square")).toBe(
      "synastry_aspect/sun/mars/square",
    );
    expect(synastryAspectKey("moon", "moon", "conjunction")).toBe(
      "synastry_aspect/moon/moon/conjunction",
    );
  });
});

describe("synastryQuerySchema", () => {
  it("coerces string ids", () => {
    expect(synastryQuerySchema.parse({ a: "1", b: "2" })).toEqual({
      a: 1,
      b: 2,
    });
  });

  it.each([
    [{ a: "1" }, "missing b"],
    [{ a: "0", b: "2" }, "zero"],
    [{ a: "-3", b: "2" }, "negative"],
    [{ a: "1.5", b: "2" }, "float"],
    [{ a: "abc", b: "2" }, "non-numeric"],
    [{ a: "7", b: "7" }, "same profile"],
  ])("rejects %j (%s)", (query, _label) => {
    expect(synastryQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("normalizePair", () => {
  it("orders the smaller id first regardless of input order", () => {
    expect(normalizePair(3, 7)).toEqual([3, 7]);
    expect(normalizePair(7, 3)).toEqual([3, 7]);
    expect(normalizePair(5, 5)).toEqual([5, 5]);
  });
});

describe("resolveSynastryEntries", () => {
  const entry = (key: string): ContentEntry => ({
    key,
    category: key.split("/")[0] as ContentEntry["category"],
    title: key,
    essence: null,
    bodyMd: `body of ${key}`,
  });
  const index = (...keys: string[]): ContentIndex => ({
    version: "test",
    entries: new Map(keys.map((k) => [k, entry(k)])),
  });
  const aspects: CrossAspect[] = [
    { a: "sun", b: "moon", type: "square", angle: 90, orb: 0.5 },
    { a: "venus", b: "mars", type: "trine", angle: 120, orb: 2.0 },
  ];

  it("prefers the synastry entry and falls back to the natal archetype", () => {
    const idx = index(
      "synastry_aspect/sun/moon/square",
      "aspect/sun/moon/square",
      "aspect/venus/mars/trine",
    );
    const entries = resolveSynastryEntries(aspects, idx);
    expect(entries.map((e) => e.key)).toEqual([
      "synastry_aspect/sun/moon/square",
      "aspect/venus/mars/trine",
    ]);
  });

  it("skips pairs with no entry in either library and dedupes", () => {
    const idx = index("aspect/sun/moon/square");
    const doubled = [...aspects, aspects[0]];
    const entries = resolveSynastryEntries(doubled, idx);
    expect(entries.map((e) => e.key)).toEqual(["aspect/sun/moon/square"]);
  });

  it("only considers the tightest `limit` aspects", () => {
    const idx = index("aspect/venus/mars/trine");
    expect(resolveSynastryEntries(aspects, idx, 1)).toEqual([]);
  });
});
