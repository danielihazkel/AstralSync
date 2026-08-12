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

/** Canonical order; also the last-resort dominance tie-break order. */
export const MODALITIES: Modality[] = ["cardinal", "fixed", "mutable"];

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

export interface ModalityDominance {
  /** Planets per modality — surfaced in the UI as the "why" for the reading. */
  counts: Record<Modality, number>;
  dominant: Modality;
  /** Every modality at the max count; length > 1 means a tie was broken. */
  tied: Modality[];
}

/**
 * Shared dominance rule: each of the ten planets counts once, weighted
 * equally, by its sign's class. The Ascendant is not counted — it is not a
 * placement, and excluding it keeps solar charts (no Ascendant) comparable
 * with timed ones. Ties break deterministically toward the tied class
 * holding the Sun, then the Moon, then canonical order, so the UI can
 * always explain the pick.
 */
function dominanceBy<K extends string>(
  placements: Placement[],
  classOf: Record<Sign, K>,
  order: K[],
): { counts: Record<K, number>; dominant: K; tied: K[] } {
  const counts = Object.fromEntries(order.map((k) => [k, 0])) as Record<K, number>;
  for (const p of placements) counts[classOf[p.sign]]++;

  const max = Math.max(...order.map((k) => counts[k]));
  const tied = order.filter((k) => counts[k] === max);

  let dominant = tied[0];
  if (tied.length > 1) {
    for (const planet of ["sun", "moon"] as const) {
      const sign = placements.find((p) => p.planet === planet)?.sign;
      const cls = sign && classOf[sign];
      if (cls && tied.includes(cls)) {
        dominant = cls;
        break;
      }
    }
  }
  return { counts, dominant, tied };
}

/** Dominant element (fire → earth → air → water tie-break order). */
export function elementDominance(placements: Placement[]): ElementDominance {
  return dominanceBy(placements, SIGN_ELEMENTS, ELEMENTS);
}

/** Dominant modality (cardinal → fixed → mutable tie-break order). */
export function modalityDominance(placements: Placement[]): ModalityDominance {
  return dominanceBy(placements, SIGN_MODALITIES, MODALITIES);
}
