import { norm360, type Placement } from "@astralsync/astro-core";
import type { MoonVoidOfCourse } from "./today";

/**
 * The classical "considerations before judgment" for a chart of the
 * moment (Bonatti, Lilly): conditions under which a horary chart was said
 * to be unfit to judge, or to warn the astrologer. Pure and client-safe;
 * the moment chart shows them as cautions, never as a verdict.
 *
 * Only the widely shared ones: an Ascendant too early or too late in its
 * sign, a void-of-course Moon, Saturn in the 1st or the 7th, and the Moon
 * in the via combusta (15° Libra – 15° Scorpio).
 */

export type HoraryConsideration =
  | "early_ascendant"
  | "late_ascendant"
  | "moon_void"
  | "saturn_first"
  | "saturn_seventh"
  | "via_combusta";

export interface HoraryNote {
  id: HoraryConsideration;
  text: string;
}

/** 15° Libra through 15° Scorpio, in ecliptic longitude. */
const VIA_COMBUSTA = { from: 195, to: 225 };

export function horaryConsiderations(
  chart: { placements: Placement[]; houses: { ascendant: number } | null },
  voidOfCourse: MoonVoidOfCourse | null,
): HoraryNote[] {
  const notes: HoraryNote[] = [];
  if (chart.houses) {
    const ascDegree = norm360(chart.houses.ascendant) % 30;
    if (ascDegree < 3) {
      notes.push({
        id: "early_ascendant",
        text: `The Ascendant is only ${ascDegree.toFixed(1)}° into its sign — traditionally the matter is not yet ripe, or the question comes too soon.`,
      });
    } else if (ascDegree > 27) {
      notes.push({
        id: "late_ascendant",
        text: `The Ascendant is ${ascDegree.toFixed(1)}° into its sign — traditionally the matter is already decided, or the question comes too late to change it.`,
      });
    }
  }
  if (voidOfCourse) {
    notes.push({
      id: "moon_void",
      text: "The Moon is void of course — it perfects no further major aspect before leaving its sign: traditionally, nothing much will come of the matter.",
    });
  }
  const saturn = chart.placements.find((p) => p.planet === "saturn");
  if (saturn?.house === 1) {
    notes.push({
      id: "saturn_first",
      text: "Saturn is in the 1st house — the tradition warns that the question, or the one asking, is burdened or not entirely candid.",
    });
  } else if (saturn?.house === 7) {
    notes.push({
      id: "saturn_seventh",
      text: "Saturn is in the 7th house — the tradition warns that the astrologer's own judgment may be clouded.",
    });
  }
  const moon = chart.placements.find((p) => p.planet === "moon");
  if (moon) {
    const lon = norm360(moon.longitude);
    if (lon >= VIA_COMBUSTA.from && lon < VIA_COMBUSTA.to) {
      notes.push({
        id: "via_combusta",
        text: "The Moon is in the via combusta (15° Libra – 15° Scorpio) — traditionally a disturbed, unreliable stretch of the zodiac.",
      });
    }
  }
  return notes;
}
