/**
 * Moon-phase naming, extracted from lib/today.ts so phase names are available
 * without the ephemeris bundle (today.ts value-imports astronomy-engine and
 * hebrew-core). Pure and dependency-free: safe to import statically from any
 * client component — the Journal Insights view derives phases from stored
 * snapshots, the almanac from noon positions.
 */

/** Phase-angle → common name; cardinal points get a ±11.25° band. */
export function moonPhaseName(phaseDeg: number): string {
  const p = ((phaseDeg % 360) + 360) % 360;
  const band = 11.25;
  if (p < band || p >= 360 - band) return "New Moon";
  if (Math.abs(p - 90) < band) return "First Quarter";
  if (Math.abs(p - 180) < band) return "Full Moon";
  if (Math.abs(p - 270) < band) return "Third Quarter";
  if (p < 90) return "Waxing Crescent";
  if (p < 180) return "Waxing Gibbous";
  if (p < 270) return "Waning Gibbous";
  return "Waning Crescent";
}

/** Phase name from ecliptic longitudes (phase angle = Moon − Sun). */
export function moonPhaseFromLongitudes(
  sunLon: number,
  moonLon: number,
): string {
  return moonPhaseName(moonLon - sunLon);
}
