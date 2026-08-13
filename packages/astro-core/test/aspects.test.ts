import { describe, expect, it } from "vitest";
import {
  ALL_ASPECTS,
  MINOR_ASPECTS,
  buildChart,
  detectAspects,
  detectCrossAspects,
} from "../src";

describe("aspect detection", () => {
  it("detects a trine within default planet orb (6°)", () => {
    const aspects = detectAspects([
      { planet: "mars", longitude: 10 },
      { planet: "saturn", longitude: 135 }, // 125° apart → trine, orb 5
    ]);
    expect(aspects).toHaveLength(1);
    expect(aspects[0]).toMatchObject({ type: "trine", angle: 120 });
    expect(aspects[0].orb).toBeCloseTo(5);
  });

  it("rejects a planet-pair aspect beyond 6° but accepts it for a luminary (8°)", () => {
    const at7 = [
      { planet: "mars" as const, longitude: 0 },
      { planet: "saturn" as const, longitude: 97 }, // square, orb 7
    ];
    expect(detectAspects(at7)).toHaveLength(0);

    const withSun = [
      { planet: "sun" as const, longitude: 0 },
      { planet: "saturn" as const, longitude: 97 },
    ];
    expect(detectAspects(withSun)).toHaveLength(1);
    expect(detectAspects(withSun)[0].type).toBe("square");
  });

  it("detects conjunctions across the 0° wrap", () => {
    const aspects = detectAspects([
      { planet: "venus", longitude: 358 },
      { planet: "mars", longitude: 2 },
    ]);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe("conjunction");
    expect(aspects[0].orb).toBeCloseTo(4);
  });

  it("detects oppositions", () => {
    const aspects = detectAspects([
      { planet: "moon", longitude: 15 },
      { planet: "pluto", longitude: 198 }, // 183° → opposition, orb 3
    ]);
    expect(aspects[0].type).toBe("opposition");
  });

  it("respects a custom orb configuration", () => {
    const placements = [
      { planet: "mars" as const, longitude: 0 },
      { planet: "saturn" as const, longitude: 64 }, // sextile, orb 4
    ];
    expect(detectAspects(placements, { luminary: 8, default: 3 })).toHaveLength(0);
    expect(detectAspects(placements, { luminary: 8, default: 5 })).toHaveLength(1);
  });

  it("keeps only the tightest aspect per pair", () => {
    const aspects = detectAspects([
      { planet: "mars", longitude: 0 },
      { planet: "saturn", longitude: 30 }, // 30° is no major aspect
    ]);
    expect(aspects).toHaveLength(0);
  });
});

describe("minor aspects (opt-in)", () => {
  it("ignores minors unless the aspect list includes them", () => {
    const semisextile = [
      { planet: "mars" as const, longitude: 0 },
      { planet: "saturn" as const, longitude: 30 },
    ];
    expect(detectAspects(semisextile)).toHaveLength(0);
    const found = detectAspects(semisextile, undefined, ALL_ASPECTS);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ type: "semisextile", angle: 30 });
  });

  it("detects each minor type at its exact angle", () => {
    for (const def of MINOR_ASPECTS) {
      const found = detectAspects(
        [
          { planet: "venus", longitude: 100 },
          { planet: "mars", longitude: 100 + def.angle },
        ],
        undefined,
        MINOR_ASPECTS,
      );
      expect(found).toHaveLength(1);
      expect(found[0].type).toBe(def.type);
      expect(found[0].orb).toBeCloseTo(0);
    }
  });

  it("holds minors to the tight 2° default even for luminaries", () => {
    const at152_5 = [
      { planet: "sun" as const, longitude: 0 },
      { planet: "pluto" as const, longitude: 152.5 }, // quincunx, orb 2.5
    ];
    expect(detectAspects(at152_5, undefined, ALL_ASPECTS)).toHaveLength(0);
    expect(
      detectAspects(at152_5, { luminary: 8, default: 6, minor: 3 }, ALL_ASPECTS),
    ).toHaveLength(1);
  });

  it("prefers the tighter aspect when a separation sits between types", () => {
    // 146°: 4° from quincunx (beyond minor orb 2), 26° from trine — nothing.
    // 149°: quincunx orb 1 wins even though trine is also in the list.
    const found = detectAspects(
      [
        { planet: "venus", longitude: 0 },
        { planet: "mars", longitude: 149 },
      ],
      undefined,
      ALL_ASPECTS,
    );
    expect(found).toHaveLength(1);
    expect(found[0].type).toBe("quincunx");
  });

  it("cross grid: minors opt-in with the same tight orb", () => {
    const a = [{ planet: "saturn" as const, longitude: 45.5 }];
    const b = [{ planet: "sun" as const, longitude: 0 }];
    expect(detectCrossAspects(a, b)).toHaveLength(0);
    const found = detectCrossAspects(a, b, undefined, ALL_ASPECTS);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ type: "semisquare", angle: 45 });
    expect(found[0].orb).toBeCloseTo(0.5);
  });

  it("buildChart output is byte-identical to the majors-only engine", () => {
    // Snapshot invariance: widening the aspect engine must not change what
    // gets stored. This chart has minor-aspect separations available, yet
    // none may appear and every aspect must be a major type.
    const chart = buildChart({
      utc: new Date(Date.UTC(1990, 2, 4, 10, 30, 0)),
      latitude: 51.48,
      longitude: 0,
      timeCertainty: "exact",
    });
    const majors = ["conjunction", "sextile", "square", "trine", "opposition"];
    expect(chart.aspects.length).toBeGreaterThan(0);
    for (const a of chart.aspects) expect(majors).toContain(a.type);
    expect(chart.aspects).toEqual(detectAspects(chart.placements));
  });
});
