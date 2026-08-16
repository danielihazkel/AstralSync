import { buildChart, positionsAt } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import { pairPlacements } from "./wheelTableRows";

const natal = buildChart({
  utc: new Date(Date.UTC(1990, 2, 4, 10, 30, 0)),
  latitude: 51.48,
  longitude: 0,
  timeCertainty: "exact",
});
const moving = positionsAt(new Date(Date.UTC(2026, 7, 13)));

describe("pairPlacements", () => {
  it("pairs all ten planets in left order", () => {
    const rows = pairPlacements(natal.placements, moving);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.planet)).toEqual(
      natal.placements.map((p) => p.planet),
    );
    for (const row of rows) {
      expect(row.left.planet).toBe(row.planet);
      expect(row.right.planet).toBe(row.planet);
    }
  });

  it("preserves each side's own placement data", () => {
    const rows = pairPlacements(natal.placements, moving);
    const mercury = rows.find((r) => r.planet === "mercury")!;
    expect(mercury.left.longitude).toBe(
      natal.placements.find((p) => p.planet === "mercury")!.longitude,
    );
    expect(mercury.right.longitude).toBe(
      moving.find((p) => p.planet === "mercury")!.longitude,
    );
    // Retrograde flags come through untouched per side.
    for (const row of rows) {
      expect(row.left.retrograde).toBe(
        natal.placements.find((p) => p.planet === row.planet)!.retrograde,
      );
      expect(row.right.retrograde).toBe(
        moving.find((p) => p.planet === row.planet)!.retrograde,
      );
    }
  });

  it("drops planets missing from either side", () => {
    const rows = pairPlacements(
      natal.placements.filter((p) => p.planet !== "mars"),
      moving.filter((p) => p.planet !== "venus"),
    );
    expect(rows).toHaveLength(8);
    expect(rows.some((r) => r.planet === "mars")).toBe(false);
    expect(rows.some((r) => r.planet === "venus")).toBe(false);
  });
});
