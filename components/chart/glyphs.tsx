import type { Planet, Sign } from "@astralsync/astro-core";

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
