import { buildChart, houseOf, type CrossAspect } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import type { ContentEntry, ContentIndex } from "./content";
import {
  computeComposite,
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
