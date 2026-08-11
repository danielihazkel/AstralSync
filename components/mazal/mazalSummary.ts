import type { ClassicalPlanet, Uncertainty } from "@astralsync/hebrew-core";
import type { StoredHebrewGematria, StoredMazal } from "@/lib/view-types";
import {
  CLASSICAL_PLANET_LABELS,
  HEBREW_MONTH_LABELS,
  HEBREW_WEEKDAY_LABELS,
} from "@/components/format";

/**
 * Pure derivation of everything the Mazal summary card renders (English
 * chrome). Extracted from the panel so the render states are unit-testable
 * without a DOM: full chart, unknown-time suppression, after-sunset flip,
 * and the polar fallback all reduce to plain values here.
 */

export interface MazalSummary {
  /** Effective (sunset-adjusted) Hebrew date in traditional rendering. */
  dateDisplay: string;
  afterSunset: boolean;
  /**
   * The civil-daytime candidate when it differs from the effective date
   * (after-sunset flip) — shown alongside an ambiguity chip so both
   * candidate dates are visible. Null when the dates coincide.
   */
  alternateDate: string | null;
  monthLabel: string;
  /** astro-core sign key for the zodiac glyph. */
  sign: string;
  dayPlanet: ClassicalPlanet;
  dayPlanetLabel: string;
  /** Null when the hour is suppressed (unknown time / polar). */
  hourPlanet: ClassicalPlanet | null;
  hourLabel: string | null;
  seferLabel: string;
  dateGematria: { value: number; isMaster: boolean };
  /** Snapshot uncertainties, rendered as chips with the stored reasons. */
  chips: Uncertainty[];
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

export function buildMazalSummary(
  mazal: StoredMazal,
  gematria: StoredHebrewGematria,
): MazalSummary {
  const { hebrewDate } = mazal;
  const effective = hebrewDate.effective;
  const hour = mazal.planetaryHour;

  return {
    dateDisplay: effective.renderGematriya,
    afterSunset: hebrewDate.afterSunset,
    alternateDate: hebrewDate.afterSunset
      ? hebrewDate.civil.renderGematriya
      : null,
    monthLabel: `${cap(mazal.mazal.mazal)} — ${HEBREW_MONTH_LABELS[effective.monthKey]}`,
    sign: mazal.mazal.sign,
    dayPlanet: mazal.dayPlanet.planet,
    dayPlanetLabel: `${CLASSICAL_PLANET_LABELS[mazal.dayPlanet.planet]} — ${HEBREW_WEEKDAY_LABELS[mazal.dayPlanet.weekday]}`,
    hourPlanet: hour?.planet ?? null,
    hourLabel: hour
      ? `${CLASSICAL_PLANET_LABELS[hour.planet]} — ${hour.isDay ? "day" : "night"} hour ${hour.hourIndex} of 12`
      : null,
    seferLabel: `${mazal.seferYetzirah.letter} (${cap(mazal.seferYetzirah.letterName)}) · Tribe of ${cap(mazal.seferYetzirah.tribe)} · ${cap(mazal.seferYetzirah.faculty)}`,
    dateGematria: {
      value: gematria.dateGematria.value,
      isMaster: gematria.dateGematria.isMaster,
    },
    chips: mazal.uncertainties,
  };
}
