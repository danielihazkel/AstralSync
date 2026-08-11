import type { Placement, Sign } from "@astralsync/astro-core";

/**
 * Element and modality classification of the zodiac, plus the dominance
 * calculation feeding the interpretation library (PRD §3.4, §5). Lives in
 * the app layer — astro-core is pure ephemeris math and deliberately knows
 * nothing about elements. Type-only imports keep this module client-safe.
 */

export type Element = "fire" | "earth" | "air" | "water";
export type Modality = "cardinal" | "fixed" | "mutable";

/** Canonical order; also the last-resort dominance tie-break order. */
export const ELEMENTS: Element[] = ["fire", "earth", "air", "water"];

export const SIGN_ELEMENTS: Record<Sign, Element> = {
  aries: "fire",
  taurus: "earth",
  gemini: "air",
  cancer: "water",
  leo: "fire",
  virgo: "earth",
  libra: "air",
  scorpio: "water",
  sagittarius: "fire",
  capricorn: "earth",
  aquarius: "air",
  pisces: "water",
};

/** Defined for the full content taxonomy; dominance uses elements only in v1. */
export const SIGN_MODALITIES: Record<Sign, Modality> = {
  aries: "cardinal",
  taurus: "fixed",
  gemini: "mutable",
  cancer: "cardinal",
  leo: "fixed",
  virgo: "mutable",
  libra: "cardinal",
  scorpio: "fixed",
  sagittarius: "mutable",
  capricorn: "cardinal",
  aquarius: "fixed",
  pisces: "mutable",
};

export interface ElementDominance {
  /** Planets per element — surfaced in the UI as the "why" for the reading. */
  counts: Record<Element, number>;
  dominant: Element;
  /** Every element at the max count; length > 1 means a tie was broken. */
  tied: Element[];
}

/**
 * Dominant element of a chart: each of the ten planets counts once, weighted
 * equally, by the element of its sign. The Ascendant is not counted — it is
 * not a placement, and excluding it keeps solar charts (no Ascendant)
 * comparable with timed ones. Ties break deterministically toward the tied
 * element holding the Sun, then the Moon, then canonical order
 * (fire → earth → air → water), so the UI can always explain the pick.
 */
export function elementDominance(placements: Placement[]): ElementDominance {
  const counts: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  for (const p of placements) counts[SIGN_ELEMENTS[p.sign]]++;

  const max = Math.max(...ELEMENTS.map((e) => counts[e]));
  const tied = ELEMENTS.filter((e) => counts[e] === max);

  let dominant = tied[0];
  if (tied.length > 1) {
    for (const planet of ["sun", "moon"] as const) {
      const sign = placements.find((p) => p.planet === planet)?.sign;
      const element = sign && SIGN_ELEMENTS[sign];
      if (element && tied.includes(element)) {
        dominant = element;
        break;
      }
    }
  }
  return { counts, dominant, tied };
}
