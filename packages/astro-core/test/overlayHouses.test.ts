import { describe, expect, it } from "vitest";
import { overlayHouses } from "../src";

/** Dedicated overlayHouses tests — the cross-chart house overlay was
 *  previously exercised only through its consumers. */

// Equal cusps starting at 340°, so house 1 spans the 0° Aries wrap.
const WRAP_CUSPS = Array.from({ length: 12 }, (_, i) => (340 + i * 30) % 360);

function at(longitude: number, house: number | null = null) {
  return { longitude, house };
}

describe("overlayHouses", () => {
  it("locates longitudes in the given cusps, including across 0°", () => {
    const out = overlayHouses(
      [at(350), at(5), at(15), at(45), at(339.9)],
      WRAP_CUSPS,
    );
    expect(out.map((p) => p.house)).toEqual([1, 1, 2, 3, 12]);
  });

  it("places a longitude exactly on a cusp in the house it opens", () => {
    const out = overlayHouses([at(340), at(10)], WRAP_CUSPS);
    expect(out.map((p) => p.house)).toEqual([1, 2]);
  });

  it("returns placements unchanged for null cusps (solar chart)", () => {
    const input = [at(120, 4), at(300, null)];
    const out = overlayHouses(input, null);
    expect(out).toBe(input); // identity, not a re-housed copy
    expect(out.map((p) => p.house)).toEqual([4, null]);
  });

  it("does not mutate its input", () => {
    const input = [at(120, null)];
    overlayHouses(input, WRAP_CUSPS);
    expect(input[0].house).toBeNull();
  });

  it("is generic over point-shaped objects", () => {
    const points = [{ point: "lilith", longitude: 200, house: null }];
    const out = overlayHouses(points, WRAP_CUSPS);
    expect(out[0].point).toBe("lilith");
    expect(out[0].house).toBe(8);
  });
});
