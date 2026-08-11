import { describe, expect, it } from "vitest";
import { detectAspects } from "../src";

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
