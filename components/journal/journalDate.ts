/** Pure date helpers for the Journal tab (tested in journalDate.test.ts). */

/** Ephemeris comfort zone (~Pluto model validity): the transit route warns
 *  instants far outside ~1700–2200 may 500, so the date picker clamps. */
export const MIN_JOURNAL_DATE = "1700-01-01";
export const MAX_JOURNAL_DATE = "2199-12-31";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The browser-local civil date as "YYYY-MM-DD". */
export function todayLocalDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * "YYYY-MM-DD" → ISO instant at local (browser-timezone) noon of that day,
 * for /api/transits/[id]?at=. Noon keeps the sky representative of the whole
 * civil day: slow transiters barely move within a day, and the Moon lands
 * mid-course rather than at either midnight edge.
 */
export function localNoonIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/** Clamp a picker value into the ephemeris range; "" (cleared input) and
 *  malformed values fall back to the previous date. */
export function clampJournalDate(raw: string, previous: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return previous;
  if (raw < MIN_JOURNAL_DATE) return MIN_JOURNAL_DATE;
  if (raw > MAX_JOURNAL_DATE) return MAX_JOURNAL_DATE;
  return raw;
}
