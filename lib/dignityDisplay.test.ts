import { describe, expect, it } from "vitest";
import type { Placement, Planet, Sign } from "@astralsync/astro-core";
import { chartDignities, hasAnyDignity } from "./dignityDisplay";

function placement(planet: Planet, sign: Sign, longitude: number): Placement {
  return {
    planet,
    longitude,
    sign,
    degreeInSign: longitude % 30,
    house: null,
    retrograde: false,
  };
}

describe("chartDignities", () => {
  it("reports essential dignity per planet", () => {
    const d = chartDignities([
      placement("sun", "aries", 10), // exaltation
      placement("mars", "capricorn", 280), // exaltation
      placement("venus", "aries", 15), // detriment
      placement("mercury", "gemini", 75), // domicile
    ]);
    expect(d.sun?.dignity).toBe("exaltation");
    expect(d.mars?.dignity).toBe("exaltation");
    expect(d.venus?.dignity).toBe("detriment");
    expect(d.mercury?.dignity).toBe("domicile");
  });

  it("gives the moderns no dignity and no solar condition", () => {
    const d = chartDignities([
      placement("sun", "leo", 130),
      placement("uranus", "leo", 131), // 1° from the Sun, but a modern
      placement("pluto", "scorpio", 220),
    ]);
    expect(d.uranus).toEqual({ dignity: null, solar: null });
    expect(d.pluto).toEqual({ dignity: null, solar: null });
  });

  it("reports solar conditions for classical non-Sun planets only", () => {
    const d = chartDignities([
      placement("sun", "leo", 130),
      placement("mercury", "leo", 130.1), // 6′ → cazimi
      placement("venus", "leo", 135), // 5° → combust
      placement("mars", "leo", 142), // 12° → under beams
      placement("jupiter", "virgo", 155), // 25° → free
    ]);
    expect(d.sun?.solar).toBeNull();
    expect(d.mercury?.solar).toBe("cazimi");
    expect(d.venus?.solar).toBe("combust");
    expect(d.mars?.solar).toBe("under_beams");
    expect(d.jupiter?.solar).toBeNull();
  });

  it("skips solar conditions when the chart has no Sun placement", () => {
    const d = chartDignities([placement("moon", "taurus", 40)]);
    expect(d.moon).toEqual({ dignity: "exaltation", solar: null });
  });
});

describe("hasAnyDignity", () => {
  it("is false for an all-neutral chart", () => {
    expect(
      hasAnyDignity(
        chartDignities([
          placement("venus", "gemini", 70),
          placement("uranus", "leo", 132),
        ]),
      ),
    ).toBe(false);
  });

  it("is true when any placement carries a dignity or solar condition", () => {
    expect(hasAnyDignity(chartDignities([placement("moon", "taurus", 40)]))).toBe(
      true,
    );
  });
});
