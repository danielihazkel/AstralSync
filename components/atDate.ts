/**
 * Pure date helpers for every surface that pins a computation to a chosen
 * day via `?at=` — the Journal tab's "sky on date X", and the Transits and
 * Cycles tabs' instant picker. Started life in components/journal; promoted
 * here when the picker stopped being the journal's private business.
 *
 * Tested in atDate.test.ts.
 */

/** Ephemeris comfort zone (~Pluto model validity): the transit route warns
 *  instants far outside ~1700–2200 may 500, so every date picker clamps
 *  here rather than each one inventing its own bounds. */
export const MIN_AT_DATE = "1700-01-01";
export const MAX_AT_DATE = "2199-12-31";


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
 *
 * Written with the local offset ("2026-01-15T12:00:00+13:00"), never as UTC:
 * the journal and life-event schemas check that `at` falls on the civil date
 * by its first ten characters, which only holds in offset form. As a `Z`
 * string, local noon east of UTC+12 is the previous UTC day, so every save
 * from New Zealand in summer, Samoa, Tonga or Kiribati was refused.
 */
export function localNoonIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const noon = new Date(y, m - 1, d, 12, 0, 0);
  // Rounded: historical local-mean-time zones carry second-level offsets
  // that an ISO offset cannot express; a sub-minute shift is immaterial.
  const east = -Math.round(noon.getTimezoneOffset());
  const sign = east >= 0 ? "+" : "-";
  const abs = Math.abs(east);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${date}T12:00:00${offset}`;
}

/** The browser's IANA zone as a query fragment ("&tz=…"), so range routes
 *  bound the scan by the user's local days rather than UTC ones; empty when
 *  the runtime cannot name its zone (the route then falls back to UTC). */
export function tzQueryPart(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone ? `&tz=${encodeURIComponent(zone)}` : "";
  } catch {
    return "";
  }
}

/** Clamp a picker value into the ephemeris range; "" (cleared input) and
 *  malformed values fall back to the previous date. */
export function clampAtDate(raw: string, previous: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return previous;
  if (raw < MIN_AT_DATE) return MIN_AT_DATE;
  if (raw > MAX_AT_DATE) return MAX_AT_DATE;
  return raw;
}
