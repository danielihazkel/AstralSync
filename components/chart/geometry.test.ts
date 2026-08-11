import { describe, expect, it } from "vitest";
import type { WheelChart } from "@/lib/view-types";
import {
  DEFAULT_WHEEL_SIZE,
  GLYPH_MIN_SEPARATION,
  layoutWheel,
  longitudeToScreenAngle,
  norm360,
  polarToXY,
  spreadClusters,
  wheelRotation,
} from "./geometry";

const center = { x: 300, y: 300 };

function dist(p: { x: number; y: number }, q: { x: number; y: number }) {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

function makeChart(overrides: Partial<WheelChart> = {}): WheelChart {
  const houses = {
    system: "placidus" as const,
    requestedSystem: "placidus" as const,
    fallbackApplied: false,
    cusps: Array.from({ length: 12 }, (_, i) => norm360(100 + i * 30)),
    ascendant: 100,
    mc: 10,
  };
  return {
    schemaVersion: 1,
    input: {
      utc: "2000-01-01T12:00:00.000Z",
      latitude: 51.48,
      longitude: 0,
      houseSystem: "placidus",
      timeCertainty: "exact",
    },
    isSolarChart: false,
    houses,
    placements: [
      {
        planet: "sun",
        longitude: 280,
        sign: "capricorn",
        degreeInSign: 10,
        house: 7,
        retrograde: false,
      },
      {
        planet: "moon",
        longitude: 130,
        sign: "leo",
        degreeInSign: 10,
        house: 2,
        retrograde: false,
      },
    ],
    aspects: [
      { a: "sun", b: "moon", type: "trine", angle: 120, orb: 1.2 },
    ],
    bigThree: { sun: "capricorn", moon: "leo", ascendant: "leo" },
    uncertainties: [],
    engine: { name: "test", version: "0" },
    tzWarnings: [],
    ...overrides,
  };
}

describe("longitudeToScreenAngle / wheelRotation", () => {
  it("anchors the Ascendant at 180° (9 o'clock)", () => {
    const chart = makeChart();
    const rot = wheelRotation(chart);
    expect(longitudeToScreenAngle(chart.houses!.ascendant, rot)).toBe(180);
  });

  it("anchors 0° Aries at 180° on a solar chart", () => {
    const chart = makeChart({ houses: null, isSolarChart: true });
    const rot = wheelRotation(chart);
    expect(rot).toBe(0);
    expect(longitudeToScreenAngle(0, rot)).toBe(180);
  });

  it("increases counterclockwise on screen (downward from 9 o'clock)", () => {
    // +10° of zodiac from the Ascendant → screen angle 190 → below center.
    const p = polarToXY(center, 100, longitudeToScreenAngle(110, 100));
    expect(p.x).toBeLessThan(center.x);
    expect(p.y).toBeGreaterThan(center.y);
  });
});

describe("spreadClusters", () => {
  it("is the identity for well-separated angles", () => {
    const angles = [0, 90, 180, 270];
    expect(spreadClusters(angles, 9)).toEqual(angles);
  });

  it("fans a cluster about its centroid, preserving order", () => {
    const out = spreadClusters([100, 101, 102], 9);
    expect(out[0]).toBeCloseTo(92, 5);
    expect(out[1]).toBeCloseTo(101, 5);
    expect(out[2]).toBeCloseTo(110, 5);
  });

  it("enforces minimum separation across the 0° wrap", () => {
    const out = spreadClusters([359, 1], 9);
    expect(out[0]).toBeCloseTo(355.5, 5);
    expect(out[1]).toBeCloseTo(4.5, 5);
    const gap = norm360(out[1] - out[0]);
    expect(gap).toBeCloseTo(9, 5);
  });

  it("keeps singletons untouched", () => {
    expect(spreadClusters([42], 9)).toEqual([42]);
  });
});

describe("layoutWheel", () => {
  const chart = makeChart();
  const layout = layoutWheel(chart);
  const c = layout.center;

  it("produces 12 sign segments in zodiacal order", () => {
    expect(layout.signs.map((s) => s.sign)).toEqual([
      "aries",
      "taurus",
      "gemini",
      "cancer",
      "leo",
      "virgo",
      "libra",
      "scorpio",
      "sagittarius",
      "capricorn",
      "aquarius",
      "pisces",
    ]);
    // Every label sits mid-band.
    const midR = (layout.radii.signInner + layout.radii.outer) / 2;
    for (const s of layout.signs) {
      expect(dist(s.labelPoint, c)).toBeCloseTo(midR, 6);
    }
  });

  it("puts house cusp lines between hub and sign-ring radii", () => {
    expect(layout.houses).toHaveLength(12);
    for (const h of layout.houses!) {
      expect(dist(h.from, c)).toBeCloseTo(layout.radii.hub, 6);
      expect(dist(h.to, c)).toBeCloseTo(layout.radii.signInner, 6);
    }
  });

  it("puts aspect chord endpoints on the hub circle at true angles", () => {
    expect(layout.aspects).toHaveLength(1);
    const a = layout.aspects[0];
    expect(dist(a.from, c)).toBeCloseTo(layout.radii.hub, 6);
    expect(dist(a.to, c)).toBeCloseTo(layout.radii.hub, 6);
    const sun = layout.planets.find((p) => p.planet === "sun")!;
    expect(dist(a.from, polarToXY(c, layout.radii.hub, sun.angle))).toBeCloseTo(
      0,
      6,
    );
  });

  it("keeps glyph display angles at least the minimum separation apart", () => {
    const clustered = makeChart({
      placements: [
        makeChart().placements[0],
        { ...makeChart().placements[1], longitude: 281 },
      ],
    });
    const l = layoutWheel(clustered);
    const [a, b] = l.planets.map((p) => p.displayAngle);
    expect(Math.min(norm360(a - b), norm360(b - a))).toBeGreaterThanOrEqual(
      GLYPH_MIN_SEPARATION - 1e-6,
    );
    // Ticks stay at the true longitudes.
    const sun = l.planets[0];
    expect(sun.angle).not.toBeCloseTo(sun.displayAngle, 1);
  });

  it("omits houses and angles on a solar chart", () => {
    const solar = layoutWheel(makeChart({ houses: null, isSolarChart: true }));
    expect(solar.houses).toBeNull();
    expect(solar.angles).toBeNull();
    expect(solar.size).toBe(DEFAULT_WHEEL_SIZE);
  });
});
