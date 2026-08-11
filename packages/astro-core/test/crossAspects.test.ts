import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSIT_ORBS,
  detectAspects,
  detectCrossAspects,
  type Placement,
} from "../src";

type Lean = Pick<Placement, "planet" | "longitude">;

describe("cross-chart aspect detection", () => {
  it("self-join contains every aspect detectAspects finds, with matching orbs", () => {
    const placements: Lean[] = [
      { planet: "sun", longitude: 0 },
      { planet: "moon", longitude: 92 },
      { planet: "mars", longitude: 125 },
      { planet: "saturn", longitude: 245 },
    ];
    const self = detectAspects(placements);
    const cross = detectCrossAspects(placements, placements);
    expect(self.length).toBeGreaterThan(0);
    for (const a of self) {
      const match = cross.find(
        (c) => c.a === a.a && c.b === a.b && c.type === a.type,
      );
      expect(match).toBeDefined();
      expect(match!.orb).toBeCloseTo(a.orb);
    }
  });

  it("includes same-planet pairs (transit Sun conjunct natal Sun)", () => {
    const transit: Lean[] = [{ planet: "sun", longitude: 11.5 }];
    const natal: Lean[] = [{ planet: "sun", longitude: 10 }];
    const cross = detectCrossAspects(transit, natal);
    expect(cross).toHaveLength(1);
    expect(cross[0]).toMatchObject({ a: "sun", b: "sun", type: "conjunction" });
    expect(cross[0].orb).toBeCloseTo(1.5);
  });

  it("examines the full A×B grid (2×2 all-aspecting sets yield 4 results)", () => {
    const a: Lean[] = [
      { planet: "mars", longitude: 0 },
      { planet: "venus", longitude: 90 },
    ];
    const b: Lean[] = [
      { planet: "jupiter", longitude: 180 }, // mars opp, venus square
      { planet: "saturn", longitude: 270 }, // mars square, venus opp
    ];
    const cross = detectCrossAspects(a, b);
    expect(cross).toHaveLength(4);
    expect(cross.map((c) => [c.a, c.b, c.type])).toEqual([
      ["mars", "jupiter", "opposition"],
      ["mars", "saturn", "square"],
      ["venus", "jupiter", "square"],
      ["venus", "saturn", "opposition"],
    ]);
  });

  it("applies orb limits inclusively under both natal and transit configs", () => {
    // sun–mars 3.0° apart: luminary limit is 8 (natal) / exactly 3 (transit).
    const sun3: [Lean[], Lean[]] = [
      [{ planet: "sun", longitude: 3 }],
      [{ planet: "mars", longitude: 0 }],
    ];
    expect(detectCrossAspects(...sun3)).toHaveLength(1);
    expect(detectCrossAspects(...sun3, DEFAULT_TRANSIT_ORBS)).toHaveLength(1);

    // mars–venus 2.5° apart: default limit 6 (natal) / 2 (transit) → dropped.
    const mars25: [Lean[], Lean[]] = [
      [{ planet: "mars", longitude: 2.5 }],
      [{ planet: "venus", longitude: 0 }],
    ];
    expect(detectCrossAspects(...mars25)).toHaveLength(1);
    expect(detectCrossAspects(...mars25, DEFAULT_TRANSIT_ORBS)).toHaveLength(0);

    // Luminary routing: moon–venus 2.5° passes the transit luminary limit (3).
    const moon25: [Lean[], Lean[]] = [
      [{ planet: "moon", longitude: 2.5 }],
      [{ planet: "venus", longitude: 0 }],
    ];
    expect(detectCrossAspects(...moon25, DEFAULT_TRANSIT_ORBS)).toHaveLength(1);
  });

  it("keeps only the tightest aspect per pair", () => {
    const cross = detectCrossAspects(
      [{ planet: "mars", longitude: 0 }],
      [{ planet: "saturn", longitude: 30 }], // 30° is no major aspect
    );
    expect(cross).toHaveLength(0);
  });

  it("is deterministic across calls", () => {
    const a: Lean[] = [
      { planet: "sun", longitude: 12 },
      { planet: "mercury", longitude: 100 },
      { planet: "mars", longitude: 251 },
    ];
    const b: Lean[] = [
      { planet: "moon", longitude: 14 },
      { planet: "venus", longitude: 160 },
      { planet: "pluto", longitude: 341 },
    ];
    expect(detectCrossAspects(a, b)).toEqual(detectCrossAspects(a, b));
  });
});
