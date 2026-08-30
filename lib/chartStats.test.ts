import { describe, expect, it } from "vitest";
import { PLANETS, SIGNS, type Placement, type Planet } from "@astralsync/astro-core";
import {
  chartShape,
  dispositors,
  elementBalance,
  hemisphereEmphasis,
  houseRulers,
  modalityBalance,
} from "./chartStats";

/** Placements from a longitude per planet; houses from an equal-house wheel
 *  with the Ascendant at 0° Aries unless given. */
function chart(
  lons: Partial<Record<Planet, number>>,
  houseOf: ((lon: number) => number | null) | null = (lon) =>
    Math.floor((((lon % 360) + 360) % 360) / 30) + 1,
): Placement[] {
  return PLANETS.map((planet) => {
    const longitude = lons[planet] ?? 0;
    return {
      planet,
      longitude,
      sign: SIGNS[Math.floor((((longitude % 360) + 360) % 360) / 30)],
      degreeInSign: longitude % 30,
      house: houseOf ? houseOf(longitude) : null,
      retrograde: false,
    };
  });
}

function spread(lons: number[]): Partial<Record<Planet, number>> {
  return Object.fromEntries(PLANETS.map((p, i) => [p, lons[i]]));
}

describe("hemisphereEmphasis", () => {
  it("counts east/west and north/south by house", () => {
    // Six planets in houses 10–3 (east), four in 4–9; seven below (1–6).
    const h = hemisphereEmphasis(
      chart(spread([5, 35, 65, 95, 125, 155, 185, 275, 305, 335])),
    )!;
    expect(h).toEqual({
      east: 6,
      west: 4,
      north: 6,
      south: 4,
      eastWest: "east",
      northSouth: "north",
    });
  });

  it("is null without houses and reports ties as null", () => {
    expect(hemisphereEmphasis(chart({}, null))).toBeNull();
    const tie = hemisphereEmphasis(
      chart(spread([5, 35, 65, 95, 125, 185, 215, 245, 275, 305])),
    )!;
    expect(tie.eastWest).toBeNull();
  });
});

describe("chartShape", () => {
  it("bundle: everything within 120°", () => {
    const s = chartShape(chart(spread([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])));
    expect(s.type).toBe("bundle");
    expect(s.leading).toBe("sun");
  });

  it("bowl: everything within a half", () => {
    const s = chartShape(chart(spread([0, 20, 40, 60, 80, 100, 120, 140, 160, 175])));
    expect(s.type).toBe("bowl");
    expect(s.largestGap).toBe(185);
  });

  it("bucket: a bowl plus one handle opposite", () => {
    const s = chartShape(
      chart(spread([0, 20, 40, 60, 80, 100, 120, 140, 160, 270])),
    );
    expect(s.type).toBe("bucket");
    expect(s.handle).toBe("pluto");
  });

  it("locomotive: an empty third", () => {
    const s = chartShape(chart(spread([0, 25, 50, 75, 100, 125, 150, 175, 200, 235])));
    expect(s.type).toBe("locomotive");
  });

  it("seesaw: two groups across two empty arcs", () => {
    const s = chartShape(chart(spread([0, 15, 30, 45, 60, 180, 195, 210, 225, 240])));
    expect(s.type).toBe("seesaw");
  });

  it("splash: no empty arc of 60°", () => {
    const s = chartShape(chart(spread([0, 36, 72, 108, 144, 180, 216, 252, 288, 324])));
    expect(s.type).toBe("splash");
  });

  it("splay: three clumps", () => {
    const s = chartShape(chart(spread([0, 10, 20, 120, 130, 140, 240, 250, 260, 265])));
    expect(s.type).toBe("splay");
  });
});

describe("element/modality balance", () => {
  it("lists missing and weak classes", () => {
    // Nine planets in fire signs, one in Taurus (earth).
    const b = elementBalance(
      chart(spread([0, 5, 10, 125, 130, 135, 245, 250, 255, 35])),
    );
    expect(b.missing).toEqual(["air", "water"]);
    expect(b.weak).toEqual(["earth"]);
    expect(b.counts.fire).toBe(9);
    const m = modalityBalance(chart(spread([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])));
    expect(m.missing).toEqual(["fixed", "mutable"]);
  });
});

describe("dispositors", () => {
  it("finds a final dispositor and self-disposition", () => {
    // Everything in Leo except the Sun, also in Leo → Sun is the final
    // dispositor of all.
    const d = dispositors(chart(spread([125, 130, 135, 140, 145, 150, 120, 121, 122, 123])));
    expect(d.inDomicile).toEqual(["sun"]);
    expect(d.finalDispositor).toBe("sun");
    expect(d.mutualReceptions).toEqual([]);
  });

  it("detects mutual reception and refuses a final dispositor", () => {
    // Sun in Cancer (ruled by Moon), Moon in Leo (ruled by Sun): reception.
    // Mars in Aries disposes itself but the Sun/Moon loop never reaches it.
    const d = dispositors(
      chart({
        sun: 100,
        moon: 130,
        mars: 10,
        mercury: 100,
        venus: 100,
        jupiter: 100,
        saturn: 100,
        uranus: 100,
        neptune: 100,
        pluto: 100,
      }),
    );
    expect(d.mutualReceptions).toEqual([["sun", "moon"]]);
    expect(d.inDomicile).toEqual(["mars"]);
    expect(d.finalDispositor).toBeNull();
  });
});

describe("houseRulers", () => {
  it("maps each cusp sign to its ruler and the ruler's house", () => {
    const placements = chart({ mars: 95, venus: 200 });
    const cusps = Array.from({ length: 12 }, (_, i) => i * 30);
    const rulers = houseRulers(
      { system: "equal", requestedSystem: "equal", fallbackApplied: false, cusps, ascendant: 0, mc: 270 },
      placements,
    )!;
    expect(rulers[0]).toMatchObject({ house: 1, cuspSign: "aries", ruler: "mars", rulerHouse: 4, rulerSign: "cancer", modernRuler: null });
    expect(rulers[7]).toMatchObject({ house: 8, cuspSign: "scorpio", ruler: "mars", modernRuler: "pluto" });
    expect(rulers[6]).toMatchObject({ house: 7, cuspSign: "libra", ruler: "venus", rulerHouse: 7 });
    expect(houseRulers(null, placements)).toBeNull();
  });
});
