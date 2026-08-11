import { buildChart } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import { computeTransits } from "./transits";
import type { WheelChart } from "./view-types";

const AT = new Date(Date.UTC(2026, 7, 11, 12, 0, 0));

function natalChart(overrides?: {
  timeCertainty?: "exact" | "approx" | "unknown";
}): WheelChart {
  const chart = buildChart({
    utc: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
    latitude: 51.48,
    longitude: 0,
    timeCertainty: overrides?.timeCertainty ?? "exact",
  });
  return { ...chart, tzWarnings: [] };
}

describe("computeTransits", () => {
  it("is deterministic and echoes the computed instant", () => {
    const natal = natalChart();
    const a = computeTransits(natal, 1, AT);
    const b = computeTransits(natal, 1, AT);
    expect(a).toEqual(b);
    expect(a.computedAt).toBe(AT.toISOString());
    expect(a.natal).toEqual({
      version: 1,
      isSolarChart: false,
      moonUncertain: false,
    });
    expect(a.engine.name).toBe("astronomy-engine");
  });

  it("sorts cross aspects by orb, tightest first", () => {
    const view = computeTransits(natalChart(), 1, AT);
    expect(view.crossAspects.length).toBeGreaterThan(0);
    for (let i = 1; i < view.crossAspects.length; i++) {
      expect(view.crossAspects[i].orb).toBeGreaterThanOrEqual(
        view.crossAspects[i - 1].orb,
      );
    }
  });

  it("overlays natal houses onto transiting placements for a housed natal", () => {
    const view = computeTransits(natalChart(), 1, AT);
    for (const p of view.placements) {
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
    }
  });

  it("suppresses the house overlay for a solar natal", () => {
    const view = computeTransits(
      natalChart({ timeCertainty: "unknown" }),
      1,
      AT,
    );
    expect(view.natal.isSolarChart).toBe(true);
    for (const p of view.placements) expect(p.house).toBeNull();
  });

  it("surfaces the natal moon_sign uncertainty flag", () => {
    const natal = natalChart();
    const uncertain: WheelChart = {
      ...natal,
      uncertainties: [
        ...natal.uncertainties,
        { field: "moon_sign", reason: "test: Moon near a sign boundary" },
      ],
    };
    expect(computeTransits(uncertain, 1, AT).natal.moonUncertain).toBe(true);
  });

  it("applies transit orbs, not natal orbs", () => {
    // Against DEFAULT_ORBS (8/6) many more pairs qualify than under the
    // transit config (3/2); every reported orb must respect the tight limits.
    const view = computeTransits(natalChart(), 1, AT);
    for (const c of view.crossAspects) {
      const limit = c.a === "sun" || c.a === "moon" || c.b === "sun" || c.b === "moon" ? 3 : 2;
      expect(c.orb).toBeLessThanOrEqual(limit);
    }
  });
});
