import type { Planet } from "./types";

/**
 * Firdaria — the Persian time-lord system: a fixed 75-year wheel of planetary
 * periods walked from birth, the sequence set once by sect. Pure table math
 * over (birth instant, day/night, now); ephemeral like profections, and
 * meaningless on a solar chart (sect needs houses).
 *
 * Convention (the common medieval ordering, e.g. Abu Ma'shar as transmitted
 * by modern sources): day births start with the Sun, night births with the
 * Moon; the nodes always follow Mars. Each planetary major period divides
 * into seven equal sub-periods starting with the major lord and continuing
 * along the planetary loop; the node periods take no sub-lords. After 75
 * years the wheel repeats.
 */

export type FirdariaLord =
  | "sun"
  | "moon"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "north_node"
  | "south_node";

/** The seven planetary lords in firdaria loop order (day-sequence order —
 *  sub-periods walk this loop from the major lord). */
const PLANET_LOOP: readonly (FirdariaLord & Planet)[] = [
  "sun",
  "venus",
  "mercury",
  "moon",
  "saturn",
  "jupiter",
  "mars",
];

export const FIRDARIA_YEARS: Record<FirdariaLord, number> = {
  sun: 10,
  venus: 8,
  mercury: 13,
  moon: 9,
  saturn: 11,
  jupiter: 12,
  mars: 7,
  north_node: 3,
  south_node: 2,
};

/** One full cycle: the nine periods sum to 75 years. */
export const FIRDARIA_CYCLE_YEARS = 75;

const DAY_MS = 86_400_000;
/** Same day-for-a-year tropical year the progression math uses. */
const TROPICAL_YEAR_DAYS = 365.2425;
const YEAR_MS = TROPICAL_YEAR_DAYS * DAY_MS;

/** Major-period order for a day or night birth (nodes after Mars in both). */
export function firdariaSequence(isDay: boolean): FirdariaLord[] {
  const day: FirdariaLord[] = [...PLANET_LOOP, "north_node", "south_node"];
  if (isDay) return day;
  // Night starts from the Moon and wraps: Moon…Mars, nodes, then Sun…Mercury.
  const moonIndex = day.indexOf("moon");
  return [...day.slice(moonIndex), ...day.slice(0, moonIndex)];
}

export interface FirdariaPeriod {
  lord: FirdariaLord;
  /** UTC bounds of the period ([start, end)). */
  startUtc: string;
  endUtc: string;
}

export interface CurrentFirdaria {
  /** True when the 75-year wheel has completed at least once. */
  secondCycle: boolean;
  major: FirdariaPeriod;
  /** Null during the node periods, which take no sub-lords. */
  sub: (FirdariaPeriod & { lord: FirdariaLord & Planet }) | null;
  /** All nine major periods of the current cycle, for the timeline. */
  cycle: FirdariaPeriod[];
}

/**
 * The firdaria in effect at `at`. Years are tropical (365.2425 d) from the
 * birth instant, the same clock as the progressions; the wheel repeats every
 * 75 years, so a 76-year-old is back in the opening period.
 */
export function currentFirdaria(
  birthUtc: Date,
  isDay: boolean,
  at: Date,
): CurrentFirdaria | null {
  const elapsedMs = at.getTime() - birthUtc.getTime();
  if (elapsedMs < 0) return null;

  const cycleMs = FIRDARIA_CYCLE_YEARS * YEAR_MS;
  const cycleIndex = Math.floor(elapsedMs / cycleMs);
  const cycleStartMs = birthUtc.getTime() + cycleIndex * cycleMs;
  const intoCycleMs = elapsedMs - cycleIndex * cycleMs;

  const sequence = firdariaSequence(isDay);
  const cycle: FirdariaPeriod[] = [];
  let offsetMs = 0;
  let major: FirdariaPeriod | null = null;
  let majorLord: FirdariaLord | null = null;
  let majorStartMs = 0;
  let majorMs = 0;
  for (const lord of sequence) {
    const lengthMs = FIRDARIA_YEARS[lord] * YEAR_MS;
    const period: FirdariaPeriod = {
      lord,
      startUtc: new Date(cycleStartMs + offsetMs).toISOString(),
      endUtc: new Date(cycleStartMs + offsetMs + lengthMs).toISOString(),
    };
    cycle.push(period);
    if (major === null && intoCycleMs < offsetMs + lengthMs) {
      major = period;
      majorLord = lord;
      majorStartMs = cycleStartMs + offsetMs;
      majorMs = lengthMs;
    }
    offsetMs += lengthMs;
  }
  // intoCycleMs < cycleMs by construction, so a major always matched.
  if (!major || !majorLord) return null;

  let sub: CurrentFirdaria["sub"] = null;
  if (majorLord !== "north_node" && majorLord !== "south_node") {
    const subMs = majorMs / PLANET_LOOP.length;
    const subIndex = Math.min(
      Math.floor((at.getTime() - majorStartMs) / subMs),
      PLANET_LOOP.length - 1,
    );
    const loopStart = PLANET_LOOP.indexOf(majorLord);
    const lord = PLANET_LOOP[(loopStart + subIndex) % PLANET_LOOP.length];
    sub = {
      lord,
      startUtc: new Date(majorStartMs + subIndex * subMs).toISOString(),
      endUtc: new Date(majorStartMs + (subIndex + 1) * subMs).toISOString(),
    };
  }

  return { secondCycle: cycleIndex > 0, major, sub, cycle };
}
