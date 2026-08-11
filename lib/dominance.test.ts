import { describe, expect, it } from "vitest";
import type { Placement, Planet, Sign } from "@astralsync/astro-core";
import {
  ELEMENTS,
  SIGN_ELEMENTS,
  SIGN_MODALITIES,
  elementDominance,
} from "./dominance";

function placement(planet: Planet, sign: Sign): Placement {
  return {
    planet,
    sign,
    longitude: 0,
    degreeInSign: 0,
    house: null,
    retrograde: false,
  };
}

const PLANET_ORDER: Planet[] = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

/** Build a 10-planet chart by assigning signs in order. */
function chart(signs: Sign[]): Placement[] {
  return PLANET_ORDER.map((p, i) => placement(p, signs[i % signs.length]));
}

describe("sign classification maps", () => {
  it("classifies all 12 signs into elements, 3 per element", () => {
    const bySign = Object.values(SIGN_ELEMENTS);
    expect(bySign).toHaveLength(12);
    for (const element of ELEMENTS) {
      expect(bySign.filter((e) => e === element)).toHaveLength(3);
    }
  });

  it("classifies all 12 signs into modalities, 4 per modality", () => {
    const bySign = Object.values(SIGN_MODALITIES);
    expect(bySign).toHaveLength(12);
    for (const modality of ["cardinal", "fixed", "mutable"] as const) {
      expect(bySign.filter((m) => m === modality)).toHaveLength(4);
    }
  });

  it("agrees with the classical assignments on spot checks", () => {
    expect(SIGN_ELEMENTS.leo).toBe("fire");
    expect(SIGN_ELEMENTS.capricorn).toBe("earth");
    expect(SIGN_ELEMENTS.aquarius).toBe("air");
    expect(SIGN_ELEMENTS.scorpio).toBe("water");
    expect(SIGN_MODALITIES.aries).toBe("cardinal");
    expect(SIGN_MODALITIES.taurus).toBe("fixed");
    expect(SIGN_MODALITIES.pisces).toBe("mutable");
  });
});

describe("elementDominance", () => {
  it("counts each planet once by its sign's element", () => {
    // 4 fire (sun, mars, jupiter, neptune), 3 earth, 2 air, 1 water
    const placements = [
      placement("sun", "aries"),
      placement("moon", "taurus"),
      placement("mercury", "gemini"),
      placement("venus", "virgo"),
      placement("mars", "leo"),
      placement("jupiter", "sagittarius"),
      placement("saturn", "capricorn"),
      placement("uranus", "libra"),
      placement("neptune", "aries"),
      placement("pluto", "scorpio"),
    ];
    const d = elementDominance(placements);
    expect(d.counts).toEqual({ fire: 4, earth: 3, air: 2, water: 1 });
    expect(d.dominant).toBe("fire");
    expect(d.tied).toEqual(["fire"]);
  });

  it("breaks a two-way tie toward the element holding the Sun", () => {
    // 5 water (incl. sun), 5 air (incl. moon)
    const placements = chart(["cancer", "gemini"]);
    const d = elementDominance(placements);
    expect(d.counts.water).toBe(5);
    expect(d.counts.air).toBe(5);
    expect(d.tied).toEqual(["air", "water"]);
    expect(d.dominant).toBe("water");
  });

  it("falls to the Moon's element when the Sun is outside the tie", () => {
    // sun earth(1); moon air; tie between air and water at 4; earth not tied
    const placements = [
      placement("sun", "taurus"),
      placement("moon", "libra"),
      placement("mercury", "gemini"),
      placement("venus", "aquarius"),
      placement("mars", "gemini"),
      placement("jupiter", "cancer"),
      placement("saturn", "scorpio"),
      placement("uranus", "pisces"),
      placement("neptune", "cancer"),
      placement("pluto", "capricorn"),
    ];
    const d = elementDominance(placements);
    expect(d.counts).toEqual({ fire: 0, earth: 2, air: 4, water: 4 });
    expect(d.dominant).toBe("air");
  });

  it("falls to canonical order when neither luminary is in the tie", () => {
    // sun+moon fire(2); earth 4, water 4 tie; earth precedes water canonically
    const placements = [
      placement("sun", "aries"),
      placement("moon", "leo"),
      placement("mercury", "taurus"),
      placement("venus", "virgo"),
      placement("mars", "capricorn"),
      placement("jupiter", "taurus"),
      placement("saturn", "cancer"),
      placement("uranus", "scorpio"),
      placement("neptune", "pisces"),
      placement("pluto", "cancer"),
    ];
    const d = elementDominance(placements);
    expect(d.counts).toEqual({ fire: 2, earth: 4, air: 0, water: 4 });
    expect(d.dominant).toBe("earth");
  });

  it("is indifferent to house data (solar charts behave identically)", () => {
    const timed = chart(["leo", "virgo"]).map((p, i) => ({ ...p, house: i + 1 }));
    const solar = chart(["leo", "virgo"]);
    expect(elementDominance(timed)).toEqual(elementDominance(solar));
  });
});
