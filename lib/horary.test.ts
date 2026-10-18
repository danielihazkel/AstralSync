import { describe, expect, it } from "vitest";
import type { Placement } from "@astralsync/astro-core";
import { horaryConsiderations } from "./horary";

function at(planet: Placement["planet"], longitude: number, house: number | null): Placement {
  return {
    planet,
    longitude,
    sign: "aries",
    degreeInSign: longitude % 30,
    house,
    retrograde: false,
  };
}

const quiet = [at("moon", 100, 4), at("saturn", 300, 10)];
const ids = (notes: { id: string }[]) => notes.map((n) => n.id);

describe("horaryConsiderations", () => {
  it("is silent for an unremarkable chart", () => {
    expect(horaryConsiderations({ placements: quiet, houses: { ascendant: 45 } }, null)).toEqual([]);
  });

  it("flags an early and a late Ascendant", () => {
    expect(ids(horaryConsiderations({ placements: quiet, houses: { ascendant: 61.5 } }, null))).toEqual([
      "early_ascendant",
    ]);
    expect(ids(horaryConsiderations({ placements: quiet, houses: { ascendant: 89.2 } }, null))).toEqual([
      "late_ascendant",
    ]);
  });

  it("flags a void Moon, Saturn on the 1st/7th axis and the via combusta", () => {
    const placements = [at("moon", 200, 4), at("saturn", 300, 7)];
    const notes = horaryConsiderations(
      { placements, houses: { ascendant: 45 } },
      { until: "2026-10-18T20:00:00Z", nextSign: "scorpio" },
    );
    expect(ids(notes)).toEqual(["moon_void", "saturn_seventh", "via_combusta"]);
  });

  it("bounds the via combusta at 15° Libra and 15° Scorpio", () => {
    const check = (lon: number) =>
      ids(horaryConsiderations({ placements: [at("moon", lon, 4)], houses: null }, null));
    expect(check(194.9)).toEqual([]);
    expect(check(195)).toEqual(["via_combusta"]);
    expect(check(224.9)).toEqual(["via_combusta"]);
    expect(check(225)).toEqual([]);
  });

  it("skips the Ascendant checks without houses", () => {
    expect(horaryConsiderations({ placements: quiet, houses: null }, null)).toEqual([]);
  });
});
