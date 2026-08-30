import {
  PLANETS,
  SIGNS,
  astronomyEngineProvider,
  findIngresses,
  findMundaneAspects,
  findStations,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";
import { lunarMansion, type LunarMansion } from "./lunarMansions";
import { moonPhaseFromLongitudes } from "./moonPhase";
import { computeMoonMonthCached, type MoonDayCell } from "./skyCalendar";

/**
 * One local civil day's full sky story for /calendar/[date] — computed
 * in-browser like the Sky Calendar (dynamic import only; value-imports
 * astro-core). Location-independent on purpose: the electional windows /
 * planetary hours come from lib/electional.scoreDay, which the panel calls
 * separately so location and intent changes never recompute this.
 *
 * Moon data reuses the shared month cache: first touch of a month costs the
 * same ~1s as the /calendar grid, then day-to-day navigation is free — and
 * the VoC construction stays in one place (vocWindowFor is deliberately
 * unexported).
 */

export interface AlmanacDay {
  /** Local civil date, YYYY-MM-DD (machine-local bucketing, like the grid). */
  date: string;
  moon: MoonDayCell;
  /** Phase name at local noon ("Waxing Gibbous" — illumination alone cannot
   *  tell waxing from waning). */
  phaseName: string;
  /** The lunar mansion holding the noon Moon. */
  mansion: LunarMansion;
  /** Planet-to-planet aspects perfecting this day, Moon excluded (lunar
   *  aspects are the void-of-course story). */
  mundane: Array<{ a: Planet; b: Planet; angle: number; utc: string }>;
  /** Non-moon sign ingresses this day (the Moon's are in `moon`). */
  ingresses: Array<{ planet: Planet; sign: Sign; utc: string }>;
  stations: Array<{
    planet: Planet;
    direction: "retrograde" | "direct";
    utc: string;
  }>;
}

const NON_MOON = PLANETS.filter((p) => p !== "moon");

export function computeAlmanacDay(dateStr: string): AlmanacDay {
  const [y, m, d] = dateStr.split("-").map(Number);
  const month = computeMoonMonthCached(y, m);
  const moon = month.days.find((c) => c.date === dateStr);
  if (!moon) throw new Error(`no month cell for ${dateStr}`);

  const dayStart = new Date(y, m - 1, d);
  const dayEnd = new Date(y, m - 1, d + 1);
  const noon = new Date(y, m - 1, d, 12);

  const ingresses = NON_MOON.flatMap((p) =>
    findIngresses(p, dayStart, dayEnd).map((i) => ({
      planet: p,
      sign: SIGNS[i.signIndex],
      utc: i.utc.toISOString(),
    })),
  ).sort((a, b) => a.utc.localeCompare(b.utc));

  const stations = findStations(dayStart, dayEnd).map((s) => ({
    planet: s.planet,
    direction: s.direction,
    utc: s.utc.toISOString(),
  }));

  const mundane = findMundaneAspects(dayStart, dayEnd, {
    planets: NON_MOON,
  }).map((h) => ({ a: h.a, b: h.b, angle: h.angle, utc: h.utc.toISOString() }));

  const moonNoonLon = astronomyEngineProvider.eclipticLongitude("moon", noon);
  return {
    date: dateStr,
    moon,
    phaseName: moonPhaseFromLongitudes(
      astronomyEngineProvider.eclipticLongitude("sun", noon),
      moonNoonLon,
    ),
    mansion: lunarMansion(moonNoonLon),
    mundane,
    ingresses,
    stations,
  };
}
