import type { AspectType, Planet, PointName, Sign } from "@astralsync/astro-core";

/**
 * Astrological glyphs, rendered as SVG <text> using the Unicode astrological
 * codepoints with U+FE0E (text presentation selector) so platforms don't
 * substitute emoji. System symbol fonts cover these fully offline.
 *
 * This component is the single swap point: if a platform renders them
 * poorly, replace the char maps with inline SVG path data here and nothing
 * else changes.
 */

export const PLANET_GLYPH_CHARS: Record<Planet, string> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
};

export const POINT_GLYPH_CHARS: Record<PointName, string> = {
  north_node: "☊",
  south_node: "☋",
  lilith: "⚸",
  part_of_fortune: "⊗",
};

export const SIGN_GLYPH_CHARS: Record<Sign, string> = {
  aries: "♈",
  taurus: "♉",
  gemini: "♊",
  cancer: "♋",
  leo: "♌",
  virgo: "♍",
  libra: "♎",
  scorpio: "♏",
  sagittarius: "♐",
  capricorn: "♑",
  aquarius: "♒",
  pisces: "♓",
};

export const RETROGRADE_CHAR = "℞";

/** Chord colors shared by the natal wheel and the transit overlay. */
export const ASPECT_COLOR: Record<AspectType, string> = {
  conjunction: "var(--aspect-conjunction)",
  trine: "var(--aspect-trine)",
  sextile: "var(--aspect-sextile)",
  square: "var(--aspect-square)",
  opposition: "var(--aspect-opposition)",
  // Minor aspects share one muted tone — rendered dashed, they read as a
  // family rather than five more colors competing on the wheel.
  quincunx: "var(--aspect-minor)",
  semisextile: "var(--aspect-minor)",
  semisquare: "var(--aspect-minor)",
  sesquiquadrate: "var(--aspect-minor)",
  quintile: "var(--aspect-minor)",
};

const GLYPH_FONT =
  '"Segoe UI Symbol", "Noto Sans Symbols", "Apple Symbols", serif';

export function Glyph({
  char,
  x,
  y,
  size,
  fill = "currentColor",
}: {
  char: string;
  x: number;
  y: number;
  size: number;
  fill?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fill={fill}
      fontFamily={GLYPH_FONT}
      textAnchor="middle"
      dominantBaseline="central"
      aria-hidden="true"
    >
      {char + "︎"}
    </text>
  );
}
