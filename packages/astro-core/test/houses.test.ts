import { describe, expect, it } from "vitest";
import {
  ascendant,
  eastPoint,
  vertex,
  angleDiff,
  buildChart,
  equalHouses,
  houseOf,
  norm360,
  wholeSignHouses,
} from "../src";

describe("house systems", () => {
  const base = {
    utc: new Date(Date.UTC(1990, 5, 15, 14, 30, 0)),
    latitude: 40.7,
    longitude: -74.0,
  };

  it("Placidus: cusp 1 = Ascendant, cusp 10 = MC, cusps advance monotonically", () => {
    const chart = buildChart({ ...base, houseSystem: "placidus" });
    const h = chart.houses!;
    expect(h.system).toBe("placidus");
    expect(h.fallbackApplied).toBe(false);
    expect(h.cusps[0]).toBeCloseTo(h.ascendant, 6);
    expect(h.cusps[9]).toBeCloseTo(h.mc, 6);
    // each cusp lies strictly ahead of the previous, and the 12 gaps sum to 360
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const gap = norm360(h.cusps[(i + 1) % 12] - h.cusps[i]);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(120);
      total += gap;
    }
    expect(total).toBeCloseTo(360, 6);
  });

  it("Placidus at the equator reduces to equal 30° arcs in right ascension", () => {
    // At φ=0 the ascensional difference vanishes; opposite cusps differ by 180°.
    const chart = buildChart({ ...base, latitude: 0, houseSystem: "placidus" });
    const h = chart.houses!;
    for (let i = 0; i < 6; i++) {
      expect(Math.abs(angleDiff(h.cusps[i + 6], h.cusps[i] + 180))).toBeLessThan(1e-6);
    }
  });

  it("falls back to Whole Sign at high latitude (Svalbard, 78°N)", () => {
    const chart = buildChart({ ...base, latitude: 78, houseSystem: "placidus" });
    const h = chart.houses!;
    expect(h.system).toBe("whole_sign");
    expect(h.requestedSystem).toBe("placidus");
    expect(h.fallbackApplied).toBe(true);
    expect(chart.uncertainties.some((u) => u.field === "houses")).toBe(true);
    for (const cusp of h.cusps) expect(cusp % 30).toBe(0);
  });

  it("Whole Sign cusps start at 0° of the rising sign", () => {
    const cusps = wholeSignHouses(101.6); // 11.6° Cancer rising
    expect(cusps[0]).toBe(90);
    expect(cusps[3]).toBe(180);
    expect(cusps).toHaveLength(12);
  });

  it("Equal House cusps step 30° from the exact Ascendant", () => {
    const cusps = equalHouses(101.6);
    expect(cusps[0]).toBeCloseTo(101.6);
    expect(cusps[11]).toBeCloseTo(norm360(101.6 + 330));
  });

  it("houseOf assigns longitudes across the 0° Aries wrap", () => {
    const cusps = equalHouses(350); // house 1 spans 350°–20°
    expect(houseOf(355, cusps)).toBe(1);
    expect(houseOf(10, cusps)).toBe(1);
    expect(houseOf(25, cusps)).toBe(2);
    expect(houseOf(349, cusps)).toBe(12);
  });
});

describe("quadrant house systems (Batch O)", () => {
  const base = {
    utc: new Date(Date.UTC(1990, 5, 15, 14, 30, 0)),
    latitude: 40.7,
    longitude: -74.0,
  };
  const systems = [
    "porphyry",
    "koch",
    "regiomontanus",
    "campanus",
    "alcabitius",
  ] as const;

  for (const system of systems) {
    it(`${system}: angles anchored, cusps ordered, opposites exact`, () => {
      const chart = buildChart({ ...base, houseSystem: system });
      const h = chart.houses!;
      expect(h.system).toBe(system);
      expect(h.fallbackApplied).toBe(false);
      expect(Math.abs(angleDiff(h.cusps[0], h.ascendant))).toBeLessThan(1e-6);
      expect(Math.abs(angleDiff(h.cusps[9], h.mc))).toBeLessThan(1e-6);
      let total = 0;
      for (let i = 0; i < 12; i++) {
        const gap = norm360(h.cusps[(i + 1) % 12] - h.cusps[i]);
        expect(gap).toBeGreaterThan(0);
        total += gap;
      }
      expect(total).toBeCloseTo(360, 6);
      for (let i = 0; i < 6; i++) {
        expect(
          Math.abs(angleDiff(h.cusps[i + 6], h.cusps[i] + 180)),
        ).toBeLessThan(1e-6);
      }
    });
  }

  it("every quadrant system agrees at the equator (AD vanishes)", () => {
    const reference = buildChart({
      ...base,
      latitude: 0,
      houseSystem: "placidus",
    }).houses!;
    for (const system of ["koch", "regiomontanus", "campanus", "alcabitius"] as const) {
      const h = buildChart({ ...base, latitude: 0, houseSystem: system }).houses!;
      for (let i = 0; i < 12; i++) {
        expect
          .soft(Math.abs(angleDiff(h.cusps[i], reference.cusps[i])))
          .toBeLessThan(1e-6);
      }
    }
  });

  it("porphyry trisects the ecliptic quadrants exactly", () => {
    const h = buildChart({ ...base, houseSystem: "porphyry" }).houses!;
    const upper = norm360(h.ascendant - h.mc);
    expect(Math.abs(angleDiff(h.cusps[10], h.mc + upper / 3))).toBeLessThan(1e-9);
    expect(
      Math.abs(angleDiff(h.cusps[1], h.ascendant + (180 - upper) / 3)),
    ).toBeLessThan(1e-9);
  });

  it("koch falls back to Whole Sign when the MC degree is circumpolar", () => {
    const chart = buildChart({ ...base, latitude: 78, houseSystem: "koch" });
    expect(chart.houses!.system).toBe("whole_sign");
    expect(chart.houses!.fallbackApplied).toBe(true);
  });

  it("alcabitius stays defined at high latitude (the rising degree is never circumpolar)", () => {
    const chart = buildChart({
      ...base,
      latitude: 78,
      houseSystem: "alcabitius",
    });
    const h = chart.houses!;
    expect(h.system).toBe("alcabitius");
    expect(h.fallbackApplied).toBe(false);
    let total = 0;
    for (let i = 0; i < 12; i++) {
      total += norm360(h.cusps[(i + 1) % 12] - h.cusps[i]);
    }
    expect(total).toBeCloseTo(360, 6);
  });

  it("porphyry never falls back", () => {
    const chart = buildChart({ ...base, latitude: 78, houseSystem: "porphyry" });
    expect(chart.houses!.system).toBe("porphyry");
    expect(chart.houses!.fallbackApplied).toBe(false);
  });
});

describe("vertex and east point", () => {
  // Mid-latitude test instant; RAMC arbitrary.
  const eps = 23.4368;

  it("the vertex lies on the prime vertical, west of the meridian", () => {
    for (const [ramc, lat] of [
      [123.4, 51.48],
      [10, 40.7],
      [300, -35],
      [222, -10],
    ] as const) {
      const vx = vertex(ramc, lat, eps);
      // Equatorial direction of the ecliptic point at longitude vx.
      const l = vx * (Math.PI / 180);
      const e = eps * (Math.PI / 180);
      const dir = {
        x: Math.cos(l),
        y: Math.sin(l) * Math.cos(e),
        z: Math.sin(l) * Math.sin(e),
      };
      // Prime vertical plane normal: zenith × east point.
      const r = ramc * (Math.PI / 180);
      const f = lat * (Math.PI / 180);
      const zenith = {
        x: Math.cos(f) * Math.cos(r),
        y: Math.cos(f) * Math.sin(r),
        z: Math.sin(f),
      };
      const east = { x: -Math.sin(r), y: Math.cos(r), z: 0 };
      const n = {
        x: zenith.y * east.z - zenith.z * east.y,
        y: zenith.z * east.x - zenith.x * east.z,
        z: zenith.x * east.y - zenith.y * east.x,
      };
      const dot = n.x * dir.x + n.y * dir.y + n.z * dir.z;
      expect(Math.abs(dot)).toBeLessThan(1e-9);
      // Western half: the point's projection on the east direction is negative.
      const eastness = east.x * dir.x + east.y * dir.y + east.z * dir.z;
      expect(eastness).toBeLessThan(0);
    }
  });

  it("the east point is the equatorial ascendant", () => {
    const ramc = 123.4;
    expect(
      Math.abs(angleDiff(eastPoint(ramc, eps), ascendant(ramc, 0, eps))),
    ).toBeLessThan(1e-9);
  });
});
