import { describe, expect, it } from "vitest";
import type { CrossAspect } from "@astralsync/astro-core";
import {
  isAspectActive,
  isPlanetActive,
  sameSelection,
} from "./transitSelection";

// a = transiting (outer ring), b = natal.
const aspects: CrossAspect[] = [
  { a: "saturn", b: "sun", type: "square", angle: 90, orb: 1.2 },
  { a: "jupiter", b: "moon", type: "trine", angle: 120, orb: 0.4 },
];

describe("isPlanetActive", () => {
  it("everything is active with no selection", () => {
    expect(isPlanetActive(null, aspects, "natal", "sun")).toBe(true);
  });

  it("a selected planet activates only itself on its own ring", () => {
    const sel = { kind: "planet", ring: "outer", planet: "saturn" } as const;
    expect(isPlanetActive(sel, aspects, "outer", "saturn")).toBe(true);
    expect(isPlanetActive(sel, aspects, "natal", "saturn")).toBe(false);
    expect(isPlanetActive(sel, aspects, "outer", "jupiter")).toBe(false);
  });

  it("a selected aspect activates its two endpoints ring-correctly", () => {
    const sel = { kind: "aspect", index: 0 } as const;
    expect(isPlanetActive(sel, aspects, "outer", "saturn")).toBe(true);
    expect(isPlanetActive(sel, aspects, "natal", "sun")).toBe(true);
    // Same planet name on the wrong ring stays dimmed.
    expect(isPlanetActive(sel, aspects, "natal", "saturn")).toBe(false);
    expect(isPlanetActive(sel, aspects, "outer", "sun")).toBe(false);
  });
});

describe("isAspectActive", () => {
  it("a selected planet activates only its own aspects, ring-aware", () => {
    const outerSaturn = { kind: "planet", ring: "outer", planet: "saturn" } as const;
    expect(isAspectActive(outerSaturn, aspects, 0)).toBe(true);
    expect(isAspectActive(outerSaturn, aspects, 1)).toBe(false);
    // Natal Saturn is not the transiting Saturn.
    const natalSaturn = { kind: "planet", ring: "natal", planet: "saturn" } as const;
    expect(isAspectActive(natalSaturn, aspects, 0)).toBe(false);
  });

  it("a selected aspect activates only itself", () => {
    const sel = { kind: "aspect", index: 1 } as const;
    expect(isAspectActive(sel, aspects, 1)).toBe(true);
    expect(isAspectActive(sel, aspects, 0)).toBe(false);
  });
});

describe("sameSelection", () => {
  it("matches identical planet and aspect selections only", () => {
    expect(
      sameSelection(
        { kind: "planet", ring: "outer", planet: "saturn" },
        { kind: "planet", ring: "outer", planet: "saturn" },
      ),
    ).toBe(true);
    expect(
      sameSelection(
        { kind: "planet", ring: "outer", planet: "saturn" },
        { kind: "planet", ring: "natal", planet: "saturn" },
      ),
    ).toBe(false);
    expect(
      sameSelection({ kind: "aspect", index: 2 }, { kind: "aspect", index: 2 }),
    ).toBe(true);
    expect(
      sameSelection(
        { kind: "aspect", index: 2 },
        { kind: "planet", ring: "natal", planet: "sun" },
      ),
    ).toBe(false);
  });
});
