import { find } from "geo-tz";

/**
 * Offline timezone resolution (PRD §4.3): geo-tz maps lat/lng → IANA zone,
 * then Node's built-in IANA database (via Intl) resolves the historical UTC
 * offset for the birth moment, including DST.
 *
 * Known limitation, surfaced as a warning: historical offsets before ~1970
 * are imperfect in every available database (zones often report the LMT of
 * the country's reference city, not the birth city). Onboarding must always
 * show the resolved offset and allow manual override (PRD §3.1).
 */

/** IANA timezone for coordinates, resolved fully offline. */
export function timezoneFor(lat: number, lng: number): string {
  const zones = find(lat, lng);
  if (zones.length === 0) {
    throw new Error(`No timezone found for ${lat}, ${lng}`);
  }
  return zones[0];
}

// Client-safe Intl probe, split out so lib/validation.ts (bundled with the
// onboarding wizard) never pulls this module's geo-tz dependency.
export { isValidTimeZone } from "./tzValidate";

// The geo-free half (wall time ↔ UTC), also importable on its own.
export * from "./wallTime";
