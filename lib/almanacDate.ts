/**
 * Pure date validation and arithmetic for the /calendar/[date] almanac.
 * Ephemeris-free on purpose: the server page shell imports this to validate
 * the route param, and must not pull astro-core into its chunk —
 * lib/almanac.ts (the ephemeris composition) stays behind a dynamic import.
 */

/** Ephemeris comfort zone (~Pluto model validity), same clamp as the
 *  journal's date picker. */
export const MIN_ALMANAC_DATE = "1700-01-01";
export const MAX_ALMANAC_DATE = "2199-12-31";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Well-formed, a real calendar date, and inside 1700–2199. */
export function isValidAlmanacDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return false;
  }
  return s >= MIN_ALMANAC_DATE && s <= MAX_ALMANAC_DATE;
}

/** Civil-date arithmetic for prev/next links; UTC-based, so DST-proof. */
export function addDaysCivil(s: string, delta: number): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
